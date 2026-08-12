import { Router } from 'express';
import { changePassword, createUser, needsSetup } from '../auth/accounts';
import { buildActor, requireAuth, requireTeamAdmin } from '../auth/permissions';
import {
  cookieOptions,
  createSession,
  destroySession,
  serializeCookie,
  setPreviewAs,
  SESSION_COOKIE,
} from '../auth/sessions';
import { verifyPassword } from '../auth/passwords';
import type { Db } from '../db/index';
import { buildSnapshot } from '../domain/snapshot';
import { HttpError } from '../http/errors';
import { changePasswordSchema, loginSchema, previewSchema, setupSchema } from '../http/validate';

export function authRoutes(db: Db): Router {
  const router = Router();

  /** Public: lets the sign-in screen offer first-run setup instead. */
  router.get('/status', (_req, res) => {
    res.json({ needsSetup: needsSetup(db) });
  });

  /**
   * Creates the workspace's first account, as an Owner. Open only while there
   * are no users at all — once one exists this closes permanently and further
   * accounts are created by an Owner from the Team screen. That is deliberate:
   * an internal tool should not accept open self-registration.
   */
  router.post('/setup', (req, res) => {
    if (!needsSetup(db)) {
      throw new HttpError(409, 'This workspace already has an account. Ask an Owner to invite you.');
    }
    const input = setupSchema.parse(req.body);
    const id = createUser(db, {
      name: input.name,
      email: input.email,
      role: input.role || 'Owner',
      permission: 'Owner',
      password: input.password,
    });

    const sessionId = createSession(db, id);
    res.cookie(SESSION_COOKIE, serializeCookie(sessionId), cookieOptions());
    const actor = buildActor(db, id, null);
    res.status(201).json(buildSnapshot(db, actor!));
  });

  router.post('/login', (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = db
      .prepare('SELECT id, password_hash, password_salt FROM users WHERE email = ?')
      .get(email) as { id: string; password_hash: string; password_salt: string } | undefined;

    // Same message and roughly the same work either way, so the response can't
    // be used to enumerate which addresses have accounts.
    const ok = user && verifyPassword(password, user.password_hash, user.password_salt);
    if (!user || !ok) throw new HttpError(401, 'Email or password is incorrect.');

    const sessionId = createSession(db, user.id);
    res.cookie(SESSION_COOKIE, serializeCookie(sessionId), cookieOptions());

    const actor = buildActor(db, user.id, null);
    if (!actor) throw new HttpError(500, 'Could not load the signed-in account.');
    res.json(buildSnapshot(db, actor));
  });

  router.post('/logout', (req, res) => {
    if (req.sessionId) destroySession(db, req.sessionId);
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
    res.status(204).end();
  });

  router.get('/session', requireAuth, (req, res) => {
    res.json(buildSnapshot(db, req.actor!));
  });

  /**
   * Changes your own password. Not available while previewing as someone else —
   * the preview would otherwise decide whose password is being changed.
   */
  router.post('/password', requireAuth, (req, res) => {
    if (req.actor!.previewAsId) {
      throw new HttpError(400, 'Exit the preview before changing your password.');
    }
    const input = changePasswordSchema.parse(req.body);
    changePassword(db, req.actor!.userId, input.currentPassword, input.newPassword);

    // Every session was just invalidated, including this one — issue a new one
    // so the person who made the change stays signed in.
    const sessionId = createSession(db, req.actor!.userId);
    res.cookie(SESSION_COOKIE, serializeCookie(sessionId), cookieOptions());
    const actor = buildActor(db, req.actor!.userId, null);
    res.json(buildSnapshot(db, actor!));
  });

  // Previewing another teammate's access is Owner-only and recorded on the
  // session, so every later request is genuinely evaluated as that teammate.
  router.post('/preview', requireAuth, requireTeamAdmin, (req, res) => {
    const { teammateId } = previewSchema.parse(req.body);
    const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(teammateId);
    if (!exists) throw new HttpError(404, 'Teammate not found.');
    if (teammateId === req.actor!.userId) throw new HttpError(400, 'You are already yourself.');

    setPreviewAs(db, req.sessionId!, teammateId);
    const actor = buildActor(db, req.actor!.userId, teammateId);
    res.json(buildSnapshot(db, actor!));
  });

  router.delete('/preview', requireAuth, (req, res) => {
    setPreviewAs(db, req.sessionId!, null);
    const actor = buildActor(db, req.actor!.userId, null);
    res.json(buildSnapshot(db, actor!));
  });

  return router;
}
