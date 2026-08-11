import type { NextFunction, Request, Response } from 'express';
import { ACCESS_SECTIONS, ALL_ACCESS } from '../../../src/data/options';
import type { Access, Permission, SectionKey } from '../../../src/data/types';
import type { Db } from '../db/index';
import { HttpError } from '../http/errors';

export interface Actor {
  /** The signed-in account. */
  userId: string;
  name: string;
  email: string;
  role: string;
  permission: Permission;
  /**
   * Access actually in force. When an Owner is previewing as someone else this
   * is the *previewed* user's access, so the preview is enforced server-side
   * rather than merely hidden in the UI.
   */
  access: Access;
  previewAsId: string | null;
  previewAsName: string | null;
  previewAsRole: string | null;
  /** False for Viewers, and while previewing as a Viewer. */
  canWrite: boolean;
  /** Only Owners may manage the team or start a preview. */
  canManageTeam: boolean;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  permission: Permission;
}

export function loadAccess(db: Db, userId: string): Access {
  const rows = db
    .prepare('SELECT section, allowed FROM user_access WHERE user_id = ?')
    .all(userId) as { section: string; allowed: number }[];
  // Default-deny: a section with no row is not granted.
  const access = ACCESS_SECTIONS.reduce((acc, s) => {
    acc[s.key] = false;
    return acc;
  }, {} as Access);
  for (const row of rows) {
    if (row.section in access) access[row.section as SectionKey] = !!row.allowed;
  }
  return access;
}

export function writeAccess(db: Db, userId: string, access: Access): void {
  const stmt = db.prepare(
    `INSERT INTO user_access (user_id, section, allowed) VALUES (?, ?, ?)
     ON CONFLICT (user_id, section) DO UPDATE SET allowed = excluded.allowed`,
  );
  for (const section of ACCESS_SECTIONS) {
    stmt.run(userId, section.key, access[section.key] ? 1 : 0);
  }
}

export function buildActor(db: Db, userId: string, previewAsId: string | null): Actor | null {
  const user = db
    .prepare('SELECT id, name, email, role, permission FROM users WHERE id = ?')
    .get(userId) as UserRow | undefined;
  if (!user) return null;

  const isOwner = user.permission === 'Owner';
  // Only an Owner can hold a preview; anything else is ignored rather than trusted.
  const previewed =
    isOwner && previewAsId
      ? (db
          .prepare('SELECT id, name, email, role, permission FROM users WHERE id = ?')
          .get(previewAsId) as UserRow | undefined)
      : undefined;

  const effective = previewed ?? user;

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permission: user.permission,
    access: previewed ? loadAccess(db, previewed.id) : isOwner ? { ...ALL_ACCESS } : loadAccess(db, user.id),
    previewAsId: previewed ? previewed.id : null,
    previewAsName: previewed ? previewed.name : null,
    previewAsRole: previewed ? previewed.role : null,
    canWrite: effective.permission !== 'Viewer',
    canManageTeam: isOwner && !previewed,
  };
}

/** Rejects unauthenticated requests. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor) return next(new HttpError(401, 'Not signed in.'));
  next();
}

/** Rejects requests from anyone whose effective access excludes `section`. */
export function requireSection(section: SectionKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.actor) return next(new HttpError(401, 'Not signed in.'));
    if (!req.actor.access[section]) {
      return next(new HttpError(403, `You do not have access to ${section}.`));
    }
    next();
  };
}

/** Rejects mutations from read-only (Viewer) users. */
export function requireWrite(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor) return next(new HttpError(401, 'Not signed in.'));
  if (!req.actor.canWrite) return next(new HttpError(403, 'Your account is read-only.'));
  next();
}

/** Rejects anyone who is not an Owner acting as themselves. */
export function requireTeamAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor) return next(new HttpError(401, 'Not signed in.'));
  if (!req.actor.canManageTeam) {
    return next(new HttpError(403, 'Only an account Owner can manage the team.'));
  }
  next();
}
