import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { ALL_ACCESS } from '../../src/data/options';
import { createUser } from '../src/auth/accounts';
import {
  googleConfig,
  isGoogleEnabled,
  resolveGoogleUser,
  startAuth,
  validateClaims,
  type GoogleConfig,
  type GoogleProfile,
} from '../src/auth/google';
import { openDb, type Db } from '../src/db/index';
import { HttpError } from '../src/http/errors';

const CONFIG: GoogleConfig = {
  clientId: 'test-client-id.apps.googleusercontent.com',
  clientSecret: 'test-secret',
  redirectUri: 'http://localhost:5173/api/auth/google/callback',
  allowedDomains: [],
};

const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: 'google-sub-1',
  email: 'someone@example.com',
  emailVerified: true,
  name: 'Someone',
  ...over,
});

const claims = (over: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CONFIG.clientId,
  exp: Math.floor(Date.now() / 1000) + 300,
  sub: 'google-sub-1',
  email: 'Someone@Example.com',
  email_verified: true,
  name: 'Someone',
  nonce: 'the-nonce',
  ...over,
});

describe('configuration', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.GOOGLE_CLIENT_ID = saved.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = saved.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_ALLOWED_DOMAINS = saved.GOOGLE_ALLOWED_DOMAINS;
  });

  test('stays switched off until both credentials are present', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    assert.equal(isGoogleEnabled(), false);

    process.env.GOOGLE_CLIENT_ID = 'id';
    assert.equal(isGoogleEnabled(), false, 'a client id alone is not enough');

    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    assert.equal(isGoogleEnabled(), true);
  });

  test('parses the allowed-domain list', () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_ALLOWED_DOMAINS = 'Phot.ai, example.com ,';
    assert.deepEqual(googleConfig()?.allowedDomains, ['phot.ai', 'example.com']);
  });
});

describe('the authorization request', () => {
  test('asks Google for exactly what we need, with PKCE and anti-forgery values', () => {
    const { url, pending } = startAuth(CONFIG);
    const parsed = new URL(url);
    const q = parsed.searchParams;

    assert.equal(parsed.origin + parsed.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(q.get('client_id'), CONFIG.clientId);
    assert.equal(q.get('redirect_uri'), CONFIG.redirectUri);
    assert.equal(q.get('response_type'), 'code');
    assert.equal(q.get('scope'), 'openid email profile');
    assert.equal(q.get('code_challenge_method'), 'S256');
    assert.equal(q.get('state'), pending.state);
    assert.equal(q.get('nonce'), pending.nonce);
    // The verifier itself must never travel to Google.
    assert.ok(!url.includes(pending.verifier), 'PKCE verifier must stay on the server');
    assert.ok(q.get('code_challenge') && q.get('code_challenge') !== pending.verifier);
    // Identity only: no refresh token, nothing to store long-term.
    assert.equal(q.get('access_type'), 'online');
  });

  test('every attempt gets fresh unguessable values', () => {
    const a = startAuth(CONFIG).pending;
    const b = startAuth(CONFIG).pending;
    assert.notEqual(a.state, b.state);
    assert.notEqual(a.nonce, b.nonce);
    assert.notEqual(a.verifier, b.verifier);
    assert.ok(a.state.length >= 30);
    assert.ok(a.verifier.length >= 40);
  });
});

describe('ID token claims', () => {
  test('accepts a well-formed token and normalises the email', () => {
    const result = validateClaims(claims(), CONFIG, 'the-nonce');
    assert.equal(result.email, 'someone@example.com');
    assert.equal(result.sub, 'google-sub-1');
    assert.equal(result.name, 'Someone');
  });

  test('rejects a token issued for another application', () => {
    assert.throws(
      () => validateClaims(claims({ aud: 'someone-elses-client-id' }), CONFIG, 'the-nonce'),
      /different application/,
    );
  });

  test('rejects the wrong issuer, a replayed nonce and an expired token', () => {
    assert.throws(() => validateClaims(claims({ iss: 'https://evil.example' }), CONFIG, 'the-nonce'), /issuer/);
    assert.throws(() => validateClaims(claims(), CONFIG, 'a-different-nonce'), /did not match/);
    assert.throws(
      () => validateClaims(claims({ exp: Math.floor(Date.now() / 1000) - 10 }), CONFIG, 'the-nonce'),
      /took too long/,
    );
  });

  test('refuses an unverified Google address', () => {
    assert.throws(
      () => validateClaims(claims({ email_verified: false }), CONFIG, 'the-nonce'),
      /not verified/,
    );
  });
});

describe('who a Google identity is allowed to be', () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => {
    db.close();
  });

  const addUser = (email: string, permission: 'Owner' | 'Editor' = 'Editor') =>
    createUser(db, {
      name: email,
      email,
      permission,
      password: 'chosen-phrase-1234',
      access: { ...ALL_ACCESS },
    });

  test('signs in an existing account and links the Google subject to it', () => {
    const id = addUser('someone@example.com');
    const resolved = resolveGoogleUser(db, profile(), CONFIG);
    assert.equal(resolved, id, 'matched the existing account by email');

    const row = db.prepare('SELECT google_sub FROM users WHERE id = ?').get(id) as {
      google_sub: string;
    };
    assert.equal(row.google_sub, 'google-sub-1', 'the link is stored for next time');

    // Second time through it matches on the subject, not the address.
    assert.equal(resolveGoogleUser(db, profile(), CONFIG), id);
  });

  test('follows a changed Google email address via the stable subject', () => {
    const id = addUser('someone@example.com');
    resolveGoogleUser(db, profile(), CONFIG);

    const resolved = resolveGoogleUser(db, profile({ email: 'new-address@example.com' }), CONFIG);
    assert.equal(resolved, id);
    const row = db.prepare('SELECT email FROM users WHERE id = ?').get(id) as { email: string };
    assert.equal(row.email, 'new-address@example.com');
  });

  test('REFUSES a Google account with no matching Client Ops account', () => {
    addUser('someone-else@example.com', 'Owner');
    // This is the rule that stops the whole internet signing in.
    assert.throws(
      () => resolveGoogleUser(db, profile({ email: 'stranger@gmail.com' }), CONFIG),
      (err: unknown) =>
        err instanceof HttpError && err.status === 403 && /no Client Ops account/.test(err.message),
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n,
      1,
      'no account was created',
    );
  });

  test('on a brand-new workspace the first Google user becomes the Owner', () => {
    const id = resolveGoogleUser(db, profile({ email: 'founder@example.com' }), CONFIG);
    const row = db
      .prepare('SELECT permission, email, password_hash, google_sub FROM users WHERE id = ?')
      .get(id) as { permission: string; email: string; password_hash: string; google_sub: string };

    assert.equal(row.permission, 'Owner');
    assert.equal(row.email, 'founder@example.com');
    assert.equal(row.password_hash, '', 'a Google-only account has no password');
    assert.equal(row.google_sub, 'google-sub-1');

    const access = db
      .prepare('SELECT COUNT(*) AS n FROM user_access WHERE user_id = ? AND allowed = 1')
      .get(id) as { n: number };
    assert.equal(access.n, 8, 'the first Owner holds every section');

    // And the door closes behind them.
    assert.throws(
      () => resolveGoogleUser(db, profile({ sub: 'another-sub', email: 'stranger@gmail.com' }), CONFIG),
      /no Client Ops account/,
    );
  });

  test('enforces the allowed-domain list before anything else', () => {
    const restricted: GoogleConfig = { ...CONFIG, allowedDomains: ['phot.ai'] };
    assert.throws(
      () => resolveGoogleUser(db, profile({ email: 'someone@gmail.com' }), restricted),
      /Only phot.ai accounts/,
    );
    // Even on an empty workspace, where setup would otherwise be allowed.
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n, 0);

    const allowed = resolveGoogleUser(db, profile({ email: 'founder@phot.ai' }), restricted);
    assert.ok(allowed);
  });
});
