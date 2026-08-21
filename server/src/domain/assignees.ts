import type { Db } from '../db/index';
import { HttpError } from '../http/errors';

/**
 * Who a client, task, deliverable or follow-up is assigned to.
 *
 * These were plain names. The Team screen calls these people assignable
 * workspace members, but nothing tied the value to an account, so the string was
 * whatever was typed the day it was set. Rename someone and every past
 * assignment keeps the old spelling; remove them and the name is orphaned;
 * assign the same person twice and you can end up with "Ravi Menon", "Ravi",
 * "R. Menon" and "ravi@phot.ai" all meaning one person — with no way to ask the
 * database "what is Ravi responsible for".
 *
 * An assignment is now a pair:
 *
 *   userId  the account, when the person is a member. It survives a rename and
 *           is what "my clients" and workload views get built from.
 *   name    their name at the time of assigning. It keeps history readable when
 *           an account is removed — the id goes NULL, the name stays — and it
 *           holds names that were never accounts at all.
 *
 * Keeping the name is not redundancy for its own sake. Dropping it would mean a
 * removed teammate erases who did the work, and there is no way to record that
 * an account was looked after by someone before they had a login.
 */

export interface Assignment {
  userId: string | null;
  name: string;
}

export interface AssignmentInput {
  /** Preferred: the account being assigned. */
  userId?: string | null;
  /** Accepted for scripts, the CLI, and anything written before the ids. */
  name?: string | null;
}

interface UserRow {
  id: string;
  name: string;
}

/**
 * Turns whatever a request supplied into an assignment.
 *
 * An id that does not exist is an error rather than a silent downgrade to a
 * name: it means the client is working from a stale team list, and quietly
 * storing an unlinked string is how the old mess started.
 */
export function resolveAssignment(db: Db, input: AssignmentInput): Assignment {
  const userId = (input.userId ?? '').trim();
  const name = (input.name ?? '').trim();

  if (userId) {
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId) as
      | UserRow
      | undefined;
    if (!user) throw new HttpError(400, 'That teammate no longer exists. Reload and try again.');
    // The account's current name wins: it is the one that gets maintained.
    return { userId: user.id, name: user.name };
  }

  if (!name) return { userId: null, name: '' };

  // A bare name still gets linked when it unambiguously matches an account, so
  // existing scripts keep producing joined-up data rather than more strings.
  const matches = db
    .prepare('SELECT id, name FROM users WHERE lower(trim(name)) = lower(trim(?))')
    .all(name) as UserRow[];
  if (matches.length === 1) return { userId: matches[0].id, name: matches[0].name };

  // No match, or two people with the same name: keep the text and leave it
  // unlinked rather than guessing which person was meant.
  return { userId: null, name };
}

/**
 * Whether a request said anything about the assignment at all. A PATCH that
 * omits both fields must leave the existing one alone, which is different from
 * one that clears it.
 */
export function mentionsAssignment(input: AssignmentInput): boolean {
  return input.userId !== undefined || input.name !== undefined;
}

/** Every table that carries an assignment, as (table, name column, id column). */
export const ASSIGNMENT_COLUMNS = [
  ['clients', 'owner', 'owner_user_id'],
  ['deliverables', 'owner', 'owner_user_id'],
  ['tasks', 'assignee', 'assignee_user_id'],
  ['follow_ups', 'owner', 'owner_user_id'],
] as const;

/**
 * Links assignments that hold only a name to the account with that name.
 *
 * Used by the migration that introduced the ids, and by the demo seeder so a
 * fresh workspace is linked from the start rather than only after an upgrade.
 * Names that match no account, or match more than one, are left alone: an
 * ex-employee, an external name and a typo are all real, and none of them should
 * be discarded to make a column look tidy.
 */
export function linkAssignmentsByName(db: Db): number {
  let linked = 0;
  for (const [table, nameColumn, idColumn] of ASSIGNMENT_COLUMNS) {
    const result = db
      .prepare(
        `UPDATE ${table} SET ${idColumn} = (
           SELECT u.id FROM users u
            WHERE lower(trim(u.name)) = lower(trim(${table}.${nameColumn}))
            -- Two accounts sharing a name is ambiguous, so link neither.
            AND (SELECT COUNT(*) FROM users u2
                  WHERE lower(trim(u2.name)) = lower(trim(${table}.${nameColumn}))) = 1
         )
          WHERE ${idColumn} IS NULL AND trim(${nameColumn}) <> ''`,
      )
      .run();
    linked += result.changes;
  }
  return linked;
}
