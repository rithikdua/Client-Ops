import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

// Set before importing the app: the upload directory is read at module load.
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'client-ops-uploads-'));
process.env.SESSION_SECRET = 'test-secret';

const { createApp } = await import('../src/app');
const { openDb } = await import('../src/db/index');
const { seedDatabase } = await import('../src/db/seed');

const db = openDb(':memory:');
seedDatabase(db, { password: 'demo1234' });
const server = createApp(db).listen(0);
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

interface Session {
  cookie: string;
}

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; session?: Session } = {},
): Promise<{ status: number; body: any }> {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(opts.session ? { cookie: opts.session.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function signIn(email: string, password = 'demo1234'): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `sign-in failed for ${email}`);
  const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie') ?? '';
  return { cookie: setCookie.split(';')[0] };
}

let owner: Session;
let noInvoices: Session;
let viewer: Session;

before(async () => {
  owner = await signIn('priya@phot.ai');
  noInvoices = await signIn('daniel@phot.ai');
  viewer = await signIn('tom@phot.ai');
});

after(() => {
  server.close();
  db.close();
});

describe('authentication', () => {
  test('rejects a wrong password without revealing whether the account exists', async () => {
    const bad = await call('POST', '/api/auth/login', {
      body: { email: 'priya@phot.ai', password: 'nope' },
    });
    const missing = await call('POST', '/api/auth/login', {
      body: { email: 'nobody@phot.ai', password: 'nope' },
    });
    assert.equal(bad.status, 401);
    assert.equal(missing.status, 401);
    assert.equal(bad.body.error, missing.body.error);
  });

  test('refuses every data endpoint without a session', async () => {
    for (const [method, path] of [
      ['GET', '/api/auth/session'],
      ['GET', '/api/clients'],
      ['POST', '/api/clients'],
      ['GET', '/api/team'],
      ['GET', '/api/followups'],
    ] as const) {
      const res = await call(method, path, { body: method === 'POST' ? {} : undefined });
      assert.equal(res.status, 401, `${method} ${path} should require auth`);
    }
  });

  test('a forged session cookie is rejected', async () => {
    const res = await call('GET', '/api/auth/session', {
      session: { cookie: 'clientops_session=deadbeef.0000' },
    });
    assert.equal(res.status, 401);
  });
});

describe('money is withheld from users without invoice access', () => {
  test('the snapshot omits contract values and invoices entirely', async () => {
    const res = await call('GET', '/api/auth/session', { session: noInvoices });
    assert.equal(res.status, 200);
    assert.equal(res.body.me.access.invoices, false);
    for (const client of res.body.clients) {
      assert.equal('contractValue' in client, false, 'contract value must not be sent');
      assert.equal('baseAmount' in client, false);
      assert.equal('gstAmount' in client, false);
      assert.deepEqual(client.invoices, [], 'invoices must not be sent');
    }
  });

  test('invoice and payment endpoints are refused', async () => {
    const invoice = await call('POST', '/api/clients/c1/invoices', {
      session: noInvoices,
      body: {
        number: 'X-1',
        baseAmount: 100,
        gstPercent: 18,
        gstMode: 'excluded',
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
      },
    });
    assert.equal(invoice.status, 403);
  });

  test('contract money cannot be changed through the client endpoint either', async () => {
    const res = await call('PATCH', '/api/clients/c1', {
      session: noInvoices,
      body: { baseAmount: 1 },
    });
    assert.equal(res.status, 403);

    // The stored value is untouched.
    const check = await call('GET', '/api/auth/session', { session: owner });
    const client = check.body.clients.find((c: any) => c.id === 'c1');
    assert.equal(client.contractValue, 9600000);
  });

  test('sections a user lacks are absent, not merely hidden', async () => {
    const maya = await signIn('maya@phot.ai');
    const res = await call('GET', '/api/auth/session', { session: maya });
    assert.equal(res.body.me.access.documents, false);
    assert.deepEqual(res.body.followUps, []);
    for (const client of res.body.clients) {
      assert.deepEqual(client.documents, []);
    }
    assert.equal((await call('GET', '/api/followups', { session: maya })).status, 403);
  });
});

describe('read-only accounts', () => {
  test('a Viewer can read but every write is refused', async () => {
    const read = await call('GET', '/api/auth/session', { session: viewer });
    assert.equal(read.status, 200);
    assert.equal(read.body.me.canWrite, false);
    assert.ok(read.body.clients.length > 0);

    const writes = [
      ['POST', '/api/clients/c1/deliverables', { title: 'x', dueDate: '2026-09-01' }],
      ['POST', '/api/clients/c1/tasks', { title: 'x' }],
      ['POST', '/api/clients/c1/activity', { note: 'x' }],
      ['DELETE', '/api/clients/c1', undefined],
    ] as const;
    for (const [method, path, body] of writes) {
      const res = await call(method, path, { session: viewer, body });
      assert.equal(res.status, 403, `${method} ${path} should be read-only`);
    }
  });
});

describe('team administration', () => {
  test('a non-Owner cannot add teammates, change access, or preview', async () => {
    assert.equal(
      (
        await call('POST', '/api/team', {
          session: noInvoices,
          body: { name: 'X', email: 'x@phot.ai', password: 'password123' },
        })
      ).status,
      403,
    );
    assert.equal(
      (await call('PUT', '/api/team/tm4/access', { session: noInvoices, body: { access: {} } })).status,
      403,
    );
    assert.equal(
      (await call('POST', '/api/auth/preview', { session: noInvoices, body: { teammateId: 'tm4' } })).status,
      403,
    );
  });

  test('an Owner cannot delete their own account', async () => {
    const res = await call('DELETE', '/api/team/tm1', { session: owner });
    assert.equal(res.status, 400);
  });

  test('a new teammate can sign in and lands with the access they were given', async () => {
    const created = await call('POST', '/api/team', {
      session: owner,
      body: {
        name: 'Ravi Menon',
        email: 'ravi@phot.ai',
        role: 'Analyst',
        permission: 'Editor',
        password: 'correct-horse',
        access: { overview: true, clients: true },
      },
    });
    assert.equal(created.status, 201);

    const ravi = await signIn('ravi@phot.ai', 'correct-horse');
    const session = await call('GET', '/api/auth/session', { session: ravi });
    assert.equal(session.body.me.access.overview, true);
    assert.equal(session.body.me.access.invoices, false);
    assert.equal(session.body.me.access.team, false);
    assert.equal((await call('GET', '/api/team', { session: ravi })).status, 403);
  });

  test('duplicate email addresses are rejected', async () => {
    const res = await call('POST', '/api/team', {
      session: owner,
      body: { name: 'Copy', email: 'ravi@phot.ai', password: 'password123' },
    });
    assert.equal(res.status, 409);
  });
});

describe('preview as a teammate', () => {
  test("an Owner's own requests are evaluated as the previewed user, then restored", async () => {
    const started = await call('POST', '/api/auth/preview', {
      session: owner,
      body: { teammateId: 'tm2' },
    });
    assert.equal(started.status, 200);
    assert.equal(started.body.me.previewAs.name, 'Daniel Cho');
    assert.equal(started.body.me.access.invoices, false);

    // The restriction is real, not cosmetic: the Owner is now blocked too.
    assert.equal((await call('GET', '/api/clients/c1/invoices', { session: owner })).status, 403);

    const ended = await call('DELETE', '/api/auth/preview', { session: owner });
    assert.equal(ended.body.me.previewAs, null);
    assert.equal(ended.body.me.access.invoices, true);
  });

  test('previewing as a Viewer makes the Owner read-only', async () => {
    await call('POST', '/api/auth/preview', { session: owner, body: { teammateId: 'tm4' } });
    const write = await call('POST', '/api/clients/c1/tasks', {
      session: owner,
      body: { title: 'should fail' },
    });
    assert.equal(write.status, 403);
    await call('DELETE', '/api/auth/preview', { session: owner });
  });
});

describe('invoices and payments', () => {
  test('a logged payment moves the invoice through Partially Paid to Paid', async () => {
    const snapshot = await call('GET', '/api/auth/session', { session: owner });
    const client = snapshot.body.clients.find((c: any) => c.id === 'c1');
    const invoice = client.invoices.find((i: any) => i.number === 'INV-2026-0348');
    assert.equal(invoice.payments.length, 0);

    const partial = await call('POST', `/api/clients/c1/invoices/${invoice.id}/payments`, {
      session: owner,
      body: { bankAmount: 10000, tds: 1000, date: '2026-08-06' },
    });
    assert.equal(partial.status, 201);
    let updated = partial.body.clients
      .find((c: any) => c.id === 'c1')
      .invoices.find((i: any) => i.id === invoice.id);
    assert.equal(updated.payments.length, 1);
    assert.equal(updated.payments[0].bankAmount, 1000000);
    assert.equal(updated.payments[0].tds, 100000);

    const settled = await call('POST', `/api/clients/c1/invoices/${invoice.id}/settle`, {
      session: owner,
    });
    updated = settled.body.clients
      .find((c: any) => c.id === 'c1')
      .invoices.find((i: any) => i.id === invoice.id);
    const total = updated.payments.reduce((a: number, p: any) => a + p.bankAmount + p.tds, 0);
    assert.equal(total, updated.amount, 'settling clears the balance exactly');
  });

  test('a payment must carry an amount, and dates must be calendar days', async () => {
    const snapshot = await call('GET', '/api/auth/session', { session: owner });
    const invoiceId = snapshot.body.clients.find((c: any) => c.id === 'c2').invoices[0].id;

    assert.equal(
      (
        await call('POST', `/api/clients/c2/invoices/${invoiceId}/payments`, {
          session: owner,
          body: { bankAmount: 0, tds: 0, date: '2026-08-06' },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call('POST', `/api/clients/c2/invoices/${invoiceId}/payments`, {
          session: owner,
          body: { bankAmount: 10, date: '06-08-2026' },
        })
      ).status,
      400,
    );
  });

  test("an invoice cannot be paid through another client's URL", async () => {
    const snapshot = await call('GET', '/api/auth/session', { session: owner });
    const foreignInvoice = snapshot.body.clients.find((c: any) => c.id === 'c2').invoices[0].id;
    const res = await call('POST', `/api/clients/c1/invoices/${foreignInvoice}/payments`, {
      session: owner,
      body: { bankAmount: 100, date: '2026-08-06' },
    });
    assert.equal(res.status, 404);
  });
});

describe('clients', () => {
  test('creating a client derives GST and can seed a contact and a commitment', async () => {
    const res = await call('POST', '/api/clients', {
      session: owner,
      body: {
        name: 'Testbed Cosmetics',
        health: 'Active',
        stage: 'Onboarding',
        billingCycle: 'Monthly',
        startDate: '2026-08-06',
        baseAmount: 100000,
        gstPercent: 18,
        gstMode: 'excluded',
        contact: { name: 'Asha Rao', role: 'Founder' },
        initialCommitment: { title: 'Kickoff deck', dueDate: '2026-08-20' },
      },
    });
    assert.equal(res.status, 201);
    const created = res.body.clients.find((c: any) => c.name === 'Testbed Cosmetics');
    assert.equal(created.baseAmount, 10000000);
    assert.equal(created.gstAmount, 1800000);
    assert.equal(created.contractValue, 11800000);
    assert.deepEqual(
      created.contacts.map((c: any) => c.name),
      ['Asha Rao'],
    );
    assert.deepEqual(
      created.deliverables.map((d: any) => d.title),
      ['Kickoff deck'],
    );
    assert.deepEqual(
      created.activity.map((a: any) => a.note),
      ['Client created'],
    );
    assert.equal(created.activity[0].kind, 'system');
  });

  test('invalid enums and missing names are rejected with field detail', async () => {
    const res = await call('POST', '/api/clients', {
      session: owner,
      body: {
        name: 'Bad',
        health: 'Fantastic',
        stage: 'Onboarding',
        billingCycle: 'Monthly',
        startDate: '2026-08-06',
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.details[0].path, 'health');
  });

  test('mutations auto-log a system activity entry that clients cannot forge', async () => {
    const res = await call('POST', '/api/clients/c1/activity', {
      session: owner,
      body: { note: 'Called the client', author: 'Priya Shah', kind: 'system' },
    });
    assert.equal(res.status, 201);
    const entry = res.body.clients.find((c: any) => c.id === 'c1').activity[0];
    assert.equal(entry.note, 'Called the client');
    assert.equal(entry.kind, 'note', 'a client-supplied kind must not be honoured');
  });
});

describe('follow-ups', () => {
  test('logging a call appends history and pushes the due date out', async () => {
    const res = await call('POST', '/api/followups/fu1/complete', {
      session: owner,
      body: { note: 'Asked to call back after 2 days.', action: 'snooze', nextDate: '2026-08-20' },
    });
    assert.equal(res.status, 200);
    const followUp = res.body.followUps.find((f: any) => f.id === 'fu1');
    assert.equal(followUp.status, 'Pending');
    assert.equal(followUp.dueDate, '2026-08-20');
    assert.equal(followUp.log.length, 1);
    assert.equal(followUp.log[0].note, 'Asked to call back after 2 days.');
  });

  test('marking one done keeps its history', async () => {
    const res = await call('POST', '/api/followups/fu1/complete', {
      session: owner,
      body: { note: 'Signed.', action: 'done' },
    });
    const followUp = res.body.followUps.find((f: any) => f.id === 'fu1');
    assert.equal(followUp.status, 'Done');
    assert.equal(followUp.log.length, 2);
  });
});

describe('uploads', () => {
  test('rejects a file type we will not serve back', async () => {
    const form = new FormData();
    form.append('file', new Blob(['#!/bin/sh\necho hi'], { type: 'application/x-sh' }), 'run.sh');
    const response = await fetch(`${base}/api/uploads`, {
      method: 'POST',
      headers: { cookie: owner.cookie },
      body: form,
    });
    assert.equal(response.status, 415);
  });

  test('stores an allowed file under a generated name and serves it back to members only', async () => {
    const form = new FormData();
    form.append('file', new Blob(['hello'], { type: 'image/png' }), '../../evil.png');
    const response = await fetch(`${base}/api/uploads`, {
      method: 'POST',
      headers: { cookie: owner.cookie },
      body: form,
    });
    assert.equal(response.status, 201);
    const { url } = (await response.json()) as { url: string };
    // The path traversal in the original filename must not survive.
    assert.match(url, /^\/api\/uploads\/[0-9a-f-]{36}\.png$/);

    assert.equal((await fetch(base + url, { headers: { cookie: owner.cookie } })).status, 200);
    assert.equal((await fetch(base + url)).status, 401, 'uploads are not public');
  });
});
