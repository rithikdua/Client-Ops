import { timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import {
  changePassword,
  claimFirstOwner,
  emailOf,
  isResetTokenValid,
  needsSetup,
  redeemPasswordReset,
  setupToken,
} from '../auth/accounts';
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
import { hashPassword, verifyPassword } from '../auth/passwords';
import type { Db } from '../db/index';
import { audit, auditAnonymous } from '../domain/audit';
import { buildSnapshot } from '../domain/snapshot';
import { asyncRoute, HttpError } from '../http/errors';
import { clientIp, IP_POLICY, LOGIN_POLICY, RateLimiter } from '../http/rateLimit';
import {
  changePasswordSchema,
  loginSchema,
  previewSchema,
  redeemResetSchema,
  setupSchema,
} from '../http/validate';

/**
 * A real hash to compare against when the account does not exist, so login costs
 * the same either way. Generated once per process; the value is never a valid
 * password for anyone.
 */
const { hash: DUMMY_HASH, salt: DUMMY_SALT } = hashPassword(
  'no-such-account-' + Math.random().toString(36).slice(2),
);

export function authRoutes(db: Db): Router {
  const router = Router();

  // Two counters, both of which must be clear. Per-account alone lets an attacker
  // spread guesses across many addresses from one machine; per-IP alone is
  // defeated by a distributed attack. Neither is sufficient by itself.
  const perAccount = new RateLimiter(LOGIN_POLICY);
  const perIp = new RateLimiter(IP_POLICY);

  /**
   * Refuses the request when either counter is blocked. The same 429 is returned
   * whether or not the account exists, so this cannot be used to enumerate.
   */
  const enforceLimit = (req: Request, accountKey: string) => {
    const ip = clientIp(req);
    const wait = Math.max(perIp.retryAfter('ip:' + ip), perAccount.retryAfter(accountKey));
    if (wait > 0) {
      throw new HttpError(429, `Too many attempts. Try again in ${wait} second(s).`, {
        retryAfter: wait,
      });
    }
  };

  const recordFailure = (req: Request, accountKey: string) => {
    perIp.recordFailure('ip:' + clientIp(req));
    perAccount.recordFailure(accountKey);
    // Cheap housekeeping; the maps only grow while an attack is in progress.
    perIp.prune();
    perAccount.prune();
  };

  const clearLimit = (req: Request, accountKey: string) => {
    perIp.reset('ip:' + clientIp(req));
    perAccount.reset(accountKey);
  };

  /** Public: lets the sign-in screen offer first-run setup and Google. */
  router.get('/status', (_req, res) => {
    res.json({
      needsSetup: needsSetup(db),
      googleEnabled: isGoogleEnabled(),
      // The client only learns *whether* a token is needed, never its value.
      setupTokenRequired: !!setupToken(),
    });
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
      if (perIp.retryAfter('ip:' + clientIp(req)) > 0) {
        return fail('Too many sign-in attempts. Please wait a moment and try again.');
      }

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
        const profile = validateClaims(await readIdToken(idToken), config, pending.nonce);
        const userId = resolveGoogleUser(db, profile, config);
        auditAnonymous(db, req, { action: 'auth.login_google' }, { userId, email: profile.email });

        const sessionId = createSession(db, userId);
        res.cookie(SESSION_COOKIE, serializeCookie(sessionId), cookieOptions());
        res.redirect('/');
      } catch (err) {
        recordFailure(req, 'google');
        return fail(err instanceof HttpError ? err.message : 'Google sign-in failed.');
      }
    }),
  );

  /**
   * Creates the workspace's first account, as an Owner. Open only while there are
   * no users at all — once one exists this closes permanently and further accounts
   * are created by an Owner from the Team screen. An internal tool should not
   * accept open self-registration.
   *
   * Two protections beyond that:
   *  - SETUP_TOKEN, when set, must be presented. Required in production, because
   *    an unguarded bootstrap endpoint on a public URL is a land-grab: whoever
   *    reaches it first becomes the administrator.
   *  - the emptiness check and the insert are one transaction, so two
   *    simultaneous requests cannot both win the race and create two Owners.
   */
  router.post('/setup', (req, res) => {
    const input = setupSchema.parse(req.body);
    const required = setupToken();
    // The setup code is a secret too, so guessing it is throttled per IP.
    enforceLimit(req, 'setup');

    if (!required && process.env.NODE_ENV === 'production') {
      throw new HttpError(
        403,
        'Set SETUP_TOKEN before creating the first account on a production deployment.',
      );
    }
    if (required) {
      const provided = Buffer.from(input.setupToken);
      const expected = Buffer.from(required);
      const ok = provided.length === expected.length && timingSafeEqual(provided, expected);
      if (!ok) {
        recordFailure(req, 'setup');
        throw new HttpError(403, 'That setup code is not correct.');
      }
    }

    const id = claimFirstOwner(db, {
      name: input.name,
      email: input.email,
      role: input.role || 'Owner',
      password: input.password,
    });

    auditAnonymous(db, req, { action: 'auth.setup' }, { userId: id, email: input.email });

    const sessionId = createSession(db, id);
    res.cookie(SESSION_COOKIE, serializeCookie(sessionId), cookieOptions());
    const actor = buildActor(db, id, null);
    res.status(201).json(buildSnapshot(db, actor!));
  });

  /**
   * Says whether a reset link is still usable, so the screen can show a clear
   * "this link has expired" instead of failing after the user types a password.
   * Deliberately returns nothing about the account it belongs to.
   */
  router.get('/reset', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    res.json({ valid: isResetTokenValid(db, token) });
  });

  /** Redeems a reset link. Throttled, since the token is a secret worth guessing. */
  router.post('/reset', (req, res) => {
    enforceLimit(req, 'reset');
    const input = redeemResetSchema.parse(req.body);

    let userId: string;
    try {
      userId = redeemPasswordReset(db, input.token, input.newPassword);
    } catch (err) {
      // Only a bad token counts as a guess; a too-short password does not.
      if (err instanceof HttpError && /no longer valid/.test(err.message)) {
        recordFailure(req, 'reset');
      }
      throw err;
    }
    clearLimit(req, 'reset');
    auditAnonymous(db, req, { action: 'auth.reset_redeemed' }, { userId, email: emailOf(db, userId) });

    // Redeeming signs the account in, so nobody is left staring at a login form
    // straight after choosing a password.
    const sessionId = createSession(db, userId);
    res.cookie(SESSION_COOKIE, serializeCookie(sessionId), cookieOptions());
    const actor = buildActor(db, userId, null);
    res.json(buildSnapshot(db, actor!));
  });

  router.post('/login', (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const accountKey = 'email:' + email;
    enforceLimit(req, accountKey);

    const user = db
      .prepare('SELECT id, password_hash, password_salt FROM users WHERE email = ?')
      .get(email) as { id: string; password_hash: string; password_salt: string } | undefined;

    // Hash even when the address is unknown, and even for a Google-only account
    // that has no password. Skipping the work would make an unknown address
    // answer measurably faster than a real one — a timing oracle for enumerating
    // who has an account. The message is identical either way.
    const ok = verifyPassword(
      password,
      user && user.password_hash ? user.password_hash : DUMMY_HASH,
      user && user.password_hash ? user.password_salt : DUMMY_SALT,
    );
    if (!user || !user.password_hash || !ok) {
      recordFailure(req, accountKey);
      // Recorded under the address that was tried, which may belong to nobody.
      // A run of these against one account is the signal worth having.
      auditAnonymous(db, req, { action: 'auth.login_failed' }, { email, userId: user?.id });
      throw new HttpError(401, 'Email or password is incorrect.');
    }
    clearLimit(req, accountKey);

    auditAnonymous(db, req, { action: 'auth.login' }, { email, userId: user.id });

    const sessionId = createSession(db, user.id);
    res.cookie(SESSION_COOKIE, serializeCookie(sessionId), cookieOptions());

    const actor = buildActor(db, user.id, null);
    if (!actor) throw new HttpError(500, 'Could not load the signed-in account.');
    res.json(buildSnapshot(db, actor));
  });

  router.post('/logout', (req, res) => {
    if (req.actor) audit(db, req, { action: 'auth.logout' });
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
    const accountKey = 'password:' + req.actor!.userId;
    enforceLimit(req, accountKey);
    try {
      changePassword(db, req.actor!.userId, input.currentPassword, input.newPassword);
    } catch (err) {
      // Only a wrong current password counts as a guess; a weak new password is
      // the user's own mistake and should not lock them out.
      if (err instanceof HttpError && err.status === 403) recordFailure(req, accountKey);
      throw err;
    }
    clearLimit(req, accountKey);
    audit(db, req, { action: 'auth.password_change' });

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

    // Logged before the switch, so the entry is attributed to the Owner acting
    // as themselves rather than to the account they are about to inhabit.
    audit(db, req, {
      action: 'auth.preview_start',
      targetType: 'user',
      targetId: teammateId,
      targetLabel: emailOf(db, teammateId),
    });
    setPreviewAs(db, req.sessionId!, teammateId);
    const actor = buildActor(db, req.actor!.userId, teammateId);
    res.json(buildSnapshot(db, actor!));
  });

  router.delete('/preview', requireAuth, (req, res) => {
    if (req.actor!.previewAsId) {
      audit(db, req, {
        action: 'auth.preview_stop',
        targetType: 'user',
        targetId: req.actor!.previewAsId,
      });
    }
    setPreviewAs(db, req.sessionId!, null);
    const actor = buildActor(db, req.actor!.userId, null);
    res.json(buildSnapshot(db, actor!));
  });

  return router;
}
