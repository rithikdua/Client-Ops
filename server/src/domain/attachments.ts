import { unlinkSync } from 'node:fs';
import type { Db } from '../db/index';
import { newId, transact } from '../db/index';

/**
 * Files and links attached to invoices, deliverables, documents and tasks.
 *
 * These were four unrelated URL columns, and nothing connected a stored URL to
 * the upload it pointed at. The consequences were the ones you get whenever a
 * reference is a string rather than a reference:
 *
 *   - "Is this uploaded file still in use?" was answered by reading every URL
 *     in four tables and pulling a filename out with a regular expression. A URL
 *     written even slightly differently did not match, and the sweeper then
 *     deleted a file something was still pointing at. Silent, and unrecoverable.
 *   - Deleting a deliverable left its file behind until a sweep noticed, which
 *     is fine, but deleting the *upload* row left the URL string in place
 *     pointing at nothing, which is not.
 *   - Nothing could ask the reverse question — what is this file attached to —
 *     because the answer only existed inside a regex.
 *
 * An attachment now references its upload by id, so both questions are joins,
 * and the owner columns are real foreign keys, so a cascade deletes the
 * attachment along with whatever it hung off. In the same transaction, without
 * any code remembering to.
 *
 * Files on disk are deliberately *not* deleted here. See `commitThenDelete`.
 */

/** The four things something can be attached to. */
export type AttachmentOwner =
  | { invoiceId: string }
  | { deliverableId: string }
  | { documentId: string }
  | { taskId: string };

export interface Attachment {
  id: string;
  name: string;
  /** Always a URL the browser can use, whether we hold the file or not. */
  url: string;
  /** Set when we hold the file; absent for a link to somewhere else. */
  uploadId?: string;
}

const OWNER_COLUMNS = {
  invoiceId: 'invoice_id',
  deliverableId: 'deliverable_id',
  documentId: 'document_id',
  taskId: 'task_id',
} as const;

function ownerColumn(owner: AttachmentOwner): { column: string; id: string } {
  for (const [key, column] of Object.entries(OWNER_COLUMNS)) {
    const id = (owner as Record<string, string | undefined>)[key];
    if (id) return { column, id };
  }
  throw new Error('An attachment must belong to something.');
}

/** The URL an upload is served from. The one place this shape is written. */
export const uploadUrl = (filename: string) => `/api/uploads/${filename}`;

/**
 * The upload a URL refers to, if it refers to one of ours.
 *
 * Parsing a URL still happens — clients send URLs, and the attach form accepts a
 * pasted address — but it happens *once*, when the attachment is created, and
 * the result is stored as an id. The difference matters: getting it wrong here
 * means an attachment recorded as an external link, which is visible and
 * fixable. Getting it wrong at sweep time meant deleting a file in use.
 */
export function resolveUpload(db: Db, url: string): { id: string; name: string } | null {
  const match = /^\/api\/uploads\/([^/?#]+)$/.exec(url.trim());
  if (!match) return null;
  const row = db
    .prepare('SELECT id, original_name FROM uploads WHERE filename = ?')
    .get(decodeURIComponent(match[1])) as { id: string; original_name: string } | undefined;
  return row ? { id: row.id, name: row.original_name } : null;
}

/**
 * Records an attachment.
 *
 * A URL pointing at one of our uploads becomes a reference to it; anything else
 * is kept as the address it is. An address we cannot serve is still a real
 * attachment — a shared drive, a client's portal — and dropping it because it
 * is not ours would lose information.
 */
export function addAttachment(
  db: Db,
  owner: AttachmentOwner,
  input: { url: string; name?: string },
): string | null {
  const url = input.url.trim();
  if (!url) return null;

  const { column, id: ownerId } = ownerColumn(owner);
  const upload = resolveUpload(db, url);
  const id = newId();

  db.prepare(
    `INSERT INTO attachments (id, ${column}, upload_id, external_url, name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    ownerId,
    upload?.id ?? null,
    upload ? null : url,
    (input.name ?? '').trim() || upload?.name || '',
    new Date().toISOString(),
  );
  return id;
}

/** Everything attached to one owner, oldest first. */
export function attachmentsFor(db: Db, owner: AttachmentOwner): Attachment[] {
  const { column, id } = ownerColumn(owner);
  return loadAttachments(db, `a.${column} = ?`, [id]).get(id) ?? [];
}

/**
 * Attachments for many owners at once, keyed by owner id.
 *
 * One query rather than one per row: the snapshot draws attachments for every
 * invoice, deliverable, document and task of every client, and asking
 * separately for each is how the fan-out in F-08 got started.
 */
export function loadAttachments(
  db: Db,
  where: string,
  params: unknown[],
): Map<string, Attachment[]> {
  const rows = db
    .prepare(
      `SELECT a.id, a.invoice_id, a.deliverable_id, a.document_id, a.task_id,
              a.upload_id, a.external_url, a.name, u.filename, u.original_name
         FROM attachments a
         LEFT JOIN uploads u ON u.id = a.upload_id
        WHERE ${where}
        ORDER BY a.created_at, a.rowid`,
    )
    .all(...(params as never[])) as {
    id: string;
    invoice_id: string | null;
    deliverable_id: string | null;
    document_id: string | null;
    task_id: string | null;
    upload_id: string | null;
    external_url: string | null;
    name: string;
    filename: string | null;
    original_name: string | null;
  }[];

  const byOwner = new Map<string, Attachment[]>();
  for (const row of rows) {
    const ownerId = row.invoice_id ?? row.deliverable_id ?? row.document_id ?? row.task_id;
    if (!ownerId) continue;
    const list = byOwner.get(ownerId) ?? [];
    list.push({
      id: row.id,
      name: row.name || row.original_name || '',
      // An upload's URL is derived from the file it points at, so renaming the
      // scheme is a change in one place rather than a data migration.
      url: row.filename ? uploadUrl(row.filename) : (row.external_url ?? ''),
      ...(row.upload_id ? { uploadId: row.upload_id } : {}),
    });
    byOwner.set(ownerId, list);
  }
  return byOwner;
}

/** Removes every attachment on an owner. Used when replacing a single file. */
export function clearAttachments(db: Db, owner: AttachmentOwner): void {
  const { column, id } = ownerColumn(owner);
  db.prepare(`DELETE FROM attachments WHERE ${column} = ?`).run(id);
}

/**
 * Replaces the one file an invoice, deliverable or document carries.
 *
 * These hold at most one, so setting is clear-then-add; an empty URL just
 * clears. Tasks use `addAttachment` directly because they hold a list.
 */
export function setAttachment(
  db: Db,
  owner: AttachmentOwner,
  input: { url: string; name?: string },
): void {
  clearAttachments(db, owner);
  addAttachment(db, owner, input);
}

/**
 * Uploads nothing points at any more.
 *
 * A left join instead of a regular expression over every URL in the database.
 * Beyond being correct, it is also the difference between reading four whole
 * tables into memory and an index lookup.
 */
export function unreferencedUploads(
  db: Db,
  olderThanISO: string,
): { id: string; filename: string; size_bytes: number }[] {
  return db
    .prepare(
      `SELECT u.id, u.filename, u.size_bytes
         FROM uploads u
         LEFT JOIN attachments a ON a.upload_id = u.id
        WHERE a.id IS NULL AND u.created_at < ?`,
    )
    .all(olderThanISO) as { id: string; filename: string; size_bytes: number }[];
}

/**
 * Runs database work in a transaction, then deletes files — never the other way
 * round, and never both at once.
 *
 * `unlinkSync` cannot be rolled back. The sweeper used to unlink inside its
 * transaction, so anything that threw part-way through left the earlier files
 * gone from disk and their rows restored by the rollback: a database confidently
 * pointing at files that no longer exist, which is the worse of the two
 * failures. Doing it in this order means the only thing a crash can leave behind
 * is a file nothing references — which is exactly what the sweeper is for, so it
 * corrects itself on the next run.
 *
 * `fn` returns the paths to remove; they are unlinked only once the commit has
 * actually happened.
 */
export function commitThenDelete(db: Db, fn: () => string[]): number {
  const paths = transact(db, fn);
  let removed = 0;
  for (const path of paths) {
    try {
      unlinkSync(path);
      removed += 1;
    } catch {
      /* Already gone, which is the state we wanted. */
    }
  }
  return removed;
}
