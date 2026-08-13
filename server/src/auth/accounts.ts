import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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

/**
 * The address on an account, for logging. Falls back to the id so an audit entry
 * is never silently blank for an account that has already gone.
 */
export function emailOf(db: Db, userId: string): string {
  const row = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as
    | { email: string }
    | undefined;
  return row?.email ?? userId;
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
  /**
   * True when somebody other than the account holder chose this password, so it
   * has to be replaced before the account can be used.
   */
  mustChangePassword?: boolean;
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
      `INSERT INTO users (id, name, email, role, permission, password_hash, password_salt,
                          must_change_password, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name.trim(),
      email,
      input.role?.trim() ?? '',
      input.permission,
      hash,
      salt,
      input.mustChangePassword ? 1 : 0,
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

  setPassword(db, userId, newPassword);
}

/**
 * Writes a new password, clears any forced-change requirement, and drops the
 * account's sessions. Signing other sessions out is the point: if the password
 * was changed because it may have leaked, leaving those alive defeats the
 * exercise.
 */
export function setPassword(db: Db, userId: string, newPassword: string): void {
  const { hash, salt } = hashPassword(newPassword);
  transact(db, () => {
    db.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0
       WHERE id = ?`,
    ).run(hash, salt, userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    // Any outstanding reset link is spent the moment a password is set.
    db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(userId);
  });
}

/* -- password resets ------------------------------------------------------- */

/** How long a reset link stays usable. */
const RESET_TTL_MS = Number(process.env.PASSWORD_RESET_TTL_MS ?? 60 * 60_000);

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface ResetGrant {
  /** The secret. Shown to the Owner once and never stored in this form. */
  token: string;
  expiresAt: string;
}

/**
 * Issues a one-time reset link for someone else's account.
 *
 * There is no email delivery here, so the Owner passes the link on themselves.
 * That is a deliberate trade: it removes "delete and recreate the account" as the
 * only recovery path without inventing a mail dependency. Only the hash is
 * stored, so the link cannot be recovered from a database dump.
 */
export function createPasswordReset(db: Db, userId: string, createdBy: string): ResetGrant {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) throw new HttpError(404, 'Account not found.');

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

  transact(db, () => {
    // Issuing a new link invalidates any earlier one.
    db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(userId);
    db.prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at, created_by, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    ).run(newId(), userId, hashToken(token), expiresAt, createdBy, new Date().toISOString());
  });

  return { token, expiresAt };
}

interface ResetRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
}

function findReset(db: Db, token: string): ResetRow | null {
  if (!token) return null;
  const presented = hashToken(token);
  const row = db
    .prepare('SELECT id, user_id, token_hash, expires_at, used_at FROM password_resets WHERE token_hash = ?')
    .get(presented) as ResetRow | undefined;
  if (!row) return null;
  // Belt and braces: the lookup already matched, but compare in constant time.
  const a = Buffer.from(row.token_hash);
  const b = Buffer.from(presented);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return row;
}

/** True when a link is still redeemable — used by the reset screen. */
export function isResetTokenValid(db: Db, token: string): boolean {
  const row = findReset(db, token);
  return !!row && !row.used_at && new Date(row.expires_at) > new Date();
}

/** Redeems a reset link and sets the new password. */
export function redeemPasswordReset(db: Db, token: string, newPassword: string): string {
  const row = findReset(db, token);
  // One message for every failure: expired, spent and never-existed are
  // indistinguishable to whoever is holding the link.
  const invalid = () => new HttpError(400, 'That reset link is no longer valid. Ask for a new one.');
  if (!row || row.used_at) throw invalid();
  if (new Date(row.expires_at) <= new Date()) throw invalid();
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  transact(db, () => {
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      row.id,
    );
    setPassword(db, row.user_id, newPassword);
  });
  return row.user_id;
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
