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
seedDemoWorkspace(db, { password: 'demo-pass-2026!' });
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

async function signIn(email: string, password = 'demo-pass-2026!'): Promise<Session> {
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

/**
 * Creates a teammate and settles their password, returning a usable session.
 * An Owner-created account starts with must_change_password set, so without this
 * step every data request would (correctly) be refused.
 */
async function createTeammateSession(
  body: Record<string, unknown>,
  temporary = 'chosen-phrase-1234',
  chosen = 'chosen-phrase-99',
): Promise<Session> {
  const created = await call('POST', '/api/team', {
    session: owner,
    body: { permission: 'Editor', password: temporary, ...body },
  });
  assert.equal(created.status, 201, `could not create ${String(body.email)}`);

  const first = await signIn(String(body.email), temporary);
  const settled = await call('POST', '/api/auth/password', {
    session: first,
    body: { currentPassword: temporary, newPassword: chosen },
  });
  assert.equal(settled.status, 200, 'the forced password change should succeed');
  return signIn(String(body.email), chosen);
}

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
          body: { name: 'X', email: 'x@phot.ai', password: 'chosen-phrase-9x' },
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
      body: { name: 'Copy', email: 'ravi@phot.ai', password: 'chosen-phrase-9x' },
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

describe('uploads are owned, content-checked and authorized (H-03..H-05)', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
  );

  async function send(
    clientId: string,
    session: Session,
    body: Buffer | string,
    filename: string,
    mime: string,
    section = '',
  ) {
    const form = new FormData();
    form.append('file', new Blob([body], { type: mime }), filename);
    return fetch(`${base}/api/clients/${clientId}/uploads${section ? '/' + section : ''}`, {
      method: 'POST',
      headers: { cookie: session.cookie },
      body: form,
    });
  }

  test('accepts a real PNG and stores it under a generated name', async () => {
    const res = await send('c1', owner, PNG, '../../evil.png', 'image/png');
    assert.equal(res.status, 201);
    const { url, mime } = (await res.json()) as { url: string; mime: string };
    // The traversal in the client's filename cannot survive.
    assert.match(url, /^\/api\/uploads\/[0-9a-f-]{36}\.png$/);
    assert.equal(mime, 'image/png');

    const download = await fetch(base + url, { headers: { cookie: owner.cookie } });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(download.headers.get('content-type'), 'image/png');
  });

  test('rejects a file whose bytes are not what it claims (H-04)', async () => {
    // A shell script announcing itself as a PNG. Trusting Content-Type would
    // have stored it happily.
    const res = await send('c1', owner, '#!/bin/sh\necho pwned', 'payload.png', 'image/png');
    assert.equal(res.status, 415);

    // Same for an HTML payload dressed as an image.
    const html = await send('c1', owner, '<script>alert(1)</script>', 'x.png', 'image/png');
    assert.equal(html.status, 415);

    // And an honestly-declared unsupported type.
    const sh = await send('c1', owner, '#!/bin/sh', 'run.sh', 'application/x-sh');
    assert.equal(sh.status, 415);
  });

  test('a PDF must actually be a PDF, and a real one is served as a download', async () => {
    assert.equal((await send('c1', owner, 'not a pdf at all', 'x.pdf', 'application/pdf')).status, 415);

    const real = await send('c1', owner, '%PDF-1.7\n1 0 obj\n', 'contract.pdf', 'application/pdf');
    assert.equal(real.status, 201);
    const { url } = (await real.json()) as { url: string };
    const download = await fetch(base + url, { headers: { cookie: owner.cookie } });
    // Anything not an image downloads instead of rendering in the tab.
    assert.match(download.headers.get('content-disposition') ?? '', /^attachment/);
  });

  test('a file is not readable by someone denied the account it belongs to (H-03)', async () => {
    const res = await send('c1', owner, PNG, 'private.png', 'image/png');
    const { url } = (await res.json()) as { url: string };

    // Knowing the URL is not authorization: this user has no Clients access.
    const outsider = await createTeammateSession({
      name: 'File Outsider',
      email: 'file-outsider@phot.ai',
      access: { overview: true },
    });
    const denied = await fetch(base + url, { headers: { cookie: outsider.cookie } });
    assert.equal(denied.status, 403, 'a URL is not a capability');

    // And still nothing without a session at all.
    assert.equal((await fetch(base + url)).status, 401);
  });

  test('an unknown filename is a 404, and traversal is stripped', async () => {
    assert.equal(
      (await fetch(`${base}/api/uploads/does-not-exist.png`, { headers: { cookie: owner.cookie } }))
        .status,
      404,
    );
    const traversal = await fetch(`${base}/api/uploads/..%2F..%2Fpackage.json`, {
      headers: { cookie: owner.cookie },
    });
    assert.equal(traversal.status, 404);
  });

  test('a read-only account cannot upload', async () => {
    assert.equal((await send('c1', viewer, PNG, 'x.png', 'image/png')).status, 403);
  });

  test('uploading to a client that does not exist is refused', async () => {
    assert.equal((await send('no-such-client', owner, PNG, 'x.png', 'image/png')).status, 404);
  });

  test('uploading requires the section the file will belong to (C-03)', async () => {
    // Write access alone was the only guard here, so anyone who could write
    // anything could attach a file to any client id they knew — and spend that
    // workspace's storage quota doing it.
    const noClients = await createTeammateSession({
      name: 'Deliverables Only Uploader',
      email: 'deliverables-uploader@phot.ai',
      access: { deliverables: true },
    });
    assert.equal(
      (await send('c1', noClients, PNG, 'x.png', 'image/png')).status,
      403,
      'no Clients access, no attaching to the client record',
    );
    // But the section they *do* hold works.
    assert.equal((await send('c1', noClients, PNG, 'x.png', 'image/png', 'deliverables')).status, 201);
    // And an invented section is refused rather than defaulted.
    assert.equal((await send('c1', owner, PNG, 'x.png', 'image/png', 'nonsense')).status, 400);
  });

  test('an attachment is downloadable by the section that owns it (H-04)', async () => {
    // An invoice PDF belongs to Invoices. Recording every upload as `clients`
    // meant a finance teammate could see an invoice and not open its own file.
    const finance = await createTeammateSession({
      name: 'Invoice Attachments',
      email: 'invoice-attachments@phot.ai',
      access: { invoices: true },
    });
    const uploaded = await send('c1', finance, '%PDF-1.7\n1 0 obj\n', 'inv.pdf', 'application/pdf', 'invoices');
    assert.equal(uploaded.status, 201);
    const { url, section } = (await uploaded.json()) as { url: string; section: string };
    assert.equal(section, 'invoices');

    assert.equal(
      (await fetch(base + url, { headers: { cookie: finance.cookie } })).status,
      200,
      'the section that owns the file can read it',
    );

    // And it is not readable by someone holding a different section.
    const docsOnly = await createTeammateSession({
      name: 'Documents Only Reader',
      email: 'documents-only-reader@phot.ai',
      access: { documents: true },
    });
    assert.equal((await fetch(base + url, { headers: { cookie: docsOnly.cookie } })).status, 403);
  });

  test('existing attachments are relabelled from whatever references them (H-04)', async () => {
    const { openDb } = await import('../src/db/index');
    const path = join(mkdtempSync(join(tmpdir(), 'client-ops-uploads-migrate-')), 'db.sqlite');
    const older = openDb(path);
    // A pre-v6 database: every upload recorded as 'clients', whatever it is
    // attached to.
    older
      .prepare(
        `INSERT INTO clients (id, name, health, stage, billing_cycle, start_date, created_at)
         VALUES ('m1', 'Migrated', 'Active', 'Live', 'Monthly', '2026-01-01', '2026-01-01T00:00:00Z')`,
      )
      .run();
    older
      .prepare(
        `INSERT INTO invoices (id, client_id, number, amount_minor, base_amount_minor, issue_date, due_date, file_url, created_at)
         VALUES ('mi1', 'm1', 'INV-1', 100, 100, '2026-01-01', '2026-02-01', '/api/uploads/abc.pdf', '2026-01-01T00:00:00Z')`,
      )
      .run();
    for (const [id, filename] of [
      ['u1', 'abc.pdf'],
      ['u2', 'unreferenced.png'],
    ]) {
      older
        .prepare(
          `INSERT INTO uploads (id, filename, mime, size_bytes, client_id, section, created_at)
           VALUES (?, ?, 'application/pdf', 10, 'm1', 'clients', '2026-01-01T00:00:00Z')`,
        )
        .run(id, filename);
    }
    older.prepare('UPDATE schema_version SET version = 5').run();
    older.close();

    const upgraded = openDb(path);
    const sectionOf = (id: string) =>
      (upgraded.prepare('SELECT section FROM uploads WHERE id = ?').get(id) as { section: string })
        .section;
    assert.equal(sectionOf('u1'), 'invoices', 'the invoice PDF now follows Invoices access');
    assert.equal(sectionOf('u2'), 'clients', 'nothing references this one; leave it alone');
    upgraded.close();
  });

  test('orphaned files are collected once nothing references them', async () => {
    const { collectOrphanUploads } = await import('../src/routes/uploads');

    // Referenced by a task: must survive.
    const kept = await send('c1', owner, PNG, 'kept.png', 'image/png');
    const keptUrl = ((await kept.json()) as { url: string }).url;
    await call('POST', '/api/clients/c1/tasks', {
      session: owner,
      body: { title: 'Has an attachment', attachments: [keptUrl] },
    });

    // Uploaded and abandoned: must go.
    const orphan = await send('c1', owner, PNG, 'orphan.png', 'image/png');
    const orphanUrl = ((await orphan.json()) as { url: string }).url;
    db.prepare('UPDATE uploads SET created_at = ? WHERE filename = ?').run(
     new Date(0).toISOString(),
     orphanUrl.split('/').pop(),
     );

    // A grace period of 0 treats everything as old enough to consider.
    const { removed } = collectOrphanUploads(db, 0);
    assert.ok(removed >= 1, 'the abandoned file was collected');

    assert.equal(
      (await fetch(base + keptUrl, { headers: { cookie: owner.cookie } })).status,
      200,
      'a referenced file is never swept',
    );
    assert.equal(
      (await fetch(base + orphanUrl, { headers: { cookie: owner.cookie } })).status,
      404,
      'the orphan is gone',
    );
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
  const OWNER = { name: 'First', email: 'first@example.com', password: 'a-real-passphrase' };

  test('the emptiness check and the insert are atomic', async () => {
    const { fresh, srv } = freshApp();
    try {
      const { claimFirstOwner } = await import('../src/auth/accounts');
      claimFirstOwner(fresh, { name: 'A', email: 'a@example.com', password: 'chosen-phrase-123' });

      // A second claim must lose, whatever the timing. (better-sqlite3 is
      // synchronous, so two HTTP requests cannot genuinely interleave here; this
      // asserts the contract the transaction provides.)
      assert.throws(
        () => claimFirstOwner(fresh, { name: 'B', email: 'b@example.com', password: 'chosen-phrase-123' }),
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
      body: { email: 'nobody-at-all@example.com', password: 'arbitrary-phrase-1' },
    });
    const known = await call('POST', '/api/auth/login', {
      body: { email: 'priya@phot.ai', password: 'wrong-credential' },
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

    for (const password of ['', ' ', 'anything', 'demo-pass-2026!']) {
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
    const access: Record<string, boolean> = {};
    for (const s of ['overview', 'clients', 'invoices', 'deliverables', 'documents', 'team', 'followups', 'phonebook'])
      access[s] = sections.includes(s);
    return createTeammateSession({ name: label, email: `${label}@phot.ai`, access });
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

describe('the client projection widens with access, and only with access', () => {
  /** Fields that belong to the client detail screen and nowhere else. */
  const CONFIDENTIAL = [
    'gstin',
    'legalName',
    'notes',
    'scopeOfWork',
    'website',
    'natureOfBusiness',
    'cityTier',
    'mandateType',
    'mandateOther',
    'paymentTerms',
    'onboardingDate',
  ];
  const ROSTER = ['industry', 'health', 'owner', 'stage', 'billingCycle', 'startDate'];

  async function userWith(sections: string[], label: string) {
    const access: Record<string, boolean> = {};
    for (const s of ['overview', 'clients', 'invoices', 'deliverables', 'documents', 'team', 'followups', 'phonebook'])
      access[s] = sections.includes(s);
    return createTeammateSession({ name: label, email: `${label}@phot.ai`, access });
  }

  before(async () => {
    // The fixture ships these blank, and a test that asserts the absence of an
    // empty string proves nothing.
    const res = await call('PATCH', '/api/clients/c1', {
      session: owner,
      body: {
        gstin: '27AABCU9603R1ZM',
        legalName: 'Northwind Logistics Pvt Ltd',
        notes: 'CFO unhappy about the Q3 overage; renewal at risk.',
        scopeOfWork: 'Retainer: 40 assets/mo, 2 revisions',
        website: 'https://northwind.example',
        contractEndDate: '2027-02-10',
      },
    });
    assert.equal(res.status, 200, 'fixture setup failed');
  });

  test('an Overview-only user gets the roster and none of the confidential record (C-01)', async () => {
    const session = await userWith(['overview'], 'projection-overview');
    const client = (await call('GET', '/api/auth/session', { session })).body.clients.find(
      (c: any) => c.id === 'c1',
    );

    // The dashboard's own statistics need these.
    for (const field of ROSTER) {
      assert.ok(field in client, `the dashboard needs ${field}`);
    }
    assert.ok('contractEndDate' in client, 'renewals are counted from this');

    // None of this is dashboard data, and it used to be in the payload.
    for (const field of CONFIDENTIAL) {
      assert.equal(field in client, false, `${field} must not reach an Overview-only user`);
    }
  });

  test('an invoices-only user can actually see invoices (C-02)', async () => {
    const session = await userWith(['invoices'], 'projection-invoices');
    const body = (await call('GET', '/api/auth/session', { session })).body;

    // Previously: zero clients, therefore zero invoices, on a screen the user was
    // explicitly granted.
    assert.ok(body.clients.length > 0, 'the invoices screen needs its rows');
    const client = body.clients.find((c: any) => c.id === 'c1');
    assert.ok(client.invoices.length > 0);
    // Enough identity to label and format a row, and nothing more.
    assert.ok(client.name);
    assert.ok(client.currency);
    for (const field of [...ROSTER, ...CONFIDENTIAL]) {
      assert.equal(field in client, false, `${field} is not needed to list an invoice`);
    }
    assert.deepEqual(client.documents, []);
    assert.deepEqual(client.deliverables, []);
  });

  test('a deliverables-only user can actually see deliverables (C-02)', async () => {
    const session = await userWith(['deliverables'], 'projection-deliverables');
    const body = (await call('GET', '/api/auth/session', { session })).body;
    assert.ok(body.clients.length > 0);
    assert.ok(body.clients.find((c: any) => c.id === 'c1').deliverables.length > 0);
    assert.deepEqual(body.clients.find((c: any) => c.id === 'c1').invoices, []);
  });

  test('a documents-only user can actually see documents (C-02)', async () => {
    const session = await userWith(['documents'], 'projection-documents');
    const body = (await call('GET', '/api/auth/session', { session })).body;
    assert.ok(body.clients.length > 0);
    assert.ok(body.clients.find((c: any) => c.id === 'c1').documents.length > 0);
  });

  test('a follow-ups-only user can name the account a follow-up relates to', async () => {
    const session = await userWith(['followups'], 'projection-followups');
    const body = (await call('GET', '/api/auth/session', { session })).body;
    const client = body.clients.find((c: any) => c.id === 'c1');
    assert.ok(client, 'a follow-up row shows the related client name');
    assert.equal('notes' in client, false);
    assert.equal('health' in client, false);
  });

  test('a user with no client-facing section receives no clients at all', async () => {
    const session = await userWith(['team'], 'projection-team');
    const body = (await call('GET', '/api/auth/session', { session })).body;
    assert.deepEqual(body.clients, []);
  });

  test('Clients access still returns the whole record', async () => {
    const session = await userWith(['clients'], 'projection-clients');
    const client = (await call('GET', '/api/auth/session', { session })).body.clients.find(
      (c: any) => c.id === 'c1',
    );
    for (const field of [...ROSTER, ...CONFIDENTIAL]) {
      assert.ok(field in client, `${field} belongs to the client detail screen`);
    }
    assert.equal(client.gstin, '27AABCU9603R1ZM');
    assert.match(client.notes, /Q3 overage/);
    // Money is a separate grant, and this user does not have it.
    assert.equal('contractValue' in client, false);
  });
});

describe('a partial money PATCH cannot corrupt a contract (C-04)', () => {
  /** A client with a known contract, created fresh so assertions are exact. */
  async function contractClient(name: string) {
    const res = await call('POST', '/api/clients', {
      session: owner,
      body: {
        name,
        health: 'Active',
        stage: 'Live',
        billingCycle: 'Annual',
        startDate: '2026-01-01',
        baseAmount: 1000000,
        gstPercent: 18,
        gstMode: 'excluded',
      },
    });
    assert.equal(res.status, 201);
    const client = res.body.clients.find((c: any) => c.name === name);
    assert.equal(client.baseAmount, 100000000, 'base is ten lakh in paise');
    assert.equal(client.contractValue, 118000000);
    return client.id;
  }

  test('changing only the GST rate keeps the stored base amount', async () => {
    const id = await contractClient('Merge Test A');
    const res = await call('PATCH', `/api/clients/${id}`, {
      session: owner,
      body: { gstPercent: 12 },
    });
    assert.equal(res.status, 200);

    const after = res.body.clients.find((c: any) => c.id === id);
    assert.equal(after.baseAmount, 100000000, 'the base must survive the patch');
    assert.equal(after.gstPercent, 12);
    assert.equal(after.gstAmount, 12000000, '12% of ten lakh');
    assert.equal(after.contractValue, 112000000);
  });

  test('changing only the GST treatment keeps base and rate', async () => {
    const id = await contractClient('Merge Test B');
    const res = await call('PATCH', `/api/clients/${id}`, {
      session: owner,
      body: { gstMode: 'included' },
    });
    const after = res.body.clients.find((c: any) => c.id === id);
    assert.equal(after.baseAmount, 100000000);
    assert.equal(after.gstPercent, 18);
    assert.equal(after.gstMode, 'included');
    // Inclusive: the total is the base, and the tax is worked back out of it.
    assert.equal(after.contractValue, 100000000);
    assert.equal(after.gstAmount, 15254237);
  });

  test('changing an unrelated field leaves the money untouched', async () => {
    const id = await contractClient('Merge Test C');
    const res = await call('PATCH', `/api/clients/${id}`, {
      session: owner,
      body: { industry: 'Logistics' },
    });
    const after = res.body.clients.find((c: any) => c.id === id);
    assert.equal(after.industry, 'Logistics');
    assert.equal(after.baseAmount, 100000000);
    assert.equal(after.contractValue, 118000000);
  });

  test('gstMode alone is money-sensitive and needs invoice access', async () => {
    const id = await contractClient('Merge Test D');
    const res = await call('PATCH', `/api/clients/${id}`, {
      session: noInvoices,
      body: { gstMode: 'included' },
    });
    assert.equal(res.status, 403, 'gstMode must be gated like baseAmount and gstPercent');

    const check = await call('GET', '/api/auth/session', { session: owner });
    const after = check.body.clients.find((c: any) => c.id === id);
    assert.equal(after.contractValue, 118000000, 'and the value is unchanged');
  });
});

describe('activity authorship cannot be forged (H-13)', () => {
  test('a client-supplied author is ignored in favour of the session', async () => {
    const res = await call('POST', '/api/clients/c1/activity', {
      session: noInvoices,
      body: { note: 'Approved payment', author: 'Priya Shah' },
    });
    assert.equal(res.status, 201);
    const entry = res.body.clients.find((c: any) => c.id === 'c1').activity[0];
    assert.equal(entry.note, 'Approved payment');
    assert.equal(entry.author, 'Daniel Cho', 'the signed-in user is the author');
  });
});

describe('dates must be real (M-01)', () => {
  test('a well-shaped but impossible date is rejected', async () => {
    for (const bad of ['2026-99-99', '2026-02-31', '2026-13-01', '2026-00-10']) {
      const res = await call('POST', '/api/clients/c1/deliverables', {
        session: owner,
        body: { title: 'Bad date', dueDate: bad },
      });
      assert.equal(res.status, 400, `${bad} must be refused`);
    }
    // A leap day in a leap year is fine; in a common year it is not.
    assert.equal(
      (
        await call('POST', '/api/clients/c1/deliverables', {
          session: owner,
          body: { title: 'Leap day', dueDate: '2028-02-29' },
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await call('POST', '/api/clients/c1/deliverables', {
          session: owner,
          body: { title: 'Not a leap day', dueDate: '2027-02-29' },
        })
      ).status,
      400,
    );
  });
});

describe('an invoice cannot be overpaid (H-06)', () => {
  async function invoiceOf(amountMajor: number, label: string) {
    const res = await call('POST', '/api/clients/c3/invoices', {
      session: owner,
      body: {
        number: label,
        baseAmount: amountMajor,
        gstPercent: 0,
        gstMode: 'excluded',
        issueDate: '2026-08-01',
        dueDate: '2026-08-20',
      },
    });
    assert.equal(res.status, 201);
    const invoice = res.body.clients
      .find((c: any) => c.id === 'c3')
      .invoices.find((i: any) => i.number === label);
    assert.equal(invoice.amount, amountMajor * 100);
    return invoice.id;
  }
  const pay = (id: string, body: unknown) =>
    call('POST', `/api/clients/c3/invoices/${id}/payments`, { session: owner, body });

  test('a payment larger than the invoice is refused', async () => {
    const id = await invoiceOf(100000, 'INV-OVER-1');
    const res = await pay(id, { bankAmount: 150000, date: '2026-08-05' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /more than the amount still outstanding/);

    // Nothing was recorded.
    const check = await call('GET', '/api/auth/session', { session: owner });
    const invoice = check.body.clients
      .find((c: any) => c.id === 'c3')
      .invoices.find((i: any) => i.id === id);
    assert.deepEqual(invoice.payments, []);
  });

  test('bank amount plus TDS is what counts against the balance', async () => {
    const id = await invoiceOf(1000, 'INV-OVER-2');
    // 600 + 500 = 1100 against a 1000 invoice.
    assert.equal((await pay(id, { bankAmount: 600, tds: 500, date: '2026-08-05' })).status, 400);
    // Exactly the balance is fine.
    assert.equal((await pay(id, { bankAmount: 600, tds: 400, date: '2026-08-05' })).status, 201);
  });

  test('a second payment cannot exceed what is left', async () => {
    const id = await invoiceOf(1000, 'INV-OVER-3');
    assert.equal((await pay(id, { bankAmount: 400, date: '2026-08-05' })).status, 201);
    assert.equal((await pay(id, { bankAmount: 700, date: '2026-08-06' })).status, 400, '700 > 600 left');
    assert.equal((await pay(id, { bankAmount: 600, date: '2026-08-06' })).status, 201);

    // A fully settled invoice takes nothing more.
    const res = await pay(id, { bankAmount: 1, date: '2026-08-07' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /already settled/);
  });

  test('the balance never goes negative', async () => {
    const check = await call('GET', '/api/auth/session', { session: owner });
    for (const client of check.body.clients) {
      for (const invoice of client.invoices) {
        const settled = invoice.payments.reduce((a: number, p: any) => a + p.bankAmount + p.tds, 0);
        assert.ok(settled <= invoice.amount, `${invoice.number} is overpaid`);
      }
    }
  });
});

describe('an Owner-set password must be replaced before use (H-09)', () => {
  test('a new teammate is blocked from the workspace until they set their own', async () => {
    const created = await call('POST', '/api/team', {
      session: owner,
      body: {
        name: 'Temp Password',
        email: 'temp-password@phot.ai',
        permission: 'Editor',
        password: 'owner-chose-this',
      },
    });
    assert.equal(created.status, 201);

    const session = await signIn('temp-password@phot.ai', 'owner-chose-this');

    // They can see who they are — and that they are required to act.
    const me = await call('GET', '/api/auth/session', { session });
    assert.equal(me.status, 200);
    assert.equal(me.body.me.mustChangePassword, true);

    // But nothing else works while an administrator knows their password.
    for (const [method, path] of [
      ['GET', '/api/clients'],
      ['GET', '/api/team'],
      ['GET', '/api/followups'],
      ['POST', '/api/clients/c1/tasks'],
    ] as const) {
      const res = await call(method, path, { session, body: method === 'POST' ? { title: 'x' } : undefined });
      assert.equal(res.status, 403, `${method} ${path} must be refused`);
      assert.match(res.body.error, /Set your own password/);
    }

    // Setting their own password clears it, in the same response.
    const settled = await call('POST', '/api/auth/password', {
      session,
      body: { currentPassword: 'owner-chose-this', newPassword: 'my-own-phrase-11' },
    });
    assert.equal(settled.status, 200);
    assert.equal(settled.body.me.mustChangePassword, false);

    const after = await signIn('temp-password@phot.ai', 'my-own-phrase-11');
    assert.equal((await call('GET', '/api/clients', { session: after })).status, 200);
  });

  test('signing out is still possible while blocked', async () => {
    await call('POST', '/api/team', {
      session: owner,
      body: { name: 'Stuck', email: 'stuck@phot.ai', permission: 'Editor', password: 'owner-chose-this' },
    });
    const session = await signIn('stuck@phot.ai', 'owner-chose-this');
    assert.equal((await call('POST', '/api/auth/logout', { session })).status, 204);
  });

  test('an account whose password its holder chose is not blocked', async () => {
    // The seeded demo accounts and first-run setup both set their own.
    const me = await call('GET', '/api/auth/session', { session: owner });
    assert.equal(me.body.me.mustChangePassword, false);
    assert.equal((await call('GET', '/api/clients', { session: owner })).status, 200);
  });
});

describe('password reset links (M-10)', () => {
  /**
   * A fresh account per test — reusing one would make each test depend on which
   * password the previous test happened to leave behind.
   */
  async function teammateNeedingReset(label: string) {
    const email = `forgot-${label}@phot.ai`;
    await createTeammateSession({ name: `Forgot ${label}`, email });
    const team = await call('GET', '/api/team', { session: owner });
    const row = team.body.team.find((t: any) => t.email === email || t.name === `Forgot ${label}`);
    assert.ok(row, `the teammate ${email} exists`);
    return { userId: row.id as string, email };
  }

  test('an Owner mints a one-time link, and redeeming it signs the person in', async () => {
    const { userId, email } = await teammateNeedingReset('signin');

    const issued = await call('POST', `/api/team/${userId}/reset-password`, { session: owner });
    assert.equal(issued.status, 201);
    const url = new URL(issued.body.resetUrl);
    const token = url.searchParams.get('reset') ?? '';
    assert.ok(token.length > 20, 'the link carries a long random token');
    assert.ok(new Date(issued.body.expiresAt) > new Date(), 'and an expiry');

    // The screen can check it before asking for a password.
    const check = await call('GET', `/api/auth/reset?token=${encodeURIComponent(token)}`);
    assert.equal(check.body.valid, true);

    const redeemed = await call('POST', '/api/auth/reset', {
      body: { token, newPassword: 'a-brand-new-phrase' },
    });
    assert.equal(redeemed.status, 200);
    assert.equal(redeemed.body.me.email, email);
    // Redeeming counts as choosing their own password, so nothing is blocked.
    assert.equal(redeemed.body.me.mustChangePassword, false);

    // The new password works; the old one does not.
    await signIn(email, 'a-brand-new-phrase');
    assert.equal(
      (await call('POST', '/api/auth/login', { body: { email, password: 'chosen-phrase-99' } })).status,
      401,
    );
  });

  test('a link works exactly once', async () => {
    const { userId } = await teammateNeedingReset('once');
    const issued = await call('POST', `/api/team/${userId}/reset-password`, { session: owner });
    const token = new URL(issued.body.resetUrl).searchParams.get('reset') ?? '';

    assert.equal((await call('POST', '/api/auth/reset', { body: { token, newPassword: 'first-choice-9' } })).status, 200);

    const second = await call('POST', '/api/auth/reset', {
      body: { token, newPassword: 'second-choice-9' },
    });
    assert.equal(second.status, 400);
    assert.match(second.body.error, /no longer valid/);
    assert.equal((await call('GET', `/api/auth/reset?token=${encodeURIComponent(token)}`)).body.valid, false);
  });

  test('issuing a new link cancels the previous one', async () => {
    const { userId } = await teammateNeedingReset('supersede');
    const first = await call('POST', `/api/team/${userId}/reset-password`, { session: owner });
    const firstToken = new URL(first.body.resetUrl).searchParams.get('reset') ?? '';
    const second = await call('POST', `/api/team/${userId}/reset-password`, { session: owner });
    const secondToken = new URL(second.body.resetUrl).searchParams.get('reset') ?? '';

    assert.equal((await call('GET', `/api/auth/reset?token=${encodeURIComponent(firstToken)}`)).body.valid, false);
    assert.equal((await call('GET', `/api/auth/reset?token=${encodeURIComponent(secondToken)}`)).body.valid, true);
  });

  test('an expired link is refused', async () => {
    const { userId } = await teammateNeedingReset('expired');
    const issued = await call('POST', `/api/team/${userId}/reset-password`, { session: owner });
    const token = new URL(issued.body.resetUrl).searchParams.get('reset') ?? '';

    // Age it past its expiry.
    db.prepare("UPDATE password_resets SET expires_at = ? WHERE used_at IS NULL").run(
      new Date(Date.now() - 1000).toISOString(),
    );
    assert.equal((await call('GET', `/api/auth/reset?token=${encodeURIComponent(token)}`)).body.valid, false);
    const res = await call('POST', '/api/auth/reset', { body: { token, newPassword: 'too-late-now-9' } });
    assert.equal(res.status, 400);
  });

  test('a made-up token is refused, and says nothing about why', async () => {
    const invented = await call('POST', '/api/auth/reset', {
      body: { token: 'not-a-real-token-at-all', newPassword: 'arbitrary-phrase-1' },
    });
    assert.equal(invented.status, 400);
    assert.match(invented.body.error, /no longer valid/);
    assert.equal((await call('GET', '/api/auth/reset?token=nonsense')).body.valid, false);
  });

  test('only the token hash is stored, so a database dump yields no usable links', async () => {
    const { userId } = await teammateNeedingReset('hashed');
    const issued = await call('POST', `/api/team/${userId}/reset-password`, { session: owner });
    const token = new URL(issued.body.resetUrl).searchParams.get('reset') ?? '';

    const rows = db.prepare('SELECT token_hash FROM password_resets').all() as { token_hash: string }[];
    for (const row of rows) {
      assert.notEqual(row.token_hash, token, 'the raw token must never be stored');
    }
    assert.ok(
      rows.some((r) => /^[0-9a-f]{64}$/.test(r.token_hash)),
      'stored as a SHA-256 hash',
    );
  });

  test('redeeming invalidates the account’s other sessions', async () => {
    const { userId, email } = await teammateNeedingReset('sessions');
    const stale = await signIn(email, 'chosen-phrase-99');
    assert.equal((await call('GET', '/api/clients', { session: stale })).status, 200);

    const issued = await call('POST', `/api/team/${userId}/reset-password`, { session: owner });
    const token = new URL(issued.body.resetUrl).searchParams.get('reset') ?? '';
    await call('POST', '/api/auth/reset', { body: { token, newPassword: 'rotated-phrase-99' } });

    assert.equal(
      (await call('GET', '/api/clients', { session: stale })).status,
      401,
      'a session held by whoever locked them out must not survive',
    );
  });

  test('only an Owner can issue one, and not for themselves', async () => {
    const { userId } = await teammateNeedingReset('permissions');
    assert.equal(
      (await call('POST', `/api/team/${userId}/reset-password`, { session: noInvoices })).status,
      403,
    );
    const own = await call('POST', '/api/team/tm1/reset-password', { session: owner });
    assert.equal(own.status, 400, 'an Owner uses change-password for their own account');
  });
});

/**
 * Keep this suite LAST. It deliberately trips the per-IP limiter, which is shared
 * by every request in this process, so anything signing in afterwards would get a
 * 429 that has nothing to do with what it was testing.
 */
describe('brute force is throttled (H-01)', () => {
  test('repeated wrong passwords eventually get 429 with Retry-After', async () => {
    const email = 'throttle-target@phot.ai';
    const created = await call('POST', '/api/team', {
      session: owner,
      body: { name: 'Throttle', email, permission: 'Viewer', password: 'chosen-phrase-1234' },
    });
    assert.equal(created.status, 201);

    let sawTooMany = false;
    let retryAfter = '';
    for (let i = 0; i < 12; i++) {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: `wrong-${i}` }),
      });
      if (res.status === 429) {
        sawTooMany = true;
        retryAfter = res.headers.get('retry-after') ?? '';
        break;
      }
      assert.equal(res.status, 401, 'before the limit, a wrong password is just a 401');
    }

    assert.ok(sawTooMany, 'guessing must eventually be refused outright');
    assert.match(retryAfter, /^\d+$/, 'Retry-After tells the client how long to wait');

    // The correct password is refused too while the block holds — that is the
    // point, and it is why the block is time-limited rather than permanent.
    const evenWithTheRightPassword = await call('POST', '/api/auth/login', {
      body: { email, password: 'chosen-phrase-1234' },
    });
    assert.equal(evenWithTheRightPassword.status, 429);
  });

  test('throttling reveals nothing about whether an account exists', async () => {
    const hammer = async (email: string) => {
      let status = 0;
      for (let i = 0; i < 12; i++) {
        const res = await call('POST', '/api/auth/login', { body: { email, password: `x-${i}` } });
        status = res.status;
        if (status === 429) break;
      }
      return status;
    };
    // Two addresses, one real and one not: both end up throttled the same way.
    assert.equal(await hammer('maya@phot.ai'), 429);
    assert.equal(await hammer('definitely-not-a-user@phot.ai'), 429);
  });

  test('a wrong current password on the change-password endpoint is throttled too', async () => {
    const email = 'throttle-pw@phot.ai';
    await call('POST', '/api/team', {
      session: owner,
      body: { name: 'PwThrottle', email, permission: 'Editor', password: 'chosen-phrase-1234' },
    });
    const session = await signIn(email, 'chosen-phrase-1234');

    let sawTooMany = false;
    for (let i = 0; i < 12; i++) {
      const res = await call('POST', '/api/auth/password', {
        session,
        body: { currentPassword: `wrong-${i}`, newPassword: 'a-newly-chosen-1' },
      });
      if (res.status === 429) {
        sawTooMany = true;
        break;
      }
      assert.equal(res.status, 403);
    }
    assert.ok(sawTooMany, 'guessing the current password must be throttled');
  });
});
