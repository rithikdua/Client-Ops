import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

const { clearJwksCache, verifyJwtSignature } = await import('../src/auth/jwks');
const { validateClaims } = await import('../src/auth/google');
const { HttpError } = await import('../src/http/errors');

/** A stand-in for Google's signing key, so this runs entirely offline. */
const real = generateKeyPairSync('rsa', { modulusLength: 2048 });
/** A key Google never published — used to forge a token.  */
const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });

const KID = 'test-key-1';
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function sign(payload: object, key: KeyObject, header: object = { alg: 'RS256', kid: KID }): string {
  const body = `${b64(header)}.${b64(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  return `${body}.${signer.sign(key).toString('base64url')}`;
}

/** An unsigned "alg: none" token, the classic JWT bypass attempt. */
function unsigned(payload: object): string {
  return `${b64({ alg: 'none', kid: KID })}.${b64(payload)}.`;
}

const CONFIG = {
  clientId: 'test-client.apps.googleusercontent.com',
  clientSecret: 'secret',
  redirectUri: 'http://localhost:5173/api/auth/google/callback',
  allowedDomains: [] as string[],
};

const claims = (over: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CONFIG.clientId,
  exp: Math.floor(Date.now() / 1000) + 300,
  iat: Math.floor(Date.now() / 1000),
  sub: 'subject-1',
  email: 'someone@example.com',
  email_verified: true,
  name: 'Someone',
  nonce: 'the-nonce',
  ...over,
});

let server: Server;
let requestCount = 0;

before(async () => {
  const jwk = real.publicKey.export({ format: 'jwk' });
  server = createServer((_req, res) => {
    requestCount++;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'public, max-age=3600');
    res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  process.env.GOOGLE_JWKS_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/certs`;
  clearJwksCache();
});

after(() => {
  delete process.env.GOOGLE_JWKS_URL;
  clearJwksCache();
  server.close();
});

describe('ID token signature verification (H-11)', () => {
  test('accepts a token genuinely signed by the published key', async () => {
    const payload = await verifyJwtSignature(sign(claims(), real.privateKey));
    assert.equal(payload.sub, 'subject-1');
    assert.equal(payload.email, 'someone@example.com');
  });

  test('rejects a token signed by a key Google never published', async () => {
    // The forgery is well-formed and every claim is perfect — only the signature
    // is wrong. Without verification this would have been accepted.
    await assert.rejects(
      () => verifyJwtSignature(sign(claims(), attacker.privateKey)),
      (err: unknown) => err instanceof HttpError && /signature is not valid/.test(err.message),
    );
  });

  test('rejects a tampered payload', async () => {
    const token = sign(claims(), real.privateKey);
    const [header, , signature] = token.split('.');
    const swapped = `${header}.${b64(claims({ email: 'attacker@evil.com' }))}.${signature}`;
    await assert.rejects(() => verifyJwtSignature(swapped), /signature is not valid/);
  });

  test('refuses "alg: none" and any algorithm other than RS256', async () => {
    await assert.rejects(() => verifyJwtSignature(unsigned(claims())), /algorithm/);
    await assert.rejects(
      () => verifyJwtSignature(sign(claims(), real.privateKey, { alg: 'HS256', kid: KID })),
      /algorithm/,
    );
  });

  test('refuses a token that names no key, or an unknown one', async () => {
    await assert.rejects(
      () => verifyJwtSignature(sign(claims(), real.privateKey, { alg: 'RS256' })),
      /which key/,
    );
    await assert.rejects(
      () => verifyJwtSignature(sign(claims(), real.privateKey, { alg: 'RS256', kid: 'not-a-key' })),
      /unrecognised key/,
    );
  });

  test('refuses malformed tokens', async () => {
    for (const bad of ['', 'not-a-token', 'a.b', 'a.b.c.d']) {
      await assert.rejects(() => verifyJwtSignature(bad));
    }
  });

  test('caches the key set instead of fetching per sign-in', async () => {
    clearJwksCache();
    requestCount = 0;
    for (let i = 0; i < 5; i++) await verifyJwtSignature(sign(claims(), real.privateKey));
    assert.equal(requestCount, 1, 'one fetch served five verifications');
  });

  test('re-fetches once when a token names a key it has not seen', async () => {
    clearJwksCache();
    await verifyJwtSignature(sign(claims(), real.privateKey));
    requestCount = 0;
    // Key rotation looks exactly like this, so a stale cache must not be fatal.
    await assert.rejects(
      () => verifyJwtSignature(sign(claims(), real.privateKey, { alg: 'RS256', kid: 'rotated' })),
      /unrecognised key/,
    );
    assert.equal(requestCount, 1, 'refreshed once before giving up');
  });
});

describe('claim checks after verification', () => {
  test('a token with no expiry is refused rather than accepted forever', () => {
    const { exp, ...noExp } = claims();
    void exp;
    assert.throws(() => validateClaims(noExp, CONFIG, 'the-nonce'), /no expiry/);
  });

  test('an expired token is refused', () => {
    assert.throws(
      () => validateClaims(claims({ exp: Math.floor(Date.now() / 1000) - 1 }), CONFIG, 'the-nonce'),
      /took too long/,
    );
  });

  test('audience, issuer, nonce and verified email are all still enforced', () => {
    assert.throws(() => validateClaims(claims({ aud: 'other' }), CONFIG, 'the-nonce'), /different application/);
    assert.throws(() => validateClaims(claims({ iss: 'https://evil' }), CONFIG, 'the-nonce'), /issuer/);
    assert.throws(() => validateClaims(claims(), CONFIG, 'wrong-nonce'), /did not match/);
    assert.throws(
      () => validateClaims(claims({ email_verified: false }), CONFIG, 'the-nonce'),
      /not verified/,
    );
  });
});
