import type { Db } from '../db/index';
import { HttpError } from '../http/errors';

/**
 * Optimistic concurrency for the records two people can hold open at once.
 *
 * Without it the last write wins silently. Two account managers open the same
 * client, one sets the health to At Risk and adds a note about the renewal, the
 * other — working from what the page showed a minute ago — saves the industry;
 * the second save carries the first's fields as they were before the edit, and
 * the first person's work is gone with nothing to indicate it ever happened.
 *
 * Every editable record carries a version. A client that sends the version it
 * was showing gets its write applied only if that is still the current one;
 * otherwise it is told, and can show what changed instead of overwriting it.
 * A request that sends no version keeps the old behaviour, so scripts and the
 * CLI are unaffected.
 */

/** Tables that carry a `version` column. */
export type VersionedTable = 'clients' | 'tasks' | 'deliverables' | 'follow_ups';

const LABELS: Record<VersionedTable, string> = {
  clients: 'client',
  tasks: 'task',
  deliverables: 'deliverable',
  follow_ups: 'follow-up',
};

/**
 * Advances the record's version, refusing the write if someone else got there
 * first. Call inside the same transaction as the update: on a conflict this
 * throws, the transaction rolls back, and nothing was changed.
 */
export function bumpVersion(
  db: Db,
  table: VersionedTable,
  id: string,
  expected: number | undefined,
): void {
  if (expected === undefined) {
    db.prepare(`UPDATE ${table} SET version = version + 1 WHERE id = ?`).run(id);
    return;
  }

  const result = db
    .prepare(`UPDATE ${table} SET version = version + 1 WHERE id = ? AND version = ?`)
    .run(id, expected);
  if (result.changes === 0) {
    throw new HttpError(
      409,
      `Someone else changed this ${LABELS[table]} while you were editing it. ` +
        'Your changes were not saved — reopen it to see the current version.',
    );
  }
}

/** The version a record is currently on, for callers that need to report it. */
export function versionOf(db: Db, table: VersionedTable, id: string): number {
  const row = db.prepare(`SELECT version FROM ${table} WHERE id = ?`).get(id) as
    | { version: number }
    | undefined;
  return row?.version ?? 1;
}
