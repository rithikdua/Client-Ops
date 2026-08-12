import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/index';

export const SESSION_COOKIE = 'clientops_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Secret used to sign session cookies. A generated fallback keeps development
 * working, but it changes on restart (invalidating sessions) and is refused
 * outright in production — an unset secret there would mean forgeable cookies.
 */
function sessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production.');
  }
  return devSecret;
}
const devSecret = randomBytes(32).toString('hex');

function sign(sessionId: string): string {
  return createHmac('sha256', sessionSecret()).update(sessionId).digest('hex');
}

/** Cookie value is `<id>.<hmac>` so a tampered id is rejected before any DB hit. */
export function serializeCookie(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

export function parseCookie(value: string | undefined): string | null {
  if (!value) return null;
  const idx = value.lastIndexOf('.');
  if (idx <= 0) return null;
  const id = value.slice(0, idx);
  const mac = Buffer.from(value.slice(idx + 1), 'hex');
  const expected = Buffer.from(sign(id), 'hex');
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  return id;
}

export const OAUTH_COOKIE = 'clientops_oauth';
/** The OAuth handshake is a single round trip; ten minutes is generous. */
const OAUTH_TTL_MS = 10 * 60 * 1000;

/**
 * Signs a small JSON payload for a short-lived cookie — used to carry the OAuth
 * state, nonce and PKCE verifier across the redirect to Google without storing
 * them server-side.
 */
export function signPayload(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${createHmac('sha256', sessionSecret()).update(body).digest('hex')}`;
}

export function readSignedPayload<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return null;
  const body = raw.slice(0, idx);
  const mac = Buffer.from(raw.slice(idx + 1), 'hex');
  const expected = Buffer.from(
    createHmac('sha256', sessionSecret()).update(body).digest('hex'),
    'hex',
  );
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function oauthCookieOptions() {
  return { ...cookieOptions(), maxAge: OAUTH_TTL_MS };
}

export interface SessionRow {
  id: string;
  user_id: string;
  preview_as_id: string | null;
  expires_at: string;
}

export function createSession(db: Db, userId: string): string {
  const id = randomBytes(24).toString('hex');
  const now = new Date();
  db.prepare(
    'INSERT INTO sessions (id, user_id, preview_as_id, created_at, expires_at) VALUES (?, ?, NULL, ?, ?)',
  ).run(id, userId, now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString());
  return id;
}

export function getSession(db: Db, id: string): SessionRow | null {
  const row = db
    .prepare('SELECT id, user_id, preview_as_id, expires_at FROM sessions WHERE id = ?')
    .get(id) as SessionRow | undefined;
  if (!row) return null;
  if (new Date(row.expires_at) <= new Date()) {
    destroySession(db, id);
    return null;
  }
  return row;
}

export function destroySession(db: Db, id: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function setPreviewAs(db: Db, sessionId: string, previewAsId: string | null): void {
  db.prepare('UPDATE sessions SET preview_as_id = ? WHERE id = ?').run(previewAsId, sessionId);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}
