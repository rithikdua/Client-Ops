import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

const workspace = mkdtempSync(join(tmpdir(), 'client-ops-dest-'));
process.env.SESSION_SECRET = 'test-secret';
process.env.DATABASE_PATH = join(workspace, 'client-ops.db');
process.env.BACKUP_DIR = join(workspace, 'backups');
process.env.UPLOAD_DIR = join(workspace, 'uploads');

const { openDb } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');
const { backupDatabase, verifyBackup } = await import('../src/ops/backup');
const { backupDestination } = await import('../src/ops/destination');

/**
 * A sandbox has one filesystem, so "another volume" cannot be created here. The
 * same-device guard is asserted on its own below; everything else opts out of
 * it the way a container with a bind mount would.
 */
const elsewhereDir = () => {
  process.env.BACKUP_DEST_ALLOW_SAME_DEVICE = '1';
  return mkdtempSync(join(tmpdir(), 'client-ops-offhost-'));
};

const db = openDb(process.env.DATABASE_PATH);
seedDemoWorkspace(db, { password: 'demo-pass-2026!' });

after(() => db.close());

describe('F-09 a backup can leave the machine', () => {
  test('with nothing configured it says so rather than pretending', async () => {
    const dest = backupDestination('');
    assert.equal(dest.isLocalOnly, true);
    assert.match(dest.describe, /BACKUP_DEST/);

    const result = await backupDatabase(db, new Date('2026-08-20T09:00:00Z'));
    assert.equal(result.destination.sent, false);
    assert.equal(result.destination.error, undefined, 'not configured is not a failure');
  });

  test('a configured directory receives the backup, verified on arrival', async () => {
    const elsewhere = elsewhereDir();
    const dest = backupDestination(elsewhere);

    const local = await backupDatabase(db, new Date('2026-08-20T10:00:00Z'));
    await dest.send(local.path, 'client-ops-2026-08-20T10-00-00Z.sqlite', local.sha256);

    const stored = await dest.list();
    assert.equal(stored.length, 1);

    // Not just present — the same bytes, and still a usable database.
    const copy = join(elsewhere, stored[0].name);
    assert.deepEqual(readFileSync(copy), readFileSync(local.path));
    assert.equal(verifyBackup(copy).ok, true);
  });

  test('a copy that arrives corrupted is refused, and leaves nothing behind', async () => {
    // The reason a digest is carried at all: silent corruption in transit is
    // otherwise found during a restore, which is the worst time to find it.
    const elsewhere = elsewhereDir();
    const dest = backupDestination(elsewhere);
    const local = await backupDatabase(db, new Date('2026-08-20T11:00:00Z'));

    await assert.rejects(
      () => dest.send(local.path, 'wrong.sqlite', 'a'.repeat(64)),
      /corrupted/,
    );
    // No `.part` file masquerading as a backup, and nothing under the real name.
    assert.deepEqual(readdirSync(elsewhere), []);
  });

  test('a half-written copy is never mistaken for a good one', async () => {
    const elsewhere = elsewhereDir();
    const dest = backupDestination(elsewhere);
    const local = await backupDatabase(db, new Date('2026-08-20T12:00:00Z'));
    await dest.send(local.path, 'client-ops-2026-08-20T12-00-00Z.sqlite', local.sha256);

    // Only files that made it all the way through the rename are listed.
    writeFileSync(join(elsewhere, 'client-ops-2026-08-20T13-00-00Z.sqlite.part'), 'half');
    const stored = await dest.list();
    assert.equal(stored.length, 1);
    assert.ok(!stored[0].name.endsWith('.part'));
  });

  test('a destination on the same filesystem as the database is refused', async () => {
    // The whole finding. A "remote" path that turns out to be a subdirectory of
    // the data volume is worse than no backup, because it looks like one.
    delete process.env.BACKUP_DEST_ALLOW_SAME_DEVICE;
    const sameDisk = join(workspace, 'not-really-elsewhere');
    const dest = backupDestination(sameDisk);
    const local = await backupDatabase(db, new Date('2026-08-20T14:00:00Z'));

    await assert.rejects(
      () => dest.send(local.path, 'x.sqlite', local.sha256),
      /same filesystem/,
    );
  });

  test('the result reports where the copy went, and whether it got there', async () => {
    delete process.env.BACKUP_DEST_ALLOW_SAME_DEVICE;
    const sameDisk = join(workspace, 'still-the-same-disk');
    process.env.BACKUP_DEST = sameDisk;
    try {
      const result = await backupDatabase(db, new Date('2026-08-20T15:00:00Z'));
      // A network or configuration problem must not discard a good local
      // snapshot — but it must not be silent either.
      assert.ok(existsSync(result.path), 'the local backup was still written');
      assert.equal(result.destination.sent, false);
      assert.match(result.destination.error ?? '', /same filesystem/);
    } finally {
      delete process.env.BACKUP_DEST;
    }
  });

  test('a scheme we cannot honour is named, not silently turned into a folder', () => {
    // `BACKUP_DEST=s3://bucket` quietly creating ./s3:/bucket is exactly the
    // sort of thing nobody notices until a restore.
    assert.throws(() => backupDestination('s3://bucket/prefix'), /not supported yet/);
    assert.throws(() => backupDestination('gs://bucket'), /not supported yet/);
    // file:// is the same thing as a path, so it is accepted.
    assert.equal(backupDestination('file:///tmp/somewhere').isLocalOnly, false);
  });

  test('old copies are pruned at the destination, newest kept', async () => {
    const elsewhere = elsewhereDir();
    const dest = backupDestination(elsewhere);
    for (const hour of ['06', '07', '08', '09']) {
      const local = await backupDatabase(db, new Date(`2026-08-21T${hour}:00:00Z`));
      await dest.send(local.path, `client-ops-2026-08-21T${hour}-00-00Z.sqlite`, local.sha256);
    }
    assert.equal((await dest.list()).length, 4);

    const removed = await dest.prune(2);
    assert.deepEqual(removed, [
      'client-ops-2026-08-21T06-00-00Z.sqlite',
      'client-ops-2026-08-21T07-00-00Z.sqlite',
    ]);
    const left = (await dest.list()).map((f) => f.name);
    assert.deepEqual(left, [
      'client-ops-2026-08-21T08-00-00Z.sqlite',
      'client-ops-2026-08-21T09-00-00Z.sqlite',
    ]);
  });

  test('a backup can be brought back from the destination', async () => {
    // The case this exists for: the machine is gone and the only copy is
    // somewhere else.
    const elsewhere = elsewhereDir();
    const dest = backupDestination(elsewhere);
    const local = await backupDatabase(db, new Date('2026-08-22T09:00:00Z'));
    const name = 'client-ops-2026-08-22T09-00-00Z.sqlite';
    await dest.send(local.path, name, local.sha256);

    const pulled = join(mkdtempSync(join(tmpdir(), 'client-ops-pull-')), name);
    await dest.fetch(name, pulled);
    const check = verifyBackup(pulled);
    assert.equal(check.ok, true, check.detail);
    assert.match(check.detail, /clients=\d+/, 'and it has the workspace in it');
  });

  test('asking for something that is not there fails clearly', async () => {
    const dest = backupDestination(elsewhereDir());
    await assert.rejects(() => dest.fetch('nope.sqlite', join(tmpdir(), 'x.sqlite')), /is not in/);
    await assert.rejects(
      () => backupDestination('').fetch('anything.sqlite', '/tmp/x.sqlite'),
      /No backup destination/,
    );
  });
});
