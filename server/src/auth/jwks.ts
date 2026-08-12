import { createPublicKey, verify as verifySignature, type KeyObject } from 'node:crypto';
import { HttpError } from '../http/errors';

/**
 * Verifies RS256 JWTs against a published JWKS.
 *
 * The ID token arrives from Google's token endpoint over a direct TLS connection,
 * so its signature is not strictly load-bearing. Checking it anyway costs one
 * cached HTTP request and removes a whole class of "what if that assumption
 * changes" question — if the token is ever accepted from somewhere else (a client
 * posting it, a proxy in the middle), this is what stops a forgery.
 */

interface Jwk {
  kty?: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface CachedKeys {
  keys: Map<string, KeyObject>;
  expiresAt: number;
}

const DEFAULT_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const MIN_TTL_MS = 5 * 60_000;
const DEFAULT_TTL_MS = 60 * 60_000;

const cache = new Map<string, CachedKeys>();

export function jwksUrl(): string {
  return process.env.GOOGLE_JWKS_URL?.trim() || DEFAULT_JWKS_URL;
}

/** Discards the cached key sets. Used by tests and after a verification failure. */
export function clearJwksCache(): void {
  cache.clear();
}

/** Honours the endpoint's own cache headers rather than guessing a lifetime. */
function ttlFromResponse(response: Response): number {
  const header = response.headers.get('cache-control') ?? '';
  const match = /max-age=(\d+)/i.exec(header);
  if (!match) return DEFAULT_TTL_MS;
  return Math.max(MIN_TTL_MS, Number(match[1]) * 1000);
}

async function loadKeys(url: string): Promise<Map<string, KeyObject>> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new HttpError(502, 'Could not reach Google to verify the sign-in.');
  }
  if (!response.ok) throw new HttpError(502, 'Google’s signing keys are unavailable.');

  const payload = (await response.json().catch(() => null)) as { keys?: Jwk[] } | null;
  if (!payload?.keys?.length) throw new HttpError(502, 'Google returned no signing keys.');

  const keys = new Map<string, KeyObject>();
  for (const jwk of payload.keys) {
    // Only RSA signing keys are usable here; anything else is ignored rather
    // than trusted.
    if (jwk.kty !== 'RSA' || !jwk.kid || !jwk.n || !jwk.e) continue;
    if (jwk.alg && jwk.alg !== 'RS256') continue;
    try {
      keys.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
    } catch {
      /* a malformed key is skipped, not fatal */
    }
  }
  if (keys.size === 0) throw new HttpError(502, 'Google returned no usable signing keys.');

  cache.set(url, { keys, expiresAt: Date.now() + ttlFromResponse(response) });
  return keys;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

/**
 * Checks the signature and returns the raw payload. Claim checks (audience,
 * issuer, expiry, nonce) are the caller's job — see `validateClaims`.
 */
export async function verifyJwtSignature(token: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(502, 'Malformed ID token.');

  let header: JwtHeader;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as JwtHeader;
  } catch {
    throw new HttpError(502, 'Unreadable ID token header.');
  }

  // Pin the algorithm. Accepting whatever the token asks for is how "alg: none"
  // and HMAC-key-confusion attacks work.
  if (header.alg !== 'RS256') {
    throw new HttpError(502, `Unexpected ID token algorithm: ${header.alg ?? 'none'}`);
  }
  if (!header.kid) throw new HttpError(502, 'ID token does not say which key signed it.');

  const url = jwksUrl();
  let keys = await loadKeys(url);
  let key = keys.get(header.kid);
  if (!key) {
    // Google rotates keys; an unknown kid may just mean our cache is stale.
    cache.delete(url);
    keys = await loadKeys(url);
    key = keys.get(header.kid);
  }
  if (!key) throw new HttpError(502, 'ID token was signed with an unrecognised key.');

  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2], 'base64url');
  if (!verifySignature('RSA-SHA256', signed, key, signature)) {
    throw new HttpError(401, 'The sign-in token’s signature is not valid.');
  }

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new HttpError(502, 'Unreadable ID token payload.');
  }
}
