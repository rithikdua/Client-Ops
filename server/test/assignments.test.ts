import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.SESSION_SECRET = 'test-secret';
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'client-ops-assign-'));

const { createApp } = await import('../src/app');
const { openDb } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');
const { resolveAssignment, linkAssignmentsByName } = await import('../src/domain/assignees');

const db = openDb(':memory:');
seedDemoWorkspace(db, { password: 'demo-pass-2026!' });
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

const clientFrom = (body: any, id = clientId) => body.clients.find((c: any) => c.id === id);
const userNamed = (name: string) =>
  db.prepare('SELECT id FROM users WHERE name = ?').get(name) as { id: string };

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

describe('F-03 an assignment points at an account', () => {
  test('every assignment carries both the account and the name', async () => {
    const client = clientFrom((await call('GET', '/api/clients')).body);
    assert.ok(client.ownerUserId, 'the account');
    assert.ok(client.owner, 'and a readable name');
    assert.equal(client.owner, (db.prepare('SELECT name FROM users WHERE id = ?').get(client.ownerUserId) as any).name);
  });

  test('assigning by account id stores the account, and its current name', async () => {
    const daniel = userNamed('Daniel Cho');
    const res = await call('PATCH', `/api/clients/${clientId}`, { ownerUserId: daniel.id });
    assert.equal(res.status, 200);
    const client = clientFrom(res.body);
    assert.equal(client.ownerUserId, daniel.id);
    assert.equal(client.owner, 'Daniel Cho', 'the name comes from the account, not the request');
  });

  test('renaming the account renames it everywhere — the point of all this', async () => {
    // There is no rename endpoint yet, so this is how a name changes today.
    // What matters is that the projection follows the account: adding the
    // endpoint later is then a Team screen change, not a data migration.
    const daniel = userNamed('Daniel Cho');
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run('Daniel Cho-Mehta', daniel.id);

    // Under the old model the client kept saying "Daniel Cho" for ever, and
    // nothing connected the two records.
    const owned = db
      .prepare('SELECT COUNT(*) AS n FROM clients WHERE owner_user_id = ?')
      .get(daniel.id) as { n: number };
    assert.ok(owned.n > 0, 'still findable by account after a rename');

    const client = clientFrom((await call('GET', '/api/clients')).body);
    assert.equal(client.owner, 'Daniel Cho-Mehta', 'and reads as their current name');

    db.prepare('UPDATE users SET name = ? WHERE id = ?').run('Daniel Cho', daniel.id);
  });

  test('an assignment with no account behind it keeps its own name', async () => {
    // Nothing to follow, so the stored text is the only answer — and stays put
    // while linked assignments track their accounts.
    const res = await call('POST', `/api/clients/${clientId}/deliverables`, {
      title: 'External review',
      dueDate: '2026-09-01',
      owner: 'Ravi Menon (agency)',
    });
    const fresh = clientFrom((await call('GET', '/api/clients')).body).deliverables.find(
      (d: any) => d.title === 'External review',
    );
    assert.equal(res.status, 201);
    assert.equal(fresh.owner, 'Ravi Menon (agency)');
    assert.equal(fresh.ownerUserId, undefined);
  });

  test('an id that does not exist is refused, not stored as a string', async () => {
    const res = await call('PATCH', `/api/clients/${clientId}`, { ownerUserId: 'no-such-user' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /no longer exists/);
  });

  test('a bare name is still accepted, and linked when it matches', async () => {
    // Scripts and the CLI do not know account ids, and must keep working —
    // producing joined-up data rather than yet more loose strings.
    const res = await call('PATCH', `/api/clients/${clientId}`, { owner: 'maya fernandes' });
    assert.equal(res.status, 200);
    const client = clientFrom(res.body);
    assert.equal(client.ownerUserId, userNamed('Maya Fernandes').id, 'matched despite the casing');
    assert.equal(client.owner, 'Maya Fernandes', 'stored with the account spelling');
  });

  test('a name that is nobody here is kept as text rather than dropped', async () => {
    // A contractor, an ex-employee, or someone who simply has no login. Losing
    // the name to tidy the column would be losing information.
    const res = await call('PATCH', `/api/clients/${clientId}`, { owner: 'Ravi Menon (agency)' });
    assert.equal(res.status, 200);
    const client = clientFrom(res.body);
    assert.equal(client.owner, 'Ravi Menon (agency)');
    assert.equal(client.ownerUserId, undefined, 'no account to point at, and that is fine');
  });

  test('removing a teammate keeps the history readable', async () => {
    const created = await call('POST', '/api/team', {
      name: 'Temporary Person',
      email: 'temporary-person@phot.ai',
      role: 'Analyst',
      permission: 'Editor',
      password: 'a-newly-chosen-1',
      access: { overview: true, clients: true },
    });
    assert.equal(created.status, 201);
    const person = created.body.team.find((t: any) => t.name === 'Temporary Person');

    const assigned = await call('POST', `/api/clients/${clientId}/tasks`, {
      title: 'Their ticket',
      status: 'New',
      priority: 'Medium',
      assigneeUserId: person.id,
    });
    assert.equal(assigned.status, 201);

    await call('DELETE', `/api/team/${person.id}`);

    const task = clientFrom((await call('GET', '/api/clients')).body).tasks.find(
      (t: any) => t.title === 'Their ticket',
    );
    // The link is gone, because the account is. The name is not, because who did
    // the work is still true.
    assert.equal(task.assigneeUserId, undefined);
    assert.equal(task.assignee, 'Temporary Person');
  });

  test('deliverables, tasks and follow-ups all work the same way', async () => {
    const tom = userNamed('Tom Whitfield');

    const deliverable = await call('POST', `/api/clients/${clientId}/deliverables`, {
      title: 'Assigned deliverable',
      dueDate: '2026-09-01',
      ownerUserId: tom.id,
    });
    assert.equal(
      clientFrom(deliverable.body).deliverables.find((d: any) => d.title === 'Assigned deliverable')
        .ownerUserId,
      tom.id,
    );

    const task = await call('POST', `/api/clients/${clientId}/tasks`, {
      title: 'Assigned task',
      status: 'New',
      priority: 'Medium',
      assigneeUserId: tom.id,
    });
    assert.equal(
      clientFrom(task.body).tasks.find((t: any) => t.title === 'Assigned task').assigneeUserId,
      tom.id,
    );

    const followUp = await call('POST', '/api/followups', {
      name: 'Someone To Call',
      dueDate: '2026-09-01',
      ownerUserId: tom.id,
    });
    assert.equal(
      followUp.body.followUps.find((f: any) => f.name === 'Someone To Call').ownerUserId,
      tom.id,
    );
  });

  test('an unassigned record is allowed, and stays unassigned', async () => {
    const res = await call('POST', `/api/clients/${clientId}/deliverables`, {
      title: 'Nobody yet',
      dueDate: '2026-09-01',
      ownerUserId: '',
      owner: '',
    });
    const created = clientFrom(res.body).deliverables.find((d: any) => d.title === 'Nobody yet');
    assert.equal(created.owner, '');
    assert.equal(created.ownerUserId, undefined);
  });
});

describe('F-03 linking existing data', () => {
  test('two accounts with the same name are left unlinked rather than guessed', () => {
    const scratch = openDb(':memory:');
    seedDemoWorkspace(scratch, { password: 'demo-pass-2026!' });
    // A second Priya joins. Which one owns the old rows is genuinely unknown.
    scratch
      .prepare(
        `INSERT INTO users (id, name, email, role, permission, password_hash, password_salt, created_at)
         VALUES ('dupe', 'Priya Shah', 'priya.shah2@phot.ai', 'Ops', 'Editor', '', '', '2026-01-01T00:00:00Z')`,
      )
      .run();
    scratch.prepare("UPDATE clients SET owner_user_id = NULL WHERE owner = 'Priya Shah'").run();

    linkAssignmentsByName(scratch);

    const stillUnlinked = scratch
      .prepare("SELECT COUNT(*) AS n FROM clients WHERE owner = 'Priya Shah' AND owner_user_id IS NULL")
      .get() as { n: number };
    assert.ok(stillUnlinked.n > 0, 'ambiguous names are not guessed at');
    scratch.close();
  });

  test('the resolver prefers the id when both are sent', () => {
    const maya = userNamed('Maya Fernandes');
    const resolved = resolveAssignment(db, { userId: maya.id, name: 'Somebody Else Entirely' });
    assert.equal(resolved.userId, maya.id);
    assert.equal(resolved.name, 'Maya Fernandes');
  });
});
