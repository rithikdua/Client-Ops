import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.SESSION_SECRET = 'test-secret';
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'client-ops-idem-'));

const { createApp } = await import('../src/app');
const { openDb } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');
const { collectIdempotencyKeys } = await import('../src/http/idempotency');

const db = openDb(':memory:');
seedDemoWorkspace(db, { password: 'demo-pass-2026!' });
const server = createApp(db).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let owner = '';
let clientId = '';
let invoiceId = '';

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string; key?: string } = {},
): Promise<{ status: number; body: any }> {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.key ? { 'idempotency-key': opts.key } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function paymentsOn(body: any, id: string): { bankAmount: number; tds: number }[] {
  for (const c of body.clients) {
    const inv = (c.invoices ?? []).find((i: any) => i.id === id);
    if (inv) return inv.payments;
  }
  return [];
}

before(async () => {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'priya@phot.ai', password: 'demo-pass-2026!' }),
  });
  owner = (login.headers.getSetCookie?.()[0] ?? '').split(';')[0];

  const snapshot = await call('GET', '/api/clients', { cookie: owner });
  clientId = snapshot.body.clients[0].id;
  const created = await call('POST', `/api/clients/${clientId}/invoices`, {
    cookie: owner,
    body: {
      number: 'INV-IDEM-1',
      baseAmount: 10000,
      gstPercent: 0,
      gstMode: 'excluded',
      issueDate: '2026-02-01',
      dueDate: '2026-03-01',
    },
  });
  invoiceId = created.body.clients
    .find((c: any) => c.id === clientId)
    .invoices.find((i: any) => i.number === 'INV-IDEM-1').id;
});

after(() => {
  server.close();
  db.close();
});

describe('H-01 one intent cannot become two payments', () => {
  const payment = { bankAmount: 1234, tds: 0, date: '2026-02-10' };

  test('the same key twice logs one payment, and both responses agree', async () => {
    const key = 'intent-double-click';
    const first = await call('POST', `/api/clients/${clientId}/invoices/${invoiceId}/payments`, {
      cookie: owner,
      body: payment,
      key,
    });
    assert.equal(first.status, 201);

    // Exactly what a second click on a slow connection sends.
    const second = await call('POST', `/api/clients/${clientId}/invoices/${invoiceId}/payments`, {
      cookie: owner,
      body: payment,
      key,
    });
    assert.equal(second.status, 200, 'a repeat is answered, not refused');

    const logged = paymentsOn(second.body, invoiceId).filter((p) => p.bankAmount === 123400);
    assert.equal(logged.length, 1, 'the money was recorded once');
    // The replay still returns usable state, not an error the UI has to explain.
    assert.deepEqual(
      paymentsOn(first.body, invoiceId).length,
      paymentsOn(second.body, invoiceId).length,
    );
  });

  test('a genuinely second payment of the same amount still goes through', async () => {
    // The trap in naive deduplication: two identical instalments are legitimate.
    // Only a repeated *key* means a repeat.
    const before = paymentsOn(
      (await call('GET', '/api/clients', { cookie: owner })).body,
      invoiceId,
    ).length;

    const again = await call('POST', `/api/clients/${clientId}/invoices/${invoiceId}/payments`, {
      cookie: owner,
      body: payment,
      key: 'intent-a-different-instalment',
    });
    assert.equal(again.status, 201);
    assert.equal(paymentsOn(again.body, invoiceId).length, before + 1);
  });

  test('reusing a key for a different request is refused, not guessed at', async () => {
    const key = 'intent-reused';
    await call('POST', `/api/clients/${clientId}/invoices/${invoiceId}/payments`, {
      cookie: owner,
      body: { bankAmount: 500, tds: 0, date: '2026-02-11' },
      key,
    });
    const different = await call('POST', `/api/clients/${clientId}/invoices/${invoiceId}/payments`, {
      cookie: owner,
      body: { bankAmount: 900, tds: 0, date: '2026-02-11' },
      key,
    });
    assert.equal(different.status, 409);
    assert.match(different.body.error, /already used for a different request/);
  });

  test('a rejected request does not spend its key', async () => {
    const key = 'intent-corrected';
    // More than the invoice balance: refused by H-06.
    const tooMuch = await call('POST', `/api/clients/${clientId}/invoices/${invoiceId}/payments`, {
      cookie: owner,
      body: { bankAmount: 999999, tds: 0, date: '2026-02-12' },
      key,
    });
    assert.equal(tooMuch.status, 400);

    // Correcting the amount and submitting again must work — the user never left
    // the form, so the client is still holding the same key.
    const corrected = await call('POST', `/api/clients/${clientId}/invoices/${invoiceId}/payments`, {
      cookie: owner,
      body: { bankAmount: 100, tds: 0, date: '2026-02-12' },
      key,
    });
    assert.equal(corrected.status, 201, 'a failed attempt must not burn the key');
  });

  test('keys are scoped to the account that used them', async () => {
    const { createUser, setPassword } = await import('../src/auth/accounts');
    const id = createUser(db, {
      name: 'Second Person',
      email: 'idem-second@phot.ai',
      role: 'Ops',
      permission: 'Editor',
      password: 'settled-pass-1',
    });
    setPassword(db, id, 'settled-pass-1');
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'idem-second@phot.ai', password: 'settled-pass-1' }),
    });
    const other = (login.headers.getSetCookie?.()[0] ?? '').split(';')[0];

    const key = 'intent-shared-string';
    const mine = await call('POST', `/api/clients/${clientId}/invoices/${invoiceId}/payments`, {
      cookie: owner,
      body: { bankAmount: 50, tds: 0, date: '2026-02-13' },
      key,
    });
    assert.equal(mine.status, 201);
    // Someone else picking the same key string is not a duplicate of my request.
    const theirs = await call('POST', `/api/clients/${clientId}/invoices/${invoiceId}/payments`, {
      cookie: other,
      body: { bankAmount: 50, tds: 0, date: '2026-02-13' },
      key,
    });
    assert.equal(theirs.status, 201);
  });

  test('requests without a key are unaffected', async () => {
    const before = paymentsOn(
      (await call('GET', '/api/clients', { cookie: owner })).body,
      invoiceId,
    ).length;
    for (let i = 0; i < 2; i++) {
      const res = await call('POST', `/api/clients/${clientId}/invoices/${invoiceId}/payments`, {
        cookie: owner,
        body: { bankAmount: 25, tds: 0, date: '2026-02-14' },
      });
      assert.equal(res.status, 201);
    }
    const after = paymentsOn(
      (await call('GET', '/api/clients', { cookie: owner })).body,
      invoiceId,
    ).length;
    assert.equal(after, before + 2, 'scripts and the CLI keep their old behaviour');
  });
});

describe('M-05 the same guard covers the other creates', () => {
  test('a repeated client creation makes one client', async () => {
    const key = 'intent-new-client';
    const body = {
      name: 'Idempotent Industries',
      health: 'Active',
      stage: 'Onboarding',
      billingCycle: 'Monthly',
      startDate: '2026-01-05',
      baseAmount: 1000,
      gstPercent: 18,
      gstMode: 'excluded',
    };
    const first = await call('POST', '/api/clients', { cookie: owner, body, key });
    assert.equal(first.status, 201);
    const second = await call('POST', '/api/clients', { cookie: owner, body, key });
    assert.equal(second.status, 200);

    const named = second.body.clients.filter((c: any) => c.name === 'Idempotent Industries');
    assert.equal(named.length, 1);
  });

  test('a repeated task creation makes one task', async () => {
    const key = 'intent-new-task';
    const body = { title: 'Only once', status: 'New', priority: 'Medium' };
    await call('POST', `/api/clients/${clientId}/tasks`, { cookie: owner, body, key });
    const second = await call('POST', `/api/clients/${clientId}/tasks`, { cookie: owner, body, key });
    assert.equal(second.status, 200);
    const tasks = second.body.clients
      .find((c: any) => c.id === clientId)
      .tasks.filter((t: any) => t.title === 'Only once');
    assert.equal(tasks.length, 1);
  });

  test('spent keys are collectable so the table does not grow forever', () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM idempotency_keys').get() as { n: number })
      .n;
    assert.ok(before > 0, 'the tests above left keys behind');
    // Nothing is old enough yet.
    assert.equal(collectIdempotencyKeys(db, 7), 0);
    // Everything is, with a zero-day cutoff.
    assert.equal(collectIdempotencyKeys(db, 0), before);
  });
});
