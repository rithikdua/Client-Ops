import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.SESSION_SECRET = 'test-secret';
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'client-ops-archive-'));

const { createApp } = await import('../src/app');
const { openDb } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');
const { purgeArchived } = await import('../src/domain/archive');

const db = openDb(':memory:');
seedDemoWorkspace(db, { password: 'demo-pass-2026!' });
const server = createApp(db).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let owner = '';
let clientId = '';

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string } = {},
): Promise<{ status: number; body: any }> {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      cookie: opts.cookie ?? owner,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** Every mutation answers with a snapshot, so both take one. */
const snapshot = async () => (await call('GET', '/api/clients')).body;
const clientOf = (body: any) => body.clients.find((c: any) => c.id === clientId);

async function signIn(email: string, password: string): Promise<string> {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (login.headers.getSetCookie?.()[0] ?? '').split(';')[0];
}

before(async () => {
  owner = await signIn('priya@phot.ai', 'demo-pass-2026!');
  clientId = (await snapshot()).clients[0].id;
});

after(() => {
  server.close();
  db.close();
});

describe('F-10 deleting hides a record rather than destroying it', () => {
  test('a deleted invoice leaves the list but not the database', async () => {
    const invoice = clientOf(await snapshot()).invoices[0];

    const deleted = await call('DELETE', `/api/clients/${clientId}/invoices/${invoice.id}`);
    assert.equal(deleted.status, 200);

    const listed = clientOf(deleted.body).invoices.some((i: any) => i.id === invoice.id);
    assert.equal(listed, false, 'gone from the app');

    const row = db.prepare('SELECT archived_at FROM invoices WHERE id = ?').get(invoice.id) as {
      archived_at: string | null;
    };
    assert.ok(row, 'still in the database');
    assert.ok(row.archived_at, 'stamped with when it went');
  });

  test('its payments go with it, and come back with it', async () => {
    // The reason this matters: deleting an invoice used to cascade its payments
    // away permanently. Money received is not something to lose to a misclick.
    const invoice = db
      .prepare('SELECT id FROM invoices WHERE archived_at IS NOT NULL LIMIT 1')
      .get() as { id: string };
    const payments = db
      .prepare('SELECT COUNT(*) AS n FROM payments WHERE invoice_id = ?')
      .get(invoice.id) as { n: number };
    assert.ok(payments.n > 0, 'this invoice had payments against it');

    const restored = await call('POST', `/api/archive/invoices/${invoice.id}/restore`);
    assert.equal(restored.status, 200);

    const back = clientOf(restored.body).invoices.find((i: any) => i.id === invoice.id);
    assert.ok(back, 'the invoice is back');
    assert.equal(back.payments.length, payments.n, 'with every payment still on it');
  });

  test('an archived client takes its screen with it, and nothing under it can be edited', async () => {
    const doomed = (
      await call('POST', '/api/clients', {
        body: {
          name: 'Archivable Ltd',
          health: 'Active',
          stage: 'Live',
          billingCycle: 'Monthly',
          startDate: '2026-01-05',
          baseAmount: 1000,
          gstPercent: 0,
          gstMode: 'excluded',
        },
      })
    ).body.clients.find((c: any) => c.name === 'Archivable Ltd');

    const task = (
      await call('POST', `/api/clients/${doomed.id}/tasks`, {
        body: { title: 'Underneath', status: 'New', priority: 'Medium' },
      })
    ).body.clients.find((c: any) => c.id === doomed.id).tasks[0];

    await call('DELETE', `/api/clients/${doomed.id}`);

    assert.equal(
      (await snapshot()).clients.some((c: any) => c.id === doomed.id),
      false,
    );
    // The guard in front of every child route: a URL somebody still has open
    // must not be a way back in.
    const edit = await call('PATCH', `/api/clients/${doomed.id}/tasks/${task.id}`, {
      body: { title: 'Changed' },
    });
    assert.equal(edit.status, 404);

    const restored = await call('POST', `/api/archive/clients/${doomed.id}/restore`);
    assert.equal(restored.status, 200);
    const back = restored.body.clients.find((c: any) => c.id === doomed.id);
    assert.equal(back.tasks.length, 1, 'and everything under it comes back too');
  });

  test('restoring a child of an archived client is refused, not done invisibly', async () => {
    const doomed = (
      await call('POST', '/api/clients', {
        body: {
          name: 'Parent Ltd',
          health: 'Active',
          stage: 'Live',
          billingCycle: 'Monthly',
          startDate: '2026-01-05',
          baseAmount: 1000,
          gstPercent: 0,
          gstMode: 'excluded',
        },
      })
    ).body.clients.find((c: any) => c.name === 'Parent Ltd');
    const doc = (
      await call('POST', `/api/clients/${doomed.id}/documents`, {
        body: { name: 'Buried.pdf', type: 'Other', source: 'us' },
      })
    ).body.clients.find((c: any) => c.id === doomed.id).documents[0];

    await call('DELETE', `/api/clients/${doomed.id}/documents/${doc.id}`);
    await call('DELETE', `/api/clients/${doomed.id}`);

    // Restoring it would put a row in the database that appears nowhere, which
    // looks exactly like the restore having failed.
    const refused = await call('POST', `/api/archive/documents/${doc.id}/restore`);
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /Restore Parent Ltd first/);
  });

  test('restoring something that is not archived says so', async () => {
    const live = clientOf(await snapshot()).deliverables[0];
    const res = await call('POST', `/api/archive/deliverables/${live.id}/restore`);
    assert.equal(res.status, 409);
    assert.match(res.body.error, /not archived/);
  });

  test('an invoice number stays reserved while archived', async () => {
    // Otherwise restoring one could collide with a number issued in the
    // meantime, and the unique index would refuse the restore.
    const created = await call('POST', `/api/clients/${clientId}/invoices`, {
      body: {
        number: 'INV-RESERVED',
        baseAmount: 100,
        gstPercent: 0,
        gstMode: 'excluded',
        issueDate: '2026-02-01',
        dueDate: '2026-03-01',
      },
    });
    const invoice = clientOf(created.body).invoices.find((i: any) => i.number === 'INV-RESERVED');
    await call('DELETE', `/api/clients/${clientId}/invoices/${invoice.id}`);

    const reused = await call('POST', `/api/clients/${clientId}/invoices`, {
      body: {
        number: 'INV-RESERVED',
        baseAmount: 100,
        gstPercent: 0,
        gstMode: 'excluded',
        issueDate: '2026-02-01',
        dueDate: '2026-03-01',
      },
    });
    assert.equal(reused.status, 409);
  });
});

describe('F-10 the archive is behind the same permissions as the records', () => {
  test('a teammate without invoice access cannot see or restore archived invoices', async () => {
    // daniel has no invoices section in the seeded workspace.
    const daniel = await signIn('daniel@phot.ai', 'demo-pass-2026!');

    const archivedInvoice = db
      .prepare('SELECT id FROM invoices WHERE archived_at IS NOT NULL LIMIT 1')
      .get() as { id: string } | undefined;
    assert.ok(archivedInvoice, 'there is an archived invoice to try');

    const listed = await call('GET', '/api/archive', { cookie: daniel });
    assert.equal(listed.status, 200);
    assert.equal(
      listed.body.archived.some((row: any) => row.type === 'invoices'),
      false,
      'archiving is not a way around a section permission',
    );

    const refused = await call('POST', `/api/archive/invoices/${archivedInvoice!.id}/restore`, {
      cookie: daniel,
    });
    assert.equal(refused.status, 403);
  });

  test('an Owner sees the archive with what each row belonged to', async () => {
    const listed = await call('GET', '/api/archive');
    assert.ok(listed.body.archived.length > 0);
    const withClient = listed.body.archived.find((row: any) => row.clientId);
    assert.ok(withClient.clientName, 'named, so it can be told apart from its namesakes');
    assert.ok(withClient.archivedAt);
  });

  test('one account can be asked about on its own', async () => {
    const all = (await call('GET', '/api/archive')).body.archived.length;
    const scoped = (await call('GET', `/api/archive?clientId=${clientId}`)).body.archived;
    assert.ok(scoped.length <= all);
    assert.ok(scoped.every((row: any) => !row.clientId || row.clientId === clientId));
  });
});

describe('F-10 purging is the only thing that destroys', () => {
  test('it removes what was archived before the cutoff, and nothing newer', () => {
    const archivedNow = (
      db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE archived_at IS NOT NULL').get() as {
        n: number;
      }
    ).n;
    assert.ok(archivedNow > 0);

    // A cutoff before anything happened: nothing qualifies.
    const nothing = purgeArchived(db, new Date(0).toISOString());
    assert.equal(Object.values(nothing).reduce((a, b) => a + b, 0), 0);
    assert.equal(
      (
        db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE archived_at IS NOT NULL').get() as {
          n: number;
        }
      ).n,
      archivedNow,
      'still there',
    );

    const removed = purgeArchived(db, new Date(Date.now() + 1000).toISOString());
    assert.ok(removed.invoices > 0);
    assert.equal(
      (
        db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE archived_at IS NOT NULL').get() as {
          n: number;
        }
      ).n,
      0,
    );
  });

  test('live records are never touched by a purge', async () => {
    const live = await snapshot();
    assert.ok(live.clients.length > 0, 'the workspace still has its accounts');
    assert.ok(clientOf(live).deliverables.length > 0);
  });
});
