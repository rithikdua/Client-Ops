import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.SESSION_SECRET = 'test-secret';
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'client-ops-page-'));

const { createApp } = await import('../src/app');
const { newId, openDb } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');
const { buildSnapshot } = await import('../src/domain/snapshot');

const db = openDb(':memory:');
seedDemoWorkspace(db, { password: 'demo-pass-2026!' });

/** Enough accounts that a fan-out would be visible. */
const EXTRA = 60;
const now = new Date().toISOString();
const insertClient = db.prepare(
  `INSERT INTO clients (id, name, industry, health, owner, stage, currency, billing_cycle,
                        contract_value_minor, start_date, version, created_at)
   VALUES (?, ?, 'Testing', ?, '', 'Live', 'INR', 'Monthly', ?, '2026-01-01', 1, ?)`,
);
const insertInvoice = db.prepare(
  `INSERT INTO invoices (id, client_id, number, amount_minor, base_amount_minor, gst_percent,
                         gst_amount_minor, gst_mode, issue_date, due_date, created_at)
   VALUES (?, ?, ?, 1000, 1000, 0, 0, 'excluded', '2026-01-01', '2026-02-01', ?)`,
);
db.transaction(() => {
  for (let i = 0; i < EXTRA; i++) {
    const id = newId();
    insertClient.run(
      id,
      `Bulk ${String(i).padStart(3, '0')}`,
      i % 3 === 0 ? 'At Risk' : 'Active',
      (i + 1) * 1000,
      now,
    );
    for (let j = 0; j < 3; j++) insertInvoice.run(newId(), id, `BULK-${i}-${j}`, now);
  }
})();

const server = createApp(db).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
let cookie = '';

async function call(path: string) {
  const response = await fetch(base + path, { headers: { cookie } });
  return { status: response.status, body: (await response.json()) as any };
}

const actorFor = () =>
  ({
    userId: 'tm1',
    name: 'Priya',
    email: 'priya@phot.ai',
    role: 'Ops',
    permission: 'Owner',
    access: {
      overview: true,
      clients: true,
      invoices: true,
      deliverables: true,
      documents: true,
      team: true,
      followups: true,
      phonebook: true,
    },
    canWrite: true,
    canManageTeam: true,
    hasPassword: true,
    mustChangePassword: false,
    previewAsId: null,
  }) as never;

before(async () => {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'priya@phot.ai', password: 'demo-pass-2026!' }),
  });
  cookie = (login.headers.getSetCookie?.()[0] ?? '').split(';')[0];
});

after(() => {
  server.close();
  db.close();
});

describe('F-08 the snapshot no longer runs a query per client', () => {
  test('the number of queries does not grow with the workspace', () => {
    // The measurement that motivated this: 206 clients ran 2,274 prepared
    // statements, 606 ran 6,674. It is a fixed set of queries now, so the count
    // is the same whichever slice is asked for.
    const count = (fn: () => void) => {
      let n = 0;
      const real = db.prepare.bind(db);
      (db as unknown as { prepare: unknown }).prepare = (sql: string) => {
        n += 1;
        return real(sql);
      };
      try {
        fn();
      } finally {
        (db as unknown as { prepare: unknown }).prepare = real;
      }
      return n;
    };

    const whole = count(() => buildSnapshot(db, actorFor()));
    const page = count(() => buildSnapshot(db, actorFor(), { limit: 10 }));

    assert.ok(whole < 40, `a whole snapshot took ${whole} queries`);
    assert.ok(page < 40, `a page took ${page} queries`);
    // Ten clients and sixty cost the same number of round trips.
    assert.equal(
      count(() => buildSnapshot(db, actorFor(), { limit: 10 })),
      count(() => buildSnapshot(db, actorFor(), { limit: 50 })),
    );
  });

  test('the whole snapshot still carries every client, unchanged', async () => {
    const all = await call('/api/clients');
    assert.equal(all.body.clients.length, EXTRA + 6);
    assert.equal(all.body.page, undefined, 'no page object unless one was asked for');
    // The collections are still there — batching changed how they are fetched,
    // not what comes back.
    const withInvoices = all.body.clients.find((c: any) => c.invoices.length > 0);
    assert.ok(withInvoices, 'invoices still arrive with their clients');
    assert.ok(withInvoices.invoices[0].payments, 'and their payments');
  });
});

describe('F-08 a page of clients', () => {
  test('returns a window, and says how big the whole list is', async () => {
    const first = await call('/api/clients?limit=10&sort=name');
    assert.equal(first.body.clients.length, 10);
    assert.equal(first.body.page.total, EXTRA + 6);
    assert.ok(first.body.page.nextCursor);
  });

  test('walking the cursor visits every client exactly once', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const path: string = `/api/clients?limit=10&sort=name${cursor ? `&cursor=${cursor}` : ''}`;
      const page = await call(path);
      seen.push(...page.body.clients.map((c: any) => c.id));
      cursor = page.body.page.nextCursor;
      if (!cursor) break;
    }
    assert.equal(seen.length, EXTRA + 6, 'every client, once');
    assert.equal(new Set(seen).size, seen.length, 'no duplicates across pages');
  });

  test('a page is a window onto the sorted list, not an arbitrary ten', async () => {
    // Otherwise "the next 50" is the next 50 of a different list every time.
    const page = await call('/api/clients?limit=5&sort=name');
    const names = page.body.clients.map((c: any) => c.name);
    assert.deepEqual(names, [...names].sort((a: string, b: string) => a.localeCompare(b)));
  });

  test('filters narrow the whole list, not just the page', async () => {
    const risky = await call('/api/clients?limit=5&health=At Risk');
    assert.ok(risky.body.clients.every((c: any) => c.health === 'At Risk'));
    // The count is of everything matching, which is what lets a screen say
    // "5 of 21" rather than only what it happens to be holding.
    assert.ok(risky.body.page.total > 5);
    assert.equal(
      risky.body.page.total,
      (
        db
          .prepare("SELECT COUNT(*) AS n FROM clients WHERE health = 'At Risk' AND archived_at IS NULL")
          .get() as { n: number }
      ).n,
    );
  });

  test('search narrows by name or industry', async () => {
    const found = await call('/api/clients?limit=100&search=Bulk 00');
    assert.equal(found.body.page.total, 10, 'Bulk 000 through Bulk 009');
    assert.ok(found.body.clients.every((c: any) => c.name.startsWith('Bulk 00')));
  });

  test('a cursor that no longer exists starts again rather than failing', async () => {
    // Somebody's open tab, after the row it pointed at was archived.
    const page = await call('/api/clients?limit=5&sort=name&cursor=not-a-real-id');
    assert.equal(page.status, 200);
    assert.equal(page.body.clients.length, 5);
  });

  test('nonsense is refused rather than interpreted', async () => {
    assert.equal((await call('/api/clients?limit=0')).status, 400);
    assert.equal((await call('/api/clients?limit=abc')).status, 400);
    assert.equal((await call('/api/clients?limit=5&sort=passwords')).status, 400);
  });

  test('a page cannot be used to ask for unbounded work', async () => {
    const huge = await call('/api/clients?limit=100000');
    assert.equal(huge.status, 200);
    assert.ok(huge.body.clients.length <= 500, 'capped at MAX_PAGE');
  });

  test('archived clients are absent from pages and from the total', async () => {
    const before = (await call('/api/clients?limit=1')).body.page.total;
    const victim = (await call('/api/clients?limit=1&sort=name')).body.clients[0];
    await fetch(`${base}/api/clients/${victim.id}`, { method: 'DELETE', headers: { cookie } });

    const after = await call('/api/clients?limit=1&sort=name');
    assert.equal(after.body.page.total, before - 1);
    assert.notEqual(after.body.clients[0].id, victim.id);
  });
});
