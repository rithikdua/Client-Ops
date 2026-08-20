import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.SESSION_SECRET = 'test-secret';

const { createApp } = await import('../src/app');
const { openDb, SCHEMA_VERSION } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');
const { readAudit, recordAudit } = await import('../src/domain/audit');

const db = openDb(':memory:');
seedDemoWorkspace(db, { password: 'demo1234' });
const server = createApp(db).listen(0);
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string } = {},
): Promise<{ status: number; body: any }> {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function signIn(email: string, password = 'demo1234'): Promise<string> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `sign-in failed for ${email}`);
  const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0];
}

/** The most recent entry for an action, or undefined. */
function entry(action: string) {
  return readAudit(db, { action, limit: 1 })[0];
}

let owner = '';
let clientId = '';

before(async () => {
  owner = await signIn('priya@phot.ai');
  const snapshot = await call('GET', '/api/clients', { cookie: owner });
  clientId = snapshot.body.clients[0].id;
});

after(() => {
  server.close();
  db.close();
});

describe('H-12 audit trail', () => {
  test('deleting a client records what was destroyed with it', async () => {
    const created = await call('POST', '/api/clients', {
      cookie: owner,
      body: {
        name: 'Doomed Industries',
        health: 'Active',
        stage: 'Onboarding',
        billingCycle: 'Monthly',
        startDate: '2026-01-05',
        baseAmount: 10000,
        gstPercent: 18,
        gstMode: 'excluded',
      },
    });
    assert.equal(created.status, 201);
    const doomed = created.body.clients.find((c: any) => c.name === 'Doomed Industries');

    await call('POST', `/api/clients/${doomed.id}/invoices`, {
      cookie: owner,
      body: {
        number: 'INV-DOOM-1',
        baseAmount: 10000,
        gstPercent: 18,
        gstMode: 'excluded',
        issueDate: '2026-02-01',
        dueDate: '2026-03-01',
      },
    });

    const deleted = await call('DELETE', `/api/clients/${doomed.id}`, { cookie: owner });
    assert.equal(deleted.status, 200);

    const row = entry('client.delete');
    assert.ok(row, 'no audit entry was written');
    assert.equal(row.target_id, doomed.id);
    assert.equal(row.target_label, 'Doomed Industries');
    assert.equal(row.actor_email, 'priya@phot.ai');
    // The whole point: the feed is gone, so the counts have to be in here.
    assert.match(row.detail, /1 invoices/);
    assert.ok(row.ip, 'the address should be recorded');
  });

  test('a client-scoped delete is visible to users, in the activity feed', async () => {
    const created = await call('POST', `/api/clients/${clientId}/documents`, {
      cookie: owner,
      body: { name: 'Scope draft', type: 'Contract', source: 'us' },
    });
    const doc = created.body.clients
      .find((c: any) => c.id === clientId)
      .documents.find((d: any) => d.name === 'Scope draft');

    await call('DELETE', `/api/clients/${clientId}/documents/${doc.id}`, { cookie: owner });

    const snapshot = await call('GET', '/api/clients', { cookie: owner });
    const feed = snapshot.body.clients.find((c: any) => c.id === clientId).activity;
    assert.ok(
      feed.some((a: any) => a.note === 'Document "Scope draft" deleted' && a.kind === 'system'),
      'the deletion should appear in the client activity feed',
    );
    assert.equal(entry('document.delete').target_label, 'Scope draft');
  });

  test('removing a payment records the amount it removed', async () => {
    const invoiced = await call('POST', `/api/clients/${clientId}/invoices`, {
      cookie: owner,
      body: {
        number: 'INV-AUDIT-1',
        baseAmount: 5000,
        gstPercent: 0,
        gstMode: 'excluded',
        issueDate: '2026-02-01',
        dueDate: '2026-03-01',
      },
    });
    const invoice = invoiced.body.clients
      .find((c: any) => c.id === clientId)
      .invoices.find((i: any) => i.number === 'INV-AUDIT-1');

    const paid = await call('POST', `/api/clients/${clientId}/invoices/${invoice.id}/payments`, {
      cookie: owner,
      body: { bankAmount: 2000, tds: 0, date: '2026-02-10' },
    });
    const payment = paid.body.clients
      .find((c: any) => c.id === clientId)
      .invoices.find((i: any) => i.number === 'INV-AUDIT-1').payments[0];

    const removed = await call(
      'DELETE',
      `/api/clients/${clientId}/invoices/${invoice.id}/payments/${payment.id}`,
      { cookie: owner },
    );
    assert.equal(removed.status, 200);

    const row = entry('payment.delete');
    assert.equal(row.target_label, 'INV-AUDIT-1');
    // 2000 rupees in paise. An un-settled invoice needs the number, not just "a
    // payment was removed".
    assert.match(row.detail, /bank 200000/);
  });

  test('adding, re-scoping and removing a teammate are each recorded', async () => {
    const added = await call('POST', '/api/team', {
      cookie: owner,
      body: {
        name: 'Audited Person',
        email: 'audited@phot.ai',
        role: 'Analyst',
        permission: 'Editor',
        password: 'temporary-123',
        access: { overview: true, clients: true, invoices: true, deliverables: false, documents: false, followups: false, team: false },
      },
    });
    assert.equal(added.status, 201);
    const person = added.body.team.find((t: any) => t.name === 'Audited Person');

    const addRow = entry('team.add');
    assert.equal(addRow.target_label, 'audited@phot.ai');
    assert.match(addRow.detail, /invoices/);

    await call('PUT', `/api/team/${person.id}/access`, {
      cookie: owner,
      body: {
        access: { overview: true, clients: true, invoices: false, deliverables: false, documents: false, followups: false, team: false },
      },
    });
    const changed = entry('team.access_change');
    // Before and after, so "who could see invoices last week" is answerable.
    assert.match(changed.detail, /invoices.* -> /);
    assert.doesNotMatch(changed.detail.split('->')[1], /invoices/);

    const reset = await call('POST', `/api/team/${person.id}/reset-password`, { cookie: owner });
    assert.equal(reset.status, 201);
    assert.equal(entry('team.reset_link').target_label, 'audited@phot.ai');

    await call('DELETE', `/api/team/${person.id}`, { cookie: owner });
    const removed = entry('team.remove');
    assert.match(removed.target_label, /audited@phot\.ai/);
    assert.equal(removed.detail, 'Editor');
    // The account is gone; the entry that records its removal must not be.
    assert.equal(removed.actor_email, 'priya@phot.ai');
  });

  test('the trail survives the removal of the account that acted', async () => {
    // An Owner removed by another Owner should still be named in what they did.
    const created = await call('POST', '/api/team', {
      cookie: owner,
      body: {
        name: 'Second Owner',
        email: 'second.owner@phot.ai',
        role: 'Owner',
        permission: 'Owner',
        password: 'temporary-123',
      },
    });
    const second = created.body.team.find((t: any) => t.name === 'Second Owner');

    // They act — recorded under their own id — and are then removed.
    await signIn('second.owner@phot.ai', 'temporary-123');
    await call('DELETE', `/api/team/${second.id}`, { cookie: owner });

    const added = readAudit(db, { action: 'team.add', limit: 20 }).find(
      (r) => r.target_label === 'second.owner@phot.ai',
    );
    assert.ok(added, 'the entry recording their creation should still be there');
    assert.equal(added.actor_email, 'priya@phot.ai');

    // The row they wrote themselves still names them, id included. No foreign
    // key nulls the actor out from under a historical record.
    const theirs = readAudit(db, { action: 'auth.login', limit: 20 }).find(
      (r) => r.actor_email === 'second.owner@phot.ai',
    );
    assert.ok(theirs, 'their own sign-in should be recorded');
    assert.equal(theirs.actor_id, second.id);
  });

  test('failed and successful sign-ins are both recorded', async () => {
    await call('POST', '/api/auth/login', {
      body: { email: 'priya@phot.ai', password: 'not-the-password' },
    });
    const failed = entry('auth.login_failed');
    assert.equal(failed.actor_email, 'priya@phot.ai');
    // A wrong password is recorded against the account that was targeted, so a
    // run of attempts on one address is visible.
    assert.ok(failed.ip);

    await signIn('priya@phot.ai');
    assert.equal(entry('auth.login').actor_email, 'priya@phot.ai');
  });

  test('previewing as a teammate is attributed to the Owner, not the teammate', async () => {
    const snapshot = await call('GET', '/api/team', { cookie: owner });
    const daniel = snapshot.body.team.find((t: any) => t.name.startsWith('Daniel'));

    await call('POST', '/api/auth/preview', { cookie: owner, body: { teammateId: daniel.id } });
    const started = entry('auth.preview_start');
    assert.equal(started.actor_email, 'priya@phot.ai');
    assert.equal(started.target_id, daniel.id);
    // Not yet previewing when the entry was written, so no acting_as marker.
    assert.equal(started.acting_as_id, null);

    // Anything done *while* previewing is still attributed to the real account,
    // with the preview noted alongside it.
    const created = await call('POST', `/api/clients/${clientId}/tasks`, {
      cookie: owner,
      body: {
        title: 'Task made while previewing',
        description: '',
        assignee: '',
        status: 'New',
        priority: 'Medium',
        attachments: [],
      },
    });
    const task = created.body.clients
      .find((c: any) => c.id === clientId)
      .tasks.find((t: any) => t.title === 'Task made while previewing');
    await call('DELETE', `/api/clients/${clientId}/tasks/${task.id}`, { cookie: owner });

    const deleted = entry('task.delete');
    assert.equal(deleted.actor_email, 'priya@phot.ai');
    assert.equal(deleted.acting_as_id, daniel.id);

    await call('DELETE', '/api/auth/preview', { cookie: owner });
    assert.equal(entry('auth.preview_stop').target_id, daniel.id);
  });

  test('a refused delete writes nothing', async () => {
    const before = readAudit(db, { limit: 1000 }).length;
    const refused = await call('DELETE', `/api/clients/${clientId}/documents/no-such-document`, {
      cookie: owner,
    });
    assert.equal(refused.status, 404);
    assert.equal(readAudit(db, { limit: 1000 }).length, before);
  });

  test('an existing v4 database gains the table on open', () => {
    // The CREATE TABLE in schema.sql only runs against a database that has none
    // of the tables yet, so the upgrade path has to be exercised on a real file
    // or it breaks in production and nowhere else.
    const path = join(mkdtempSync(join(tmpdir(), 'client-ops-migrate-')), 'db.sqlite');
    const older = openDb(path);
    older.exec('DROP TABLE audit_log');
    older.prepare('UPDATE schema_version SET version = 4').run();
    older.close();

    const upgraded = openDb(path);
    assert.ok(
      upgraded
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_log'")
        .get(),
      'audit_log should have been created by the v5 migration',
    );
    assert.equal(
      (upgraded.prepare('SELECT version FROM schema_version').get() as { version: number }).version,
      SCHEMA_VERSION,
    );
    // And it must be usable, not just present.
    recordAudit(upgraded, { userId: null, name: 'Script', email: '' }, { action: 'client.delete' });
    assert.equal(readAudit(upgraded, { limit: 5 }).length, 1);
    upgraded.close();
  });

  test('the log is readable oldest-last and filterable by prefix', async () => {
    const team = readAudit(db, { action: 'team.*', limit: 50 });
    assert.ok(team.length >= 4);
    assert.ok(team.every((r) => r.action.startsWith('team.')));
    // Newest first.
    assert.ok(team[0].at >= team[team.length - 1].at);
  });
});
