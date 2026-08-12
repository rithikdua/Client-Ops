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
const { seedDemoWorkspace } = await import('../src/db/seed');
const { HttpError: HttpErrorClass } = await import('../src/http/errors');

const db = openDb(':memory:');
seedDemoWorkspace(db, { password: 'demo1234' });
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

describe('first-run setup', () => {
  test('is closed once the workspace has an account', async () => {
    const status = await call('GET', '/api/auth/status');
    assert.equal(status.body.needsSetup, false);

    const res = await call('POST', '/api/auth/setup', {
      body: { name: 'Intruder', email: 'intruder@phot.ai', password: 'password123' },
    });
    assert.equal(res.status, 409, 'setup must not be open self-registration');
  });

  test('on an empty workspace it creates an Owner, signs them in, then closes', async () => {
    const fresh = openDb(':memory:');
    const freshServer = createApp(fresh).listen(0);
    const freshBase = `http://127.0.0.1:${(freshServer.address() as AddressInfo).port}`;
    try {
      const before = (await (await fetch(`${freshBase}/api/auth/status`)).json()) as any;
      assert.equal(before.needsSetup, true);

      const created = await fetch(`${freshBase}/api/auth/setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Rithik Dua',
          email: 'Rithik@Example.com',
          role: 'Founder',
          password: 'a-real-password',
        }),
      });
      assert.equal(created.status, 201);
      const snapshot = (await created.json()) as any;
      assert.equal(snapshot.me.permission, 'Owner');
      assert.equal(snapshot.me.email, 'rithik@example.com', 'email is normalised');
      assert.equal(snapshot.me.canManageTeam, true);
      assert.equal(snapshot.me.access.invoices, true, 'an Owner holds every section');
      assert.deepEqual(snapshot.clients, [], 'a real workspace starts empty');
      assert.ok(created.headers.getSetCookie?.()[0] ?? created.headers.get('set-cookie'));

      const after = (await (await fetch(`${freshBase}/api/auth/status`)).json()) as any;
      assert.equal(after.needsSetup, false, 'setup closes after the first account');

      // The new Owner can sign in with the password they chose.
      const login = await fetch(`${freshBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'rithik@example.com', password: 'a-real-password' }),
      });
      assert.equal(login.status, 200);
    } finally {
      freshServer.close();
      fresh.close();
    }
  });

  test('rejects a short password and a malformed email', async () => {
    const fresh = openDb(':memory:');
    const freshServer = createApp(fresh).listen(0);
    const freshBase = `http://127.0.0.1:${(freshServer.address() as AddressInfo).port}`;
    try {
      for (const body of [
        { name: 'A', email: 'a@b.com', password: 'short' },
        { name: 'A', email: 'not-an-email', password: 'password123' },
      ]) {
        const res = await fetch(`${freshBase}/api/auth/setup`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        assert.equal(res.status, 400);
      }
    } finally {
      freshServer.close();
      fresh.close();
    }
  });
});

describe('changing your own password', () => {
  test('requires the current password and invalidates other sessions', async () => {
    const created = await call('POST', '/api/team', {
      session: owner,
      body: {
        name: 'Nina Rao',
        email: 'nina@phot.ai',
        permission: 'Editor',
        password: 'first-password',
      },
    });
    assert.equal(created.status, 201);

    const sessionA = await signIn('nina@phot.ai', 'first-password');
    const sessionB = await signIn('nina@phot.ai', 'first-password');

    // A wrong current password is refused.
    assert.equal(
      (
        await call('POST', '/api/auth/password', {
          session: sessionA,
          body: { currentPassword: 'wrong', newPassword: 'second-password' },
        })
      ).status,
      403,
    );
    // So is reusing the same one.
    assert.equal(
      (
        await call('POST', '/api/auth/password', {
          session: sessionA,
          body: { currentPassword: 'first-password', newPassword: 'first-password' },
        })
      ).status,
      400,
    );

    const changed = await call('POST', '/api/auth/password', {
      session: sessionA,
      body: { currentPassword: 'first-password', newPassword: 'second-password' },
    });
    assert.equal(changed.status, 200);

    // The other session is gone, and the old password no longer works.
    assert.equal((await call('GET', '/api/auth/session', { session: sessionB })).status, 401);
    const oldLogin = await call('POST', '/api/auth/login', {
      body: { email: 'nina@phot.ai', password: 'first-password' },
    });
    assert.equal(oldLogin.status, 401);
    const newLogin = await call('POST', '/api/auth/login', {
      body: { email: 'nina@phot.ai', password: 'second-password' },
    });
    assert.equal(newLogin.status, 200);
  });

  test('a read-only account may still change its own password', async () => {
    const before = await call('GET', '/api/auth/session', { session: viewer });
    assert.equal(before.body.me.canWrite, false);
    const res = await call('POST', '/api/auth/password', {
      session: viewer,
      body: { currentPassword: 'demo1234', newPassword: 'viewer-new-password' },
    });
    assert.equal(res.status, 200, 'changing your login is not a data write');
    viewer = await signIn('tom@phot.ai', 'viewer-new-password');
  });

  test('is refused while previewing as someone else', async () => {
    await call('POST', '/api/auth/preview', { session: owner, body: { teammateId: 'tm2' } });
    const res = await call('POST', '/api/auth/password', {
      session: owner,
      body: { currentPassword: 'demo1234', newPassword: 'whatever-123' },
    });
    assert.equal(res.status, 400);
    await call('DELETE', '/api/auth/preview', { session: owner });
  });
});

describe('Google sign-in endpoints', () => {
  const clear = () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  };
  const configure = () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5173/api/auth/google/callback';
  };

  test('status reports it off, and the endpoint refuses, when unconfigured', async () => {
    clear();
    const status = await call('GET', '/api/auth/status');
    assert.equal(status.body.googleEnabled, false);

    const res = await fetch(`${base}/api/auth/google`, { redirect: 'manual' });
    assert.equal(res.status, 501, 'no credentials means no Google endpoint');
  });

  test('once configured, status advertises it and the endpoint redirects to Google', async () => {
    configure();
    try {
      const status = await call('GET', '/api/auth/status');
      assert.equal(status.body.googleEnabled, true);

      const res = await fetch(`${base}/api/auth/google`, { redirect: 'manual' });
      assert.equal(res.status, 302);
      const location = new URL(res.headers.get('location') ?? '');
      assert.equal(location.host, 'accounts.google.com');
      assert.equal(location.searchParams.get('client_id'), process.env.GOOGLE_CLIENT_ID);
      assert.ok(location.searchParams.get('state'));
      assert.equal(location.searchParams.get('code_challenge_method'), 'S256');

      // The handshake values ride along in a signed, httpOnly cookie.
      const cookie = res.headers.getSetCookie?.()[0] ?? res.headers.get('set-cookie') ?? '';
      assert.match(cookie, /^clientops_oauth=/);
      assert.match(cookie, /HttpOnly/i);
    } finally {
      clear();
    }
  });

  test('the callback refuses a forged or expired handshake', async () => {
    configure();
    try {
      // No cookie at all.
      const noCookie = await fetch(`${freshCallback('some-code', 'some-state')}`, {
        redirect: 'manual',
      });
      assert.equal(noCookie.status, 302);
      assert.match(
        decodeURIComponent(noCookie.headers.get('location') ?? ''),
        /expired/,
        'a callback with no handshake cookie is rejected',
      );

      // A real handshake cookie, but the state in the URL does not match it.
      const started = await fetch(`${base}/api/auth/google`, { redirect: 'manual' });
      const cookie = (started.headers.getSetCookie?.()[0] ?? '').split(';')[0];
      const mismatched = await fetch(freshCallback('some-code', 'not-the-right-state'), {
        redirect: 'manual',
        headers: { cookie },
      });
      assert.match(
        decodeURIComponent(mismatched.headers.get('location') ?? ''),
        /did not match/,
        'state mismatch is what blocks a forged callback',
      );

      // A cancelled consent screen reads as a cancellation, not an error page.
      const denied = await fetch(`${base}/api/auth/google/callback?error=access_denied`, {
        redirect: 'manual',
      });
      assert.match(decodeURIComponent(denied.headers.get('location') ?? ''), /cancelled/);
    } finally {
      clear();
    }
  });

  function freshCallback(code: string, state: string): string {
    return `${base}/api/auth/google/callback?code=${code}&state=${state}`;
  }
});

describe('the API refuses to store a dangerous URL (C-01)', () => {
  const XSS = 'javascript:alert(document.domain)';

  test('rejects it on every field that accepts a link', async () => {
    const cases: [string, string, unknown][] = [
      [
        'client website',
        '/api/clients',
        {
          name: 'XSS Co',
          health: 'Active',
          stage: 'Onboarding',
          billingCycle: 'Monthly',
          startDate: '2026-08-01',
          website: XSS,
        },
      ],
      [
        'invoice file',
        '/api/clients/c1/invoices',
        {
          number: 'INV-XSS',
          baseAmount: 100,
          gstPercent: 18,
          gstMode: 'excluded',
          issueDate: '2026-08-01',
          dueDate: '2026-08-15',
          fileUrl: XSS,
        },
      ],
      [
        'deliverable file',
        '/api/clients/c1/deliverables',
        { title: 'XSS', dueDate: '2026-09-01', fileUrl: XSS },
      ],
      ['document link', '/api/clients/c1/documents', { name: 'XSS.pdf', type: 'Contract', url: XSS }],
      ['task attachment', '/api/clients/c1/tasks', { title: 'XSS', attachments: [XSS] }],
    ];

    for (const [label, path, body] of cases) {
      const res = await call('POST', path, { session: owner, body });
      assert.equal(res.status, 400, `${label} must be rejected`);
      assert.match(JSON.stringify(res.body), /http/, `${label} error should explain the rule`);
    }
  });

  test('rejects it when attaching a file to an existing invoice or deliverable', async () => {
    const snapshot = await call('GET', '/api/auth/session', { session: owner });
    const client = snapshot.body.clients.find((c: any) => c.id === 'c1');
    const invoiceId = client.invoices[0].id;
    const deliverableId = client.deliverables[0].id;

    assert.equal(
      (
        await call('PUT', `/api/clients/c1/invoices/${invoiceId}/file`, {
          session: owner,
          body: { fileName: 'x', fileUrl: XSS },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call('PATCH', `/api/clients/c1/deliverables/${deliverableId}`, {
          session: owner,
          body: { fileUrl: XSS },
        })
      ).status,
      400,
    );
  });

  test('still accepts the links people actually use', async () => {
    const res = await call('POST', '/api/clients/c1/documents', {
      session: owner,
      body: { name: 'MSA.pdf', type: 'Contract', url: 'https://drive.google.com/file/d/abc/view' },
    });
    assert.equal(res.status, 201);
    const uploaded = await call('POST', '/api/clients/c1/tasks', {
      session: owner,
      body: { title: 'With an upload', attachments: ['/api/uploads/abc.png'] },
    });
    assert.equal(uploaded.status, 201, 'our own upload paths are allowed');
  });
});

describe('first-run setup is not a land-grab (C-02)', () => {
  const freshApp = () => {
    const fresh = openDb(':memory:');
    const srv = createApp(fresh).listen(0);
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    return { fresh, srv, url };
  };
  const setup = (url: string, body: unknown) =>
    fetch(`${url}/api/auth/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const OWNER = { name: 'First', email: 'first@example.com', password: 'a-real-password' };

  test('the emptiness check and the insert are atomic', async () => {
    const { fresh, srv } = freshApp();
    try {
      const { claimFirstOwner } = await import('../src/auth/accounts');
      claimFirstOwner(fresh, { name: 'A', email: 'a@example.com', password: 'password-123' });

      // A second claim must lose, whatever the timing. (better-sqlite3 is
      // synchronous, so two HTTP requests cannot genuinely interleave here; this
      // asserts the contract the transaction provides.)
      assert.throws(
        () => claimFirstOwner(fresh, { name: 'B', email: 'b@example.com', password: 'password-123' }),
        (err: unknown) => err instanceof HttpErrorClass && err.status === 409,
      );
      assert.equal((fresh.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n, 1);
      const owners = fresh
        .prepare("SELECT COUNT(*) AS n FROM users WHERE permission = 'Owner'")
        .get() as any;
      assert.equal(owners.n, 1, 'exactly one Owner');
    } finally {
      srv.close();
      fresh.close();
    }
  });

  test('only the first of many concurrent attempts succeeds', async () => {
    const { fresh, srv, url } = freshApp();
    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          setup(url, { ...OWNER, email: `race-${i}@example.com` }).then((r) => r.status),
        ),
      );
      assert.equal(results.filter((s) => s === 201).length, 1, 'one winner');
      assert.equal(results.filter((s) => s === 409).length, 4, 'everyone else is refused');
    } finally {
      srv.close();
      fresh.close();
    }
  });

  test('with SETUP_TOKEN set, the right code is required', async () => {
    process.env.SETUP_TOKEN = 'the-one-time-code';
    const { fresh, srv, url } = freshApp();
    try {
      const status = await (await fetch(`${url}/api/auth/status`)).json() as any;
      assert.equal(status.setupTokenRequired, true);
      assert.equal(status.setupToken, undefined, 'the token itself is never sent to the client');

      assert.equal((await setup(url, OWNER)).status, 403, 'no code');
      assert.equal((await setup(url, { ...OWNER, setupToken: 'wrong' })).status, 403, 'wrong code');
      assert.equal(
        (await setup(url, { ...OWNER, setupToken: 'the-one-time-code' })).status,
        201,
        'correct code',
      );
    } finally {
      delete process.env.SETUP_TOKEN;
      srv.close();
      fresh.close();
    }
  });

  test('production refuses an unguarded bootstrap entirely', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SETUP_TOKEN;
    const { fresh, srv, url } = freshApp();
    try {
      const res = await setup(url, OWNER);
      assert.equal(res.status, 403);
      assert.match(((await res.json()) as any).error, /SETUP_TOKEN/);
    } finally {
      process.env.NODE_ENV = 'test';
      srv.close();
      fresh.close();
    }
  });
});

describe('login does not leak which addresses exist (H-02)', () => {
  test('an unknown address and a wrong password are indistinguishable', async () => {
    const unknown = await call('POST', '/api/auth/login', {
      body: { email: 'nobody-at-all@example.com', password: 'whatever-123' },
    });
    const known = await call('POST', '/api/auth/login', {
      body: { email: 'priya@phot.ai', password: 'wrong-password' },
    });
    assert.equal(unknown.status, known.status);
    assert.deepEqual(unknown.body, known.body);
  });

  test('a Google-only account cannot be signed into with a password', async () => {
    // Simulates an account created through Google: no password set.
    db.prepare(
      `INSERT INTO users (id, name, email, role, permission, password_hash, password_salt, google_sub, created_at)
       VALUES ('google-only', 'Google Only', 'google-only@phot.ai', '', 'Editor', '', '', 'sub-x', ?)`,
    ).run(new Date().toISOString());

    for (const password of ['', ' ', 'anything', 'demo1234']) {
      const res = await call('POST', '/api/auth/login', {
        body: { email: 'google-only@phot.ai', password: password || 'x' },
      });
      assert.equal(res.status, 401, `empty stored hash must never verify (${password})`);
      assert.equal(res.body.error, 'Email or password is incorrect.');
    }
  });
});

describe('the snapshot withholds every denied section, not just money (C-03)', () => {
  /** Signs in a purpose-made account with exactly the sections listed. */
  async function userWith(sections: string[], label: string) {
    const email = `${label}@phot.ai`;
    const access: Record<string, boolean> = {};
    for (const s of ['overview', 'clients', 'invoices', 'deliverables', 'documents', 'team', 'followups', 'phonebook'])
      access[s] = sections.includes(s);
    const created = await call('POST', '/api/team', {
      session: owner,
      body: { name: label, email, permission: 'Editor', password: 'password-1234', access },
    });
    assert.equal(created.status, 201, `could not create ${label}`);
    return signIn(email, 'password-1234');
  }

  test('deliverables are absent for a user whose Deliverables section is denied', async () => {
    const session = await userWith(['overview', 'clients'], 'no-deliverables');
    const res = await call('GET', '/api/auth/session', { session });
    assert.equal(res.body.me.access.deliverables, false);

    const client = res.body.clients.find((c: any) => c.id === 'c1');
    assert.deepEqual(client.deliverables, [], 'deliverables must not reach the browser');
    // The endpoint was already guarded; the snapshot must agree with it.
    assert.equal((await call('GET', '/api/clients', { session })).status, 200);
    assert.equal(
      (
        await call('POST', '/api/clients/c1/deliverables', {
          session,
          body: { title: 'x', dueDate: '2026-09-01' },
        })
      ).status,
      403,
    );

    // Sanity: the data does exist, the Owner still sees it.
    const asOwner = await call('GET', '/api/auth/session', { session: owner });
    assert.ok(
      asOwner.body.clients.find((c: any) => c.id === 'c1').deliverables.length > 0,
      'the fixture really has deliverables',
    );
  });

  test('overview-only access is a dashboard, not a licence to read client detail', async () => {
    const session = await userWith(['overview'], 'overview-only');
    const res = await call('GET', '/api/auth/session', { session });
    assert.equal(res.body.me.access.clients, false);

    const client = res.body.clients.find((c: any) => c.id === 'c1');
    assert.ok(client, 'the roster is still available for the dashboard');
    for (const field of ['contacts', 'invoices', 'deliverables', 'documents', 'activity', 'tasks']) {
      assert.deepEqual(client[field], [], `${field} must be withheld`);
    }
    assert.equal('contractValue' in client, false);
  });

  test('a user with everything still receives everything', async () => {
    const res = await call('GET', '/api/auth/session', { session: owner });
    const client = res.body.clients.find((c: any) => c.id === 'c1');
    assert.ok(client.contacts.length > 0);
    assert.ok(client.invoices.length > 0);
    assert.ok(client.deliverables.length > 0);
    assert.ok(client.documents.length > 0);
    assert.ok(client.activity.length > 0);
    assert.ok(client.tasks.length > 0);
    assert.ok(typeof client.contractValue === 'number');
  });

  test('no client field leaks a section the user was denied', async () => {
    const session = await userWith(['overview', 'clients', 'deliverables'], 'partial');
    const res = await call('GET', '/api/auth/session', { session });
    for (const client of res.body.clients) {
      assert.deepEqual(client.invoices, [], 'invoices denied');
      assert.deepEqual(client.documents, [], 'documents denied');
      assert.equal('baseAmount' in client, false);
      assert.equal('gstAmount' in client, false);
      assert.equal('gstMode' in client, false);
      assert.equal('gstPercent' in client, false);
    }
    assert.deepEqual(res.body.team, [], 'team denied');
    assert.deepEqual(res.body.followUps, [], 'follow-ups denied');
  });
});
