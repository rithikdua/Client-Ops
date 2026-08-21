import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.SESSION_SECRET = 'test-secret';
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'client-ops-concurrency-'));

const { createApp } = await import('../src/app');
const { openDb } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');

const db = openDb(':memory:');
seedDemoWorkspace(db, { password: 'demo-pass-2026!' });
const server = createApp(db).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let cookie = '';
let clientId = '';

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const clientFrom = (body: any) => body.clients.find((c: any) => c.id === clientId);

before(async () => {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'priya@phot.ai', password: 'demo-pass-2026!' }),
  });
  cookie = (login.headers.getSetCookie?.()[0] ?? '').split(';')[0];
  clientId = (await call('GET', '/api/clients')).body.clients[0].id;
});

after(() => {
  server.close();
  db.close();
});

describe('H-02 a stale edit is refused, not silently applied', () => {
  test('the version is sent with every client', async () => {
    const client = clientFrom((await call('GET', '/api/clients')).body);
    assert.equal(typeof client.version, 'number');
  });

  test('two people editing the same client: the second is told, not ignored', async () => {
    const before = clientFrom((await call('GET', '/api/clients')).body);
    const staleVersion = before.version;

    // Person A saves a note about the renewal.
    const a = await call('PATCH', `/api/clients/${clientId}`, {
      notes: 'CFO wants the renewal discussed before the 30th.',
      version: staleVersion,
    });
    assert.equal(a.status, 200);

    // Person B has had the form open since before that, and saves the industry.
    // Their payload carries `notes` as it was, which would wipe A's sentence.
    const b = await call('PATCH', `/api/clients/${clientId}`, {
      industry: 'Freight & Logistics (Asia)',
      notes: '',
      version: staleVersion,
    });
    assert.equal(b.status, 409, 'the stale save must be refused');
    assert.match(b.body.error, /Someone else changed this client/);

    // A's work survived, and B's change was not applied.
    const after = clientFrom((await call('GET', '/api/clients')).body);
    assert.match(after.notes, /CFO wants the renewal/);
    assert.notEqual(after.industry, 'Freight & Logistics (Asia)');
  });

  test('a refused write changes nothing at all', async () => {
    const before = clientFrom((await call('GET', '/api/clients')).body);
    const rejected = await call('PATCH', `/api/clients/${clientId}`, {
      name: 'Renamed By A Stale Tab',
      industry: 'Nonsense',
      version: before.version - 1,
    });
    assert.equal(rejected.status, 409);

    const after = clientFrom((await call('GET', '/api/clients')).body);
    assert.equal(after.name, before.name);
    assert.equal(after.industry, before.industry);
    assert.equal(after.version, before.version, 'a refused write does not burn a version');
  });

  test('reloading and saving again works — the point is to retry, not to be stuck', async () => {
    const current = clientFrom((await call('GET', '/api/clients')).body);
    const retried = await call('PATCH', `/api/clients/${clientId}`, {
      industry: 'Freight & Logistics (Asia)',
      version: current.version,
    });
    assert.equal(retried.status, 200);
    assert.equal(clientFrom(retried.body).industry, 'Freight & Logistics (Asia)');
  });

  test('the version advances by exactly one per accepted edit', async () => {
    const start = clientFrom((await call('GET', '/api/clients')).body).version;
    await call('PATCH', `/api/clients/${clientId}`, { owner: 'Priya Shah', version: start });
    const next = clientFrom((await call('GET', '/api/clients')).body).version;
    assert.equal(next, start + 1);
  });

  test('a request that sends no version keeps the old behaviour', async () => {
    // Scripts and the CLI do not track versions, and must not start failing.
    const res = await call('PATCH', `/api/clients/${clientId}`, { cityTier: 'Tier 1' });
    assert.equal(res.status, 200);
    assert.equal(clientFrom(res.body).cityTier, 'Tier 1');
  });

  test('tasks, deliverables and follow-ups are guarded too', async () => {
    const created = await call('POST', `/api/clients/${clientId}/tasks`, {
      title: 'Concurrent task',
      status: 'New',
      priority: 'Medium',
    });
    const task = clientFrom(created.body).tasks.find((t: any) => t.title === 'Concurrent task');
    assert.equal(typeof task.version, 'number');

    const first = await call('PATCH', `/api/clients/${clientId}/tasks/${task.id}`, {
      status: 'In Dev',
      version: task.version,
    });
    assert.equal(first.status, 200);
    const stale = await call('PATCH', `/api/clients/${clientId}/tasks/${task.id}`, {
      status: 'Done',
      version: task.version,
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body.error, /Someone else changed this task/);

    const deliverable = clientFrom((await call('GET', '/api/clients')).body).deliverables[0];
    assert.equal(typeof deliverable.version, 'number');
    const staleDeliverable = await call(
      'PATCH',
      `/api/clients/${clientId}/deliverables/${deliverable.id}`,
      { status: 'Done', version: deliverable.version - 1 },
    );
    assert.equal(staleDeliverable.status, 409);
    assert.match(staleDeliverable.body.error, /Someone else changed this deliverable/);

    const followUp = (await call('GET', '/api/followups')).body.followUps[0];
    assert.equal(typeof followUp.version, 'number');
    const staleFollowUp = await call('PATCH', `/api/followups/${followUp.id}`, {
      name: followUp.name,
      dueDate: followUp.dueDate,
      version: followUp.version - 1,
    });
    assert.equal(staleFollowUp.status, 409);
    assert.match(staleFollowUp.body.error, /Someone else changed this follow-up/);
  });
});
