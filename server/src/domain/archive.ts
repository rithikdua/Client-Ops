import type { Db } from '../db/index';
import { HttpError, notFound } from '../http/errors';

/**
 * Deleting hides a record; it does not destroy it.
 *
 * Every delete here used to be immediate and permanent. Removing a client took
 * its invoices, contacts, deliverables, documents and tasks with it by cascade —
 * years of an account's history, gone on one click, with no confirmation step
 * that could tell you how much you were about to lose. The audit log recorded
 * that a deletion happened and roughly how big it was ("14 invoices, 3
 * contacts"), which answers *whether* to panic and nothing about how to recover.
 *
 * A delete now stamps `archived_at`. The row stays, its children stay, and every
 * read filters it out — so the app behaves exactly as before for anyone who is
 * not looking for it, and the mistake is one click to undo instead of
 * unrecoverable.
 *
 * This is deliberately not a versioning or trash-bin system. There is no
 * retention policy, nothing expires on its own, and purging is a separate
 * explicit act (`npm run purge-archived`). Data that disappears on a timer you
 * forgot about is its own kind of surprise.
 */

/** Tables that archive rather than delete, and what to call them in errors. */
export const ARCHIVABLE = {
  clients: 'Client',
  contacts: 'Contact',
  invoices: 'Invoice',
  deliverables: 'Deliverable',
  documents: 'Document',
  tasks: 'Task',
  follow_ups: 'Follow-up',
} as const;

export type ArchivableTable = keyof typeof ARCHIVABLE;

/**
 * The condition every read adds.
 *
 * A function rather than a constant string because the alias differs between
 * queries, and an archived row leaking into one list while being hidden from
 * another is the kind of inconsistency that makes people distrust the whole
 * screen.
 */
export const notArchived = (alias?: string) =>
  `${alias ? `${alias}.` : ''}archived_at IS NULL`;

/** Hides a row. Returns false when it was already hidden or never existed. */
export function archiveRow(db: Db, table: ArchivableTable, id: string): boolean {
  const result = db
    .prepare(`UPDATE ${table} SET archived_at = ? WHERE id = ? AND archived_at IS NULL`)
    .run(new Date().toISOString(), id);
  return result.changes > 0;
}

/**
 * Brings a row back.
 *
 * Restoring a child of an archived parent is refused rather than done quietly:
 * an invoice restored under an archived client would exist in the database and
 * appear nowhere, which looks exactly like the restore having failed. Say so,
 * and let the person restore the client.
 */
export function restoreRow(db: Db, table: ArchivableTable, id: string): void {
  const row = db.prepare(`SELECT archived_at FROM ${table} WHERE id = ?`).get(id) as
    | { archived_at: string | null }
    | undefined;
  if (!row) throw notFound(ARCHIVABLE[table]);
  if (!row.archived_at) throw new HttpError(409, `That ${ARCHIVABLE[table].toLowerCase()} is not archived.`);

  if (table !== 'clients' && table !== 'follow_ups') {
    const parent = db
      .prepare(
        `SELECT c.archived_at, c.name FROM ${table} t
           JOIN clients c ON c.id = t.client_id
          WHERE t.id = ?`,
      )
      .get(id) as { archived_at: string | null; name: string } | undefined;
    if (parent?.archived_at) {
      throw new HttpError(
        409,
        `Restore ${parent.name} first — this belongs to an archived client and would come back invisible.`,
      );
    }
  }

  db.prepare(`UPDATE ${table} SET archived_at = NULL WHERE id = ?`).run(id);
}

/** How many archived rows a client is holding, for the "N archived" affordances. */
export function archivedCounts(db: Db, clientId: string): Record<string, number> {
  return db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM invoices     WHERE client_id = ? AND archived_at IS NOT NULL) AS invoices,
         (SELECT COUNT(*) FROM contacts     WHERE client_id = ? AND archived_at IS NOT NULL) AS contacts,
         (SELECT COUNT(*) FROM deliverables WHERE client_id = ? AND archived_at IS NOT NULL) AS deliverables,
         (SELECT COUNT(*) FROM documents    WHERE client_id = ? AND archived_at IS NOT NULL) AS documents,
         (SELECT COUNT(*) FROM tasks        WHERE client_id = ? AND archived_at IS NOT NULL) AS tasks`,
    )
    .get(clientId, clientId, clientId, clientId, clientId) as Record<string, number>;
}

/**
 * Permanently removes rows archived before a cutoff.
 *
 * Separate from everything else and never run on a schedule. The whole point of
 * archiving is that recovery does not depend on noticing quickly, and a nightly
 * purge quietly reintroduces exactly the deadline this was meant to remove.
 */
export function purgeArchived(db: Db, olderThanISO: string): Record<string, number> {
  const removed: Record<string, number> = {};
  // Clients last: their cascade takes the children anyway, and doing the
  // children first keeps the counts honest about what was actually purged.
  const order: ArchivableTable[] = [
    'contacts',
    'invoices',
    'deliverables',
    'documents',
    'tasks',
    'follow_ups',
    'clients',
  ];
  for (const table of order) {
    removed[table] = db
      .prepare(`DELETE FROM ${table} WHERE archived_at IS NOT NULL AND archived_at < ?`)
      .run(olderThanISO).changes;
  }
  return removed;
}
