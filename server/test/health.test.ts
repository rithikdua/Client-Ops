import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.SESSION_SECRET = 'test-secret';
const UPLOADS = mkdtempSync(join(tmpdir(), 'client-ops-health-'));
process.env.UPLOAD_DIR = UPLOADS;

const { createApp } = await import('../src/app');
const { openDb } = await import('../src/db/index');
const { runReadinessChecks } = await import('../src/http/health');

const db = openDb(':memory:');
const server = createApp(db).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const get = async (path: string) => {
  const response = await fetch(base + path);
  return { status: response.status, body: (await response.json()) as any };
};

after(() => {
  server.close();
  db.close();
  rmSync(UPLOADS, { recursive: true, force: true });
});

before(() => {
  // Some environments run tests as root, where a read-only directory is still
  // writable and the "unwritable uploads" case cannot be simulated.
  /* no setup needed */
});

describe('M-08 readiness answers whether it can serve, not whether it is running', () => {
  test('liveness is separate and checks nothing', async () => {
    const res = await get('/api/health/live');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.uptimeSeconds, 'number');
    // Deliberately no checks: a failed liveness probe means "restart me", which
    // is the wrong answer to a read-only database.
    assert.equal(res.body.checks, undefined);
  });

  test('readiness names what it verified', async () => {
    const res = await get('/api/health/ready');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    const names = res.body.checks.map((c: any) => c.name).sort();
    assert.deepEqual(names, ['database:read', 'database:write', 'disk:free', 'uploads:write']);
  });

  test('the original path now tells the truth instead of always ok', async () => {
    const res = await get('/api/health');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.checks), 'it reports what it checked');
  });

  test('a database that cannot be read makes it unready, with a 503', async () => {
    // A live process whose database becomes unusable underneath it — the file
    // pulled out from under a running container, or a handle that has gone bad.
    // Wired up healthy first, exactly as it would have started.
    const broken = openDb(':memory:');
    const listener = createApp(broken).listen(0);
    broken.close();
    const brokenBase = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
    const response = await fetch(`${brokenBase}/api/health/ready`);
    const body = (await response.json()) as any;

    assert.equal(response.status, 503, 'a load balancer has to be told to stop sending traffic');
    assert.equal(body.ok, false);
    const failed = body.checks.find((c: any) => c.name === 'database:read');
    assert.equal(failed.ok, false);
    assert.ok(failed.detail, 'the reason is reported, not just the failure');

    // Liveness still passes: restarting would not fix this.
    assert.equal((await fetch(`${brokenBase}/api/health/live`)).status, 200);
    listener.close();
  });

  test('a missing uploads directory is caught, and recreated when it can be', () => {
    rmSync(UPLOADS, { recursive: true, force: true });
    const { ready, checks } = runReadinessChecks(db);
    // The check creates it back, which is the correct outcome for a directory
    // that simply is not there yet.
    assert.equal(
      checks.find((c) => c.name === 'uploads:write')?.ok,
      true,
      'a missing directory is created rather than reported broken',
    );
    assert.equal(ready, true);
  });

  test('an uploads directory that cannot be written is reported unready', (t) => {
    if (process.getuid?.() === 0) {
      t.skip('running as root, where permissions do not restrict writes');
      return;
    }
    chmodSync(UPLOADS, 0o500);
    try {
      const { ready, checks } = runReadinessChecks(db);
      assert.equal(checks.find((c) => c.name === 'uploads:write')?.ok, false);
      assert.equal(ready, false);
    } finally {
      chmodSync(UPLOADS, 0o700);
    }
  });

  test('disk space is reported and does not fail the check when unmeasurable', () => {
    const disk = runReadinessChecks(db).checks.find((c) => c.name === 'disk:free');
    assert.ok(disk);
    assert.match(disk.detail ?? '', /MB free|unavailable/);
  });
});
