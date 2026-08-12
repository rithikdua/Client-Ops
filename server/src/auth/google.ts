import { createHash, randomBytes } from 'node:crypto';
import { newId, transact, type Db } from '../db/index';
import { HttpError } from '../http/errors';
import { fullAccess } from './accounts';
import { writeAccess } from './permissions';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** When set, only these email domains may sign in. */
  allowedDomains: string[];
}

/**
 * Google sign-in is configured entirely through the environment, so the feature
 * simply stays off until someone supplies credentials. Nothing else in the app
 * has to know whether it is available.
 */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI?.trim() ||
      'http://localhost:5173/api/auth/google/callback',
    allowedDomains: (process.env.GOOGLE_ALLOWED_DOMAINS ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function isGoogleEnabled(): boolean {
  return googleConfig() !== null;
}

const base64url = (buf: Buffer) => buf.toString('base64url');

export interface PendingAuth {
  state: string;
  nonce: string;
  /** PKCE verifier, kept in the cookie and sent with the code exchange. */
  verifier: string;
}

export function startAuth(config: GoogleConfig): { url: string; pending: PendingAuth } {
  const pending: PendingAuth = {
    state: base64url(randomBytes(24)),
    nonce: base64url(randomBytes(16)),
    verifier: base64url(randomBytes(32)),
  };
  // PKCE: the verifier never leaves this server, so a stolen authorization code
  // cannot be redeemed by anyone else.
  const challenge = base64url(createHash('sha256').update(pending.verifier).digest());

  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // We only need identity, so don't ask for offline access or a refresh token.
    access_type: 'online',
    prompt: 'select_account',
  }).toString();

  return { url: url.toString(), pending };
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

interface IdTokenClaims {
  iss?: string;
  aud?: string;
  exp?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  nonce?: string;
}

/**
 * Reads the ID token's payload.
 *
 * The signature is not verified, and does not need to be: this token was just
 * fetched from Google's token endpoint over TLS in a direct server-to-server
 * call, so there is no untrusted party in between. (Google documents this
 * exception.) The claims below are still checked, because a mismatched audience
 * or a stale token would mean something is misconfigured.
 */
export function readIdToken(idToken: string): IdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new HttpError(502, 'Google returned a malformed ID token.');
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as IdTokenClaims;
  } catch {
    throw new HttpError(502, 'Google returned an unreadable ID token.');
  }
}

export function validateClaims(
  claims: IdTokenClaims,
  config: GoogleConfig,
  expectedNonce: string,
): GoogleProfile {
  if (!claims.iss || !ISSUERS.includes(claims.iss)) {
    throw new HttpError(502, 'Unexpected token issuer.');
  }
  if (claims.aud !== config.clientId) {
    throw new HttpError(502, 'This token was issued for a different application.');
  }
  if (claims.nonce !== expectedNonce) {
    throw new HttpError(400, 'Sign-in request did not match. Please try again.');
  }
  if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) {
    throw new HttpError(400, 'Sign-in took too long. Please try again.');
  }
  const email = (claims.email ?? '').trim().toLowerCase();
  if (!claims.sub || !email) throw new HttpError(502, 'Google did not return an email address.');
  // An unverified address proves nothing about who is signing in.
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new HttpError(403, 'Your Google email address is not verified.');
  }

  return { sub: claims.sub, email, emailVerified: true, name: (claims.name ?? '').trim() || email };
}

export async function exchangeCode(
  config: GoogleConfig,
  code: string,
  verifier: string,
): Promise<{ idToken: string }> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }).toString(),
  });

  const payload = (await response.json().catch(() => null)) as { id_token?: string } | null;
  if (!response.ok || !payload?.id_token) {
    throw new HttpError(502, 'Google rejected the sign-in attempt.');
  }
  return { idToken: payload.id_token };
}

interface UserRow {
  id: string;
  email: string;
  google_sub: string | null;
}

/**
 * Decides whether a Google identity is allowed in, and returns the account id to
 * open a session for.
 *
 * The important rule: **a Google identity never silently creates an account.**
 * Anyone in the world has a Google account, so treating a successful Google
 * sign-in as permission to enter would hand this workspace to the internet. A
 * Google login can only attach to an account an Owner already created — except
 * on a brand-new workspace, where it takes the place of first-run setup and
 * becomes the Owner.
 */
export function resolveGoogleUser(db: Db, profile: GoogleProfile, config: GoogleConfig): string {
  if (config.allowedDomains.length) {
    const domain = profile.email.split('@')[1] ?? '';
    if (!config.allowedDomains.includes(domain)) {
      throw new HttpError(403, `Only ${config.allowedDomains.join(', ')} accounts can sign in here.`);
    }
  }

  // Already linked: the subject is authoritative, since the address can change.
  const linked = db
    .prepare('SELECT id, email, google_sub FROM users WHERE google_sub = ?')
    .get(profile.sub) as UserRow | undefined;
  if (linked) {
    if (linked.email !== profile.email) {
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(profile.email, linked.id);
    }
    return linked.id;
  }

  // First Google sign-in for an account that already exists: link them.
  const byEmail = db
    .prepare('SELECT id, email, google_sub FROM users WHERE email = ?')
    .get(profile.email) as UserRow | undefined;
  if (byEmail) {
    db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(profile.sub, byEmail.id);
    return byEmail.id;
  }

  const userCount = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (userCount === 0) {
    // Empty workspace: this is first-run setup, so the first person in owns it.
    const id = newId();
    transact(db, () => {
      db.prepare(
        `INSERT INTO users (id, name, email, role, permission, password_hash, password_salt, google_sub, created_at)
         VALUES (?, ?, ?, '', 'Owner', '', '', ?, ?)`,
      ).run(id, profile.name, profile.email, profile.sub, new Date().toISOString());
      writeAccess(db, id, fullAccess());
    });
    return id;
  }

  throw new HttpError(
    403,
    `There is no Client Ops account for ${profile.email}. Ask a workspace Owner to add you first.`,
  );
}
