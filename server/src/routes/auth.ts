import { Router } from 'express';
import { changePassword, createUser, needsSetup } from '../auth/accounts';
import {
  exchangeCode,
  googleConfig,
  isGoogleEnabled,
  readIdToken,
  resolveGoogleUser,
  startAuth,
  validateClaims,
  type PendingAuth,
} from '../auth/google';
import { buildActor, requireAuth, requireTeamAdmin } from '../auth/permissions';
import {
  cookieOptions,
  createSession,
  destroySession,
  oauthCookieOptions,
  OAUTH_COOKIE,
  readSignedPayload,
  serializeCookie,
  setPreviewAs,
  SESSION_COOKIE,
  signPayload,
} from '../auth/sessions';
import { verifyPassword } from '../auth/passwords';
import type { Db } from '../db/index';
import { buildSnapshot } from '../domain/snapshot';
import { asyncRoute, HttpError } from '../http/errors';
import { changePasswordSchema, loginSchema, previewSchema, setupSchema } from '../http/validate';

export function authRoutes(db: Db): Router {
  const router = Router();

  /** Public: lets the sign-in screen offer first-run setup and Google. */
  router.get('/status', (_req, res) => {
    res.json({ needsSetup: needsSetup(db), googleEnabled: isGoogleEnabled() });
  });

  /**
   * Step 1 of Google sign-in: hand the browser off to Google's consent screen,
   * remembering the state, nonce and PKCE verifier in a short-lived signed
   * cookie. Kept server-side-free so there is nothing to clean up if the user
   * abandons the flow.
   */
  router.get('/google', (_req, res) => {
    const config = googleConfig();
    if (!config) throw new HttpError(501, 'Google sign-in is not configured on this server.');

    const { url, pending } = startAuth(config);
    res.cookie(OAUTH_COOKIE, signPayload(pending), oauthCookieOptions());
    res.redirect(url);
  });

  /**
   * Step 2: Google sends the browser back here with a code. Failures redirect to
   * the sign-in screen with a readable message rather than dumping JSON at
   * someone who was just clicking a button.
   */
  router.get(
    '/google/callback',
    asyncRoute(async (req, res) => {
      const fail = (message: string) => res.redirect('/?authError=' + encodeURIComponent(message));

      const config = googleConfig();
      if (!config) return fail('Google sign-in is not configured on this server.');

      const pending = readSignedPayload<PendingAuth>(req.cookies?.[OAUTH_COOKIE]);
      res.clearCookie(OAUTH_COOKIE, { ...oauthCookieOptions(), maxAge: undefined });

      if (typeof req.query.error === 'string') {
        return fail(req.query.error === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in failed.');
      }
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (!code || !pending) return fail('That sign-in link has expired. Please try again.');
      // Rejecting a mismatched state is what stops a forged callback.
      if (state !== pending.state) return fail('Sign-in request did not match. Please try again.');

      try {
        const { idToken } = await exchangeCode(config, code, pending.verifier);
        const profile = validateClaims(readIdToken(idToken), config, pending.nonce);
        const userId = resolveGoogleUser(db, profile, config);

        const sessionId = createSession(db, userId);
        res.cookie(SESSION_COOKIE, serializeCookie(sessionId), cookieOptions());
        res.redirect('/');
      } catch (err) {
        return fail(err instanceof HttpError ? err.message : 'Google sign-in failed.');
      }
    }),
  );

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
