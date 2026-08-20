import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.SESSION_SECRET = 'test-secret';
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'client-ops-relational-'));

const { createApp } = await import('../src/app');
const { openDb } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');

const db = openDb(':memory:');
seedDemoWorkspace(db, { password: 'demo1234' });
const server = createApp(db).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let cookie = '';
let clientId = '';

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const NEW_CLIENT = {
  name: 'Date Rules Ltd',
  health: 'Active',
  stage: 'Onboarding',
  billingCycle: 'Monthly',
  baseAmount: 1000,
  gstPercent: 18,
  gstMode: 'excluded',
};

before(async () => {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'priya@phot.ai', password: 'demo1234' }),
  });
  cookie = (login.headers.getSetCookie?.()[0] ?? '').split(';')[0];
  clientId = (await call('GET', '/api/clients')).body.clients[0].id;
});

after(() => {
  server.close();
  db.close();
});

describe('M-03 dates have to make sense together, not just individually', () => {
  test('an invoice cannot be due before it was issued', async () => {
    const res = await call('POST', `/api/clients/${clientId}/invoices`, {
      number: 'INV-BACKWARDS',
      baseAmount: 1000,
      gstPercent: 0,
      gstMode: 'excluded',
      issueDate: '2026-08-20',
      dueDate: '2026-08-01',
    });
    assert.equal(res.status, 400);
    assert.match(JSON.stringify(res.body), /due date cannot be before the issue date/i);

    // Same day is fine — "due on receipt" is a real payment term.
    const sameDay = await call('POST', `/api/clients/${clientId}/invoices`, {
      number: 'INV-SAME-DAY',
      baseAmount: 1000,
      gstPercent: 0,
      gstMode: 'excluded',
      issueDate: '2026-08-20',
      dueDate: '2026-08-20',
    });
    assert.equal(sameDay.status, 201);
  });

  test('a contract cannot end before it starts', async () => {
    const res = await call('POST', '/api/clients', {
      ...NEW_CLIENT,
      startDate: '2026-12-01',
      contractEndDate: '2026-10-01',
    });
    assert.equal(res.status, 400);
    assert.match(JSON.stringify(res.body), /cannot end before it starts/i);
  });

  test('onboarding cannot predate the contract', async () => {
    const res = await call('POST', '/api/clients', {
      ...NEW_CLIENT,
      startDate: '2026-06-01',
      onboardingDate: '2026-05-01',
    });
    assert.equal(res.status, 400);
    assert.match(JSON.stringify(res.body), /before the contract starts/i);
  });

  test('a patch is checked against the record it will produce', async () => {
    const created = await call('POST', '/api/clients', {
      ...NEW_CLIENT,
      name: 'Patch Rules Ltd',
      startDate: '2026-06-01',
      contractEndDate: '2027-06-01',
    });
    assert.equal(created.status, 201);
    const target = created.body.clients.find((c: any) => c.name === 'Patch Rules Ltd');

    // Moving only the end date, which the payload alone cannot judge.
    const bad = await call('PATCH', `/api/clients/${target.id}`, {
      contractEndDate: '2026-01-01',
    });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /cannot end before it starts/i);

    // And moving the start date past a stored end date is caught the same way.
    const alsoBad = await call('PATCH', `/api/clients/${target.id}`, {
      startDate: '2028-01-01',
    });
    assert.equal(alsoBad.status, 400);

    // A legitimate change still works.
    const good = await call('PATCH', `/api/clients/${target.id}`, {
      contractEndDate: '2028-06-01',
    });
    assert.equal(good.status, 200);
  });

  test('an unset date is never compared', async () => {
    const res = await call('POST', '/api/clients', {
      ...NEW_CLIENT,
      name: 'No End Date Ltd',
      startDate: '2026-06-01',
    });
    assert.equal(res.status, 201, 'an open-ended contract is normal');
  });
});

describe('M-06 invoice numbers are unique per client', () => {
  test('the same number twice on one client is refused', async () => {
    const body = {
      number: 'INV-2026-DUPE',
      baseAmount: 5000,
      gstPercent: 0,
      gstMode: 'excluded',
      issueDate: '2026-03-01',
      dueDate: '2026-03-15',
    };
    assert.equal((await call('POST', `/api/clients/${clientId}/invoices`, body)).status, 201);

    const again = await call('POST', `/api/clients/${clientId}/invoices`, body);
    assert.equal(again.status, 409);
    assert.match(again.body.error, /already has an invoice numbered INV-2026-DUPE/);
  });

  test('two different clients may use the same number', async () => {
    // Numbering is per account here, not workspace-wide, which is how most
    // small agencies actually number: a sequence per client.
    const other = (await call('GET', '/api/clients')).body.clients[1];
    const res = await call('POST', `/api/clients/${other.id}/invoices`, {
      number: 'INV-2026-DUPE',
      baseAmount: 5000,
      gstPercent: 0,
      gstMode: 'excluded',
      issueDate: '2026-03-01',
      dueDate: '2026-03-15',
    });
    assert.equal(res.status, 201);
  });

  test('the database enforces it too, not only the route', () => {
    const indexes = db.prepare("PRAGMA index_list('invoices')").all() as {
      name: string;
      unique: number;
    }[];
    const unique = indexes.find((i) => i.name === 'idx_invoices_client_number');
    assert.ok(unique, 'the unique index exists');
    assert.equal(unique.unique, 1);

    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO invoices (id, client_id, number, amount_minor, base_amount_minor,
               issue_date, due_date, created_at)
             VALUES ('forced', ?, 'INV-2026-DUPE', 100, 100, '2026-03-01', '2026-03-15', '2026-03-01T00:00:00Z')`,
          )
          .run(clientId),
      /UNIQUE constraint failed/,
    );
  });

  test('an existing database with duplicates upgrades without destroying them', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'client-ops-dupes-')), 'db.sqlite');
    const older = openDb(path);
    // Make it look like a real v8 database: no unique index yet, so the
    // duplicates below can exist at all.
    older.exec('DROP INDEX IF EXISTS idx_invoices_client_number');
    older
      .prepare(
        `INSERT INTO clients (id, name, health, stage, billing_cycle, start_date, created_at)
         VALUES ('d1', 'Dupes', 'Active', 'Live', 'Monthly', '2026-01-01', '2026-01-01T00:00:00Z')`,
      )
      .run();
    for (const id of ['i1', 'i2']) {
      older
        .prepare(
          `INSERT INTO invoices (id, client_id, number, amount_minor, base_amount_minor,
             issue_date, due_date, created_at)
           VALUES (?, 'd1', 'INV-SAME', 100, 100, '2026-01-01', '2026-02-01', '2026-01-01T00:00:00Z')`,
        )
        .run(id);
    }
    older.prepare('UPDATE schema_version SET version = 8').run();
    older.close();

    const upgraded = openDb(path);
    // Both invoices are still there — nothing was renumbered or deleted.
    const count = upgraded.prepare("SELECT COUNT(*) AS n FROM invoices WHERE number = 'INV-SAME'").get() as {
      n: number;
    };
    assert.equal(count.n, 2);
    upgraded.close();
  });
});
