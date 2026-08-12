import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const SCHEMA_VERSION = 3;

/** Absolute path to the SQLite file. Override with DATABASE_PATH. */
export const DB_PATH =
  process.env.DATABASE_PATH ?? join(here, '..', '..', 'data', 'client-ops.db');

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

  return db;
}

/**
 * Brings an existing database up to SCHEMA_VERSION. The CREATE TABLE statements
 * in schema.sql only apply to fresh databases, so anything that changes an
 * existing table has to be applied here too.
 */
function migrate(db: Db, from: number): void {
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
