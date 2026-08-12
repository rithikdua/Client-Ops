import { ACCESS_SECTIONS } from '../../../src/data/options';
import type { Access, Permission } from '../../../src/data/types';
import { newId, transact, type Db } from '../db/index';
import { HttpError } from '../http/errors';
import { hashPassword, verifyPassword } from './passwords';
import { writeAccess } from './permissions';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Optional one-time secret that first-run setup must present. Set SETUP_TOKEN on
 * any deployment reachable from the internet: without it, whoever loads the page
 * first becomes the Owner.
 */
export function setupToken(): string | null {
  return process.env.SETUP_TOKEN?.trim() || null;
}

export function countUsers(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

/** True while the workspace has no accounts, i.e. first-run setup is available. */
export function needsSetup(db: Db): boolean {
  return countUsers(db) === 0;
}

export function fullAccess(): Access {
  return ACCESS_SECTIONS.reduce((acc, s) => {
    acc[s.key] = true;
    return acc;
  }, {} as Access);
}

export interface NewUser {
  name: string;
  email: string;
  role?: string;
  permission: Permission;
  password: string;
  access?: Access;
}

/**
 * The single place accounts are created — first-run setup, the Team screen, the
 * CLI and the demo seeder all come through here, so the password and uniqueness
 * rules cannot drift apart.
 */
export function createUser(db: Db, input: NewUser): string {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new HttpError(400, 'A valid email address is required.');
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'That email address is already in use.');
  }

  const id = newId();
  const { hash, salt } = hashPassword(input.password);

  transact(db, () => {
    db.prepare(
      `INSERT INTO users (id, name, email, role, permission, password_hash, password_salt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name.trim(),
      email,
      input.role?.trim() ?? '',
      input.permission,
      hash,
      salt,
      new Date().toISOString(),
    );
    // Owners always hold every section; nobody can lock the administrator out.
    writeAccess(db, id, input.permission === 'Owner' ? fullAccess() : (input.access ?? fullAccess()));
  });

  return id;
}

/**
 * Changes a user's own password. Requires the current one, so a borrowed session
 * cannot be used to lock the real owner out of their account.
 *
 * An account created through Google has no password yet; that case *sets* the
 * first one, so someone can add a password login without waiting for an Owner.
 */
export function changePassword(
  db: Db,
  userId: string,
  currentPassword: string,
  newPassword: string,
): void {
  const row = db
    .prepare('SELECT password_hash, password_salt FROM users WHERE id = ?')
    .get(userId) as { password_hash: string; password_salt: string } | undefined;
  if (!row) throw new HttpError(404, 'Account not found.');

  const alreadyHasPassword = row.password_hash !== '';
  if (alreadyHasPassword && !verifyPassword(currentPassword, row.password_hash, row.password_salt)) {
    throw new HttpError(403, 'Your current password is incorrect.');
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (alreadyHasPassword && newPassword === currentPassword) {
    throw new HttpError(400, 'The new password must be different.');
  }

  const { hash, salt } = hashPassword(newPassword);
  transact(db, () => {
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(
      hash,
      salt,
      userId,
    );
    // Signing out other sessions is the point of a password change.
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  });
}

/**
 * Creates the very first account, as an Owner, or fails if the workspace already
 * has one.
 *
 * The emptiness check and the insert happen in a single transaction. Checking
 * first and inserting afterwards is a race: two simultaneous requests can both
 * see zero users and both create an Owner, which on a public deployment means a
 * stranger ends up with an administrator account alongside the real one.
 */
export function claimFirstOwner(db: Db, input: Omit<NewUser, 'permission'>): string {
  return transact(db, () => {
    if (countUsers(db) !== 0) {
      throw new HttpError(409, 'This workspace already has an account. Ask an Owner to invite you.');
    }
    return createUser(db, { ...input, permission: 'Owner' });
  });
}
