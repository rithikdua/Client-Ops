import Database from 'better-sqlite3';
import { envString } from '../config';
import { ASSIGNMENT_COLUMNS, linkAssignmentsByName } from '../domain/assignees';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const SCHEMA_VERSION = 14;

/** Absolute path to the SQLite file. Override with DATABASE_PATH. */
export const DB_PATH = envString('DATABASE_PATH', join(here, '..', '..', 'data', 'client-ops.db'));

export type Db = Database.Database;

/**
 * Opens the database, applies the schema, and returns the handle. Safe to call
 * repeatedly: the schema is written with IF NOT EXISTS.
 */
export function openDb(path: string = DB_PATH): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  // WAL keeps reads from blocking writes; FKs are off by default in SQLite and
  // we rely on ON DELETE CASCADE.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));

  const row = db.prepare('SELECT version FROM schema_version').get() as
    | { version: number }
    | undefined;
  if (!row) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  } else if (row.version < SCHEMA_VERSION) {
    migrate(db, row.version);
    db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
  }

  ensureInvoiceNumberIndex(db);

  return db;
}

/**
 * Adds the unique invoice-number constraint, unless the data already breaks it.
 *
 * An invoice number is the reference a payment is matched by — in the bank
 * statement, in the client's ledger, in the email chasing it — so two invoices
 * on one account sharing a number makes all of those ambiguous. New ones are
 * refused by the route regardless; this is the database saying the same thing.
 *
 * It is deliberately not in schema.sql, which is executed on every open: a
 * workspace that already contains duplicates would then fail to start, turning a
 * data-quality problem into an outage. Renumbering someone's invoices
 * automatically would be worse still, so the duplicates are named and left
 * alone.
 */
function ensureInvoiceNumberIndex(db: Db): void {
  const duplicates = db
    .prepare(
      `SELECT client_id, number, COUNT(*) AS n FROM invoices
        GROUP BY client_id, number HAVING n > 1`,
    )
    .all() as { client_id: string; number: string; n: number }[];

  if (duplicates.length === 0) {
    db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_client_number ON invoices(client_id, number)',
    );
    return;
  }

  console.warn(
    '[client-ops] duplicate invoice numbers found, so the uniqueness constraint was not added. ' +
      'New duplicates are still refused. Renumber these and restart: ' +
      duplicates.map((d) => `${d.number} (client ${d.client_id}, ${d.n} copies)`).join(', '),
  );
}

/**
 * Brings an existing database up to SCHEMA_VERSION. The CREATE TABLE statements
 * in schema.sql only apply to fresh databases, so anything that changes an
 * existing table has to be applied here too.
 */
function migrate(db: Db, from: number): void {
  if (from < 14) {
    // v14: deleting archives instead of destroying. Existing rows are all live,
    // which NULL already means, so there is nothing to backfill.
    for (const table of [
      'clients',
      'contacts',
      'invoices',
      'deliverables',
      'documents',
      'tasks',
      'follow_ups',
    ]) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!columns.some((c) => c.name === 'archived_at')) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN archived_at TEXT`);
      }
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_invoices_live ON invoices(client_id, archived_at);
      CREATE INDEX IF NOT EXISTS idx_deliverables_live ON deliverables(client_id, archived_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_live ON tasks(client_id, archived_at);
    `);
  }
  if (from < 13) {
    // v13: attachments become a relation instead of four columns of URL text.
    //
    // The backfill parses those URLs one last time. That is the same regular
    // expression whose fallibility caused the problem, but running it here is a
    // different proposition: it happens once, on data that is all still present,
    // and anything it fails to match is recorded as an external link rather than
    // deleted. The old columns go afterwards so there is exactly one place an
    // attachment lives — the mistake the name columns in v11 taught.
    db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id             TEXT PRIMARY KEY,
        invoice_id     TEXT REFERENCES invoices(id) ON DELETE CASCADE,
        deliverable_id TEXT REFERENCES deliverables(id) ON DELETE CASCADE,
        document_id    TEXT REFERENCES documents(id) ON DELETE CASCADE,
        task_id        TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        upload_id      TEXT REFERENCES uploads(id) ON DELETE CASCADE,
        external_url   TEXT,
        name           TEXT NOT NULL DEFAULT '',
        created_at     TEXT NOT NULL,
        CHECK ((invoice_id IS NOT NULL) + (deliverable_id IS NOT NULL)
             + (document_id IS NOT NULL) + (task_id IS NOT NULL) = 1),
        CHECK ((upload_id IS NOT NULL) + (external_url IS NOT NULL) = 1)
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_invoice ON attachments(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_deliverable ON attachments(deliverable_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_document ON attachments(document_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_upload ON attachments(upload_id);
    `);

    const hasColumn = (table: string, name: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
        (c) => c.name === name,
      );
    const tableExists = (name: string) =>
      !!db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(name);

    const carryOver = (
      ownerColumn: string,
      rows: { id: string; url: string | null; name: string | null }[],
    ) => {
      const insert = db.prepare(
        `INSERT INTO attachments (id, ${ownerColumn}, upload_id, external_url, name, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const findUpload = db.prepare('SELECT id, original_name FROM uploads WHERE filename = ?');
      for (const row of rows) {
        const url = (row.url ?? '').trim();
        if (!url) continue;
        const match = /^\/api\/uploads\/([^/?#]+)$/.exec(url);
        const upload = match
          ? (findUpload.get(decodeURIComponent(match[1])) as
              | { id: string; original_name: string }
              | undefined)
          : undefined;
        insert.run(
          newId(),
          row.id,
          upload?.id ?? null,
          upload ? null : url,
          (row.name ?? '').trim() || upload?.original_name || '',
          new Date().toISOString(),
        );
      }
    };

    if (hasColumn('invoices', 'file_url')) {
      carryOver(
        'invoice_id',
        db
          .prepare('SELECT id, file_url AS url, file_name AS name FROM invoices')
          .all() as { id: string; url: string | null; name: string | null }[],
      );
      db.exec('ALTER TABLE invoices DROP COLUMN file_url');
      db.exec('ALTER TABLE invoices DROP COLUMN file_name');
    }
    if (hasColumn('deliverables', 'file_url')) {
      carryOver(
        'deliverable_id',
        db
          .prepare('SELECT id, file_url AS url, file_name AS name FROM deliverables')
          .all() as { id: string; url: string | null; name: string | null }[],
      );
      db.exec('ALTER TABLE deliverables DROP COLUMN file_url');
      db.exec('ALTER TABLE deliverables DROP COLUMN file_name');
    }
    if (hasColumn('documents', 'url')) {
      // A document's own name is the label; there is no separate file name.
      carryOver(
        'document_id',
        db.prepare('SELECT id, url, name FROM documents').all() as {
          id: string;
          url: string | null;
          name: string | null;
        }[],
      );
      db.exec('ALTER TABLE documents DROP COLUMN url');
    }
    if (tableExists('task_attachments')) {
      carryOver(
        'task_id',
        db.prepare('SELECT task_id AS id, url, NULL AS name FROM task_attachments').all() as {
          id: string;
          url: string | null;
          name: string | null;
        }[],
      );
      db.exec('DROP TABLE task_attachments');
    }
  }
  if (from < 12) {
    // v12: a replayed request answers with what the first one actually said,
    // so the columns to remember it in. Existing rows stay NULL and are treated
    // as never having completed — they are at most a week old and their
    // originals are long since finished, so a retry of one is a request nobody
    // is waiting on.
    const columns = db.prepare('PRAGMA table_info(idempotency_keys)').all() as { name: string }[];
    const has = (name: string) => columns.some((c) => c.name === name);
    if (!has('status_code')) db.exec('ALTER TABLE idempotency_keys ADD COLUMN status_code INTEGER');
    if (!has('response_body')) db.exec('ALTER TABLE idempotency_keys ADD COLUMN response_body TEXT');
    if (!has('completed_at')) db.exec('ALTER TABLE idempotency_keys ADD COLUMN completed_at TEXT');
  }
  if (from < 11) {
    // v11: assignments point at accounts, not at whatever the name was that day.
    for (const [table, , idColumn] of ASSIGNMENT_COLUMNS) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!columns.some((c) => c.name === idColumn)) {
        db.exec(
          `ALTER TABLE ${table} ADD COLUMN ${idColumn} TEXT REFERENCES users(id) ON DELETE SET NULL`,
        );
      }
    }
    linkAssignmentsByName(db);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_clients_owner_user ON clients(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_deliverables_owner_user ON deliverables(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_assignee_user ON tasks(assignee_user_id);
      CREATE INDEX IF NOT EXISTS idx_follow_ups_owner_user ON follow_ups(owner_user_id);
    `);
  }
  if (from < 10) {
    // v10: the Google address is recorded separately instead of overwriting the
    // account's own email.
    const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'google_email')) {
      db.exec('ALTER TABLE users ADD COLUMN google_email TEXT');
    }
  }
  // v9 (unique invoice numbers) is applied by ensureInvoiceNumberIndex on every
  // open, since it has to be conditional on the data.
  if (from < 8) {
    // v8: optimistic concurrency. Existing rows start at version 1.
    for (const table of ['clients', 'tasks', 'deliverables', 'follow_ups']) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!columns.some((c) => c.name === 'version')) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
      }
    }
  }
  if (from < 7) {
    // v7: idempotency keys, so one user intent cannot become two records.
    db.exec(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key          TEXT NOT NULL,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint     TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        PRIMARY KEY (key, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
    `);
  }
  if (from < 6) {
    // v6: an attachment belongs to the section it is attached to, not always to
    // `clients`. Existing rows are relabelled from whatever references them, so
    // an invoices-only teammate can open an invoice's own PDF. Filenames are
    // generated UUIDs, which makes the suffix match safe.
    //
    // Expressed against `attachments` rather than the four URL columns this
    // originally read: v13 runs before this block and has already moved those
    // rows across and dropped the columns. It is also the better question —
    // "which upload does this attachment point at" instead of a suffix match
    // against a URL string.
    for (const [section, column] of [
      ['invoices', 'invoice_id'],
      ['deliverables', 'deliverable_id'],
      ['documents', 'document_id'],
    ] as const) {
      db.prepare(
        `UPDATE uploads SET section = ?
          WHERE section = 'clients'
            AND EXISTS (
              SELECT 1 FROM attachments
               WHERE attachments.upload_id = uploads.id AND attachments.${column} IS NOT NULL
            )`,
      ).run(section);
    }
  }
  if (from < 5) {
    // v5: audit trail for deletions and account administration.
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id           TEXT PRIMARY KEY,
        at           TEXT NOT NULL,
        actor_id     TEXT,
        actor_name   TEXT NOT NULL DEFAULT '',
        actor_email  TEXT NOT NULL DEFAULT '',
        acting_as_id TEXT,
        action       TEXT NOT NULL,
        target_type  TEXT NOT NULL DEFAULT '',
        target_id    TEXT NOT NULL DEFAULT '',
        target_label TEXT NOT NULL DEFAULT '',
        detail       TEXT NOT NULL DEFAULT '',
        ip           TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_at ON audit_log(at);
      CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
    `);
  }
  if (from < 4) {
    // v4: credential lifecycle — forced password change and reset links.
    const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    if (!userColumns.some((c) => c.name === 'must_change_password')) {
      db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at    TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
    `);
  }
  if (from < 3) {
    // v3: uploads become owned records so downloads can be authorized.
    db.exec(`
      CREATE TABLE IF NOT EXISTS uploads (
        id            TEXT PRIMARY KEY,
        filename      TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL DEFAULT '',
        mime          TEXT NOT NULL,
        size_bytes    INTEGER NOT NULL,
        client_id     TEXT REFERENCES clients(id) ON DELETE CASCADE,
        section       TEXT NOT NULL DEFAULT 'clients',
        uploaded_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_uploads_client ON uploads(client_id);
      CREATE INDEX IF NOT EXISTS idx_uploads_uploader ON uploads(uploaded_by);
    `);
  }
  if (from < 2) {
    // v2: Google sign-in. `google_sub` links a Google identity to an account.
    const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'google_sub')) {
      db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
    }
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)
         WHERE google_sub IS NOT NULL`,
    );
  }
}

export function newId(): string {
  return randomUUID();
}

/** Runs `fn` in a transaction, rolling back if it throws. */
export function transact<T>(db: Db, fn: () => T): T {
  return db.transaction(fn)();
}
