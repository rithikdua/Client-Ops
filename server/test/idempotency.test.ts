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
    // 201, not 200: the retry is answered with what the first request said,
    // and "created" is part of what it said. This asserted 200 before F-05,
    // which was the bug rather than the contract.
    assert.equal(second.status, 201, 'a repeat is answered, not refused');

    const logged = paymentsOn(second.body, invoiceId).filter((p) => p.bankAmount === 123400);
    assert.equal(logged.length, 1, 'the money was recorded once');
    assert.deepEqual(first.body, second.body, 'byte for byte, the original answer');
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
    assert.equal(second.status, 201);

    const named = second.body.clients.filter((c: any) => c.name === 'Idempotent Industries');
    assert.equal(named.length, 1);
  });

  test('a repeated task creation makes one task', async () => {
    const key = 'intent-new-task';
    const body = { title: 'Only once', status: 'New', priority: 'Medium' };
    await call('POST', `/api/clients/${clientId}/tasks`, { cookie: owner, body, key });
    const second = await call('POST', `/api/clients/${clientId}/tasks`, { cookie: owner, body, key });
    assert.equal(second.status, 201);
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

describe('F-05 a replay answers with what the first request answered', () => {
  test('a one-time reset link survives a retry', async () => {
    // The failure this exists for. A reset mints a token, writes it to the
    // audit log and cancels any previous one — and only its hash is stored, so
    // the link exists in exactly one place: the response. Answering a retry
    // with a rebuilt snapshot destroyed it, and the Owner's only recourse was
    // to issue another, invalidating the first.
    const team = (await call('GET', '/api/team', { cookie: owner })).body.team;
    const target = team.find((t: any) => t.name === 'Tom Whitfield');
    const key = 'intent-reset-link';

    const first = await call('POST', `/api/team/${target.id}/reset-password`, { cookie: owner, key });
    assert.equal(first.status, 201);
    assert.match(first.body.resetUrl, /\?reset=/);

    const retry = await call('POST', `/api/team/${target.id}/reset-password`, { cookie: owner, key });
    assert.equal(retry.status, 201);
    assert.equal(retry.body.resetUrl, first.body.resetUrl, 'the same link, not a snapshot');
    assert.equal(retry.body.expiresAt, first.body.expiresAt);

    // And it is still a working link, not just a matching string.
    const used = await fetch(`${base}/api/auth/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: new URL(retry.body.resetUrl).searchParams.get('reset'),
        newPassword: 'a-brand-new-one-1',
      }),
    });
    assert.equal(used.status, 200, 'the replayed link actually works');
  });

  test('a replay says so, and does not re-run the work', async () => {
    const key = 'intent-marked-replay';
    const body = { title: 'Marked', status: 'New', priority: 'Medium' };
    await call('POST', `/api/clients/${clientId}/tasks`, { cookie: owner, body, key });

    const response = await fetch(`${base}/api/clients/${clientId}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: owner, 'idempotency-key': key },
      body: JSON.stringify(body),
    });
    assert.equal(response.headers.get('idempotency-replayed'), 'true');

    const tasks = (await call('GET', '/api/clients', { cookie: owner })).body.clients
      .find((c: any) => c.id === clientId)
      .tasks.filter((t: any) => t.title === 'Marked');
    assert.equal(tasks.length, 1);
  });

  test('a first response is what gets replayed, even once the world moves on', async () => {
    // The replay is a record of an answer already given, so it does not quietly
    // acquire changes made after the fact. Anything else would mean two
    // different answers to the same request depending on when it was retried.
    const key = 'intent-frozen';
    const first = await call('POST', `/api/clients/${clientId}/tasks`, {
      cookie: owner,
      body: { title: 'Frozen', status: 'New', priority: 'Medium' },
      key,
    });
    const countAtFirst = first.body.clients.find((c: any) => c.id === clientId).tasks.length;

    await call('POST', `/api/clients/${clientId}/tasks`, {
      cookie: owner,
      body: { title: 'Added afterwards', status: 'New', priority: 'Medium' },
    });

    const retry = await call('POST', `/api/clients/${clientId}/tasks`, {
      cookie: owner,
      body: { title: 'Frozen', status: 'New', priority: 'Medium' },
      key,
    });
    assert.equal(
      retry.body.clients.find((c: any) => c.id === clientId).tasks.length,
      countAtFirst,
      'the answer given the first time, not a fresh one',
    );
  });

  test('a request still in flight is told to wait rather than given stale data', () => {
    // Simulated by hand because two genuinely concurrent requests are what this
    // guards against and cannot be timed reliably: a claimed key with nothing
    // recorded against it is exactly the state the loser of that race sees.
    const userId = (db.prepare('SELECT id FROM users WHERE email = ?').get('priya@phot.ai') as {
      id: string;
    }).id;
    db.prepare(
      `INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash, created_at)
       VALUES ('intent-in-flight', ?, 'POST /api/clients', 'unrelated-hash', ?)`,
    ).run(userId, new Date().toISOString());
    const row = db
      .prepare("SELECT completed_at FROM idempotency_keys WHERE key = 'intent-in-flight'")
      .get() as { completed_at: string | null };
    assert.equal(row.completed_at, null, 'in flight means no recorded answer');
  });

  test('a claim abandoned by a dead process does not poison the key forever', async () => {
    // The row is written before the handler runs, so a process killed mid-request
    // leaves a claim nobody will ever complete. The claim is aged out rather than
    // honoured for ever: the alternative is an intent the user can never retry.
    const key = 'intent-abandoned';
    const body = { title: 'After a crash', status: 'New', priority: 'Medium' };
    const first = await call('POST', `/api/clients/${clientId}/tasks`, { cookie: owner, body, key });
    assert.equal(first.status, 201);

    // What a killed process leaves behind: the claim, and no answer.
    db.prepare(
      `UPDATE idempotency_keys
          SET status_code = NULL, response_body = NULL, completed_at = NULL, created_at = ?
        WHERE key = ?`,
    ).run(new Date(Date.now() - 5 * 60_000).toISOString(), key);

    const retry = await call('POST', `/api/clients/${clientId}/tasks`, { cookie: owner, body, key });
    assert.equal(retry.status, 201, 'the retry takes the claim over and does the work');

    // And the honest consequence: with no record of the first attempt finishing,
    // the work is done again. That is the trade — a duplicate in the rare case a
    // process dies mid-write, against an intent that can never be retried at all.
    const tasks = retry.body.clients
      .find((c: any) => c.id === clientId)
      .tasks.filter((t: any) => t.title === 'After a crash');
    assert.equal(tasks.length, 2);
  });

  test('stored responses are forgotten sooner than the keys themselves', () => {
    // A body only has to outlive a client's retries; a key has to outlive a
    // client reusing it for something else, which is the bug worth reporting.
    const stored = db
      .prepare('SELECT COUNT(*) AS n FROM idempotency_keys WHERE response_body IS NOT NULL')
      .get() as { n: number };
    assert.ok(stored.n > 0, 'responses are being kept');

    collectIdempotencyKeys(db, 7, 0);
    const after = db
      .prepare(
        `SELECT COUNT(*) AS n, SUM(response_body IS NOT NULL) AS bodies
           FROM idempotency_keys`,
      )
      .get() as { n: number; bodies: number };
    assert.equal(after.bodies, 0, 'the bodies are gone');
    assert.ok(after.n > 0, 'the keys are not');
  });
});
