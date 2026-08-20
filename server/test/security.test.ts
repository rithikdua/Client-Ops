import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

process.env.SESSION_SECRET = 'test-secret';

const { createApp } = await import('../src/app');
const { openDb } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');

const db = openDb(':memory:');
seedDemoWorkspace(db, { password: 'demo-pass-2026!' });
const server = createApp(db).listen(0);
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const selfOrigin = base;

let cookie = '';

before(async () => {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'priya@phot.ai', password: 'demo-pass-2026!' }),
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie') ?? '';
  cookie = setCookie.split(';')[0];
});

after(() => {
  server.close();
  db.close();
});

describe('H-07 security headers', () => {
  test('every response carries the hardening headers', async () => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.match(response.headers.get('permissions-policy') ?? '', /camera=\(\)/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  test('error responses are hardened too', async () => {
    const response = await fetch(`${base}/api/clients`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  test('the server does not announce what it runs', async () => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  test('HSTS is withheld over plain HTTP', async () => {
    // Sending it on an unencrypted dev server would pin localhost to https in
    // the developer's browser for a year.
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.headers.get('strict-transport-security'), null);
  });

  test('HSTS is sent when a trusted proxy reports TLS', async () => {
    process.env.TRUST_PROXY = '1';
    try {
      const response = await fetch(`${base}/api/health`, {
        headers: { 'x-forwarded-proto': 'https' },
      });
      assert.match(response.headers.get('strict-transport-security') ?? '', /max-age=31536000/);
    } finally {
      delete process.env.TRUST_PROXY;
    }
  });

  test('X-Forwarded-Proto is ignored when no proxy is configured', async () => {
    const response = await fetch(`${base}/api/health`, {
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert.equal(response.headers.get('strict-transport-security'), null);
  });
});

describe('H-08 cross-site request rejection', () => {
  test('a write from another origin is refused', async () => {
    const response = await fetch(`${base}/api/followups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin: 'https://evil.example' },
      body: JSON.stringify({ name: 'Forged', dueDate: '2026-09-01' }),
    });
    assert.equal(response.status, 403);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /Cross-site/);
  });

  test('a cross-site form post is refused before the body is read', async () => {
    // No preflight protects this shape: a plain <form> can post it.
    const response = await fetch(`${base}/api/followups`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
        origin: 'https://evil.example',
      },
      body: 'name=Forged&dueDate=2026-09-01',
    });
    assert.equal(response.status, 403);
  });

  test('Sec-Fetch-Site alone is enough to refuse it', async () => {
    const response = await fetch(`${base}/api/followups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ name: 'Forged', dueDate: '2026-09-01' }),
    });
    assert.equal(response.status, 403);
  });

  test('a sibling subdomain is not trusted either', async () => {
    const response = await fetch(`${base}/api/followups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'sec-fetch-site': 'same-site' },
      body: JSON.stringify({ name: 'Forged', dueDate: '2026-09-01' }),
    });
    assert.equal(response.status, 403);
  });

  test('the app’s own origin is accepted', async () => {
    const response = await fetch(`${base}/api/followups`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        origin: selfOrigin,
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ name: 'Genuine', dueDate: '2026-09-01' }),
    });
    assert.equal(response.status, 201);
  });

  test('a configured front-end origin is accepted', async () => {
    process.env.APP_URL = 'https://ops.example.com/';
    try {
      const response = await fetch(`${base}/api/followups`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
          // Trailing slash on the configured value must not matter.
          origin: 'https://ops.example.com',
        },
        body: JSON.stringify({ name: 'From the app', dueDate: '2026-09-01' }),
      });
      assert.equal(response.status, 201);
    } finally {
      delete process.env.APP_URL;
    }
  });

  test('the development front end is accepted through the Vite proxy', async () => {
    // The proxy rewrites Host to the API's port but forwards the browser's
    // Origin untouched, so these two disagree by design. Getting this wrong
    // 403s the app against itself on every developer's machine.
    assert.equal(process.env.APP_URL, undefined, 'this test is about the unconfigured case');
    const response = await fetch(`${base}/api/followups`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        origin: 'http://localhost:5173',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ name: 'Through the proxy', dueDate: '2026-09-01' }),
    });
    assert.equal(response.status, 201);
  });

  test('production does not fall back to a localhost origin', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const response = await fetch(`${base}/api/followups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost:5173' },
        body: JSON.stringify({ name: 'Should not land', dueDate: '2026-09-01' }),
      });
      assert.equal(response.status, 403);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  test('reads are never blocked by the origin check', async () => {
    // A cross-origin read is stopped by the browser (we send no CORS headers);
    // blocking it here would break nothing but the Google sign-in redirect.
    const response = await fetch(`${base}/api/auth/status`, {
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(response.status, 200);
  });

  test('a non-browser client with no origin still works', async () => {
    const response = await fetch(`${base}/api/followups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'From a script', dueDate: '2026-09-01' }),
    });
    assert.equal(response.status, 201);
  });
});
