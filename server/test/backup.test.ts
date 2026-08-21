import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

const ROOT = mkdtempSync(join(tmpdir(), 'client-ops-backup-'));
process.env.SESSION_SECRET = 'test-secret';
process.env.DATABASE_PATH = join(ROOT, 'client-ops.db');
process.env.BACKUP_DIR = join(ROOT, 'backups');
process.env.UPLOAD_DIR = join(ROOT, 'uploads');
process.env.BACKUP_KEEP = '3';

const { openDb } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');
const { backupDatabase, verifyBackup, latestBackup, prune, BACKUP_DIR } = await import(
  '../src/ops/backup'
);

const db = openDb();
seedDemoWorkspace(db, { password: 'demo-pass-2026!' });

after(() => {
  db.close();
  rmSync(ROOT, { recursive: true, force: true });
});

const backupFiles = () => readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.sqlite')).sort();

describe('M-10 the workspace can actually be restored, not just copied', () => {
  test('a backup is a consistent database, taken while the server is live', () => {
    const result = backupDatabase(db, new Date('2026-08-20T09:00:00Z'));
    assert.ok(result.bytes > 0);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);

    const check = verifyBackup(result.path);
    assert.equal(check.ok, true, check.detail);
    // Not just openable — it has the data in it.
    assert.match(check.detail, /users=4/);
    assert.match(check.detail, /clients=6/);
  });

  test('a backup taken during a write does not lose the write', () => {
    // The reason for VACUUM INTO rather than copying the file: in WAL mode the
    // most recent transactions live in a sidecar, and a byte copy misses them.
    db.prepare(
      `INSERT INTO clients (id, name, health, stage, billing_cycle, start_date, created_at)
       VALUES ('backup-probe', 'Written Just Now', 'Active', 'Live', 'Monthly', '2026-08-20', '2026-08-20T09:00:00Z')`,
    ).run();

    const result = backupDatabase(db, new Date('2026-08-20T10:00:00Z'));
    const restored = openDb(result.path);
    const found = restored
      .prepare("SELECT name FROM clients WHERE id = 'backup-probe'")
      .get() as { name: string } | undefined;
    restored.close();
    assert.equal(found?.name, 'Written Just Now');
  });

  test('a corrupt backup is reported unusable rather than trusted', () => {
    const bogus = join(BACKUP_DIR, 'client-ops-2026-01-01T00-00-00Z.sqlite');
    writeFileSync(bogus, 'this is not a database');
    const check = verifyBackup(bogus);
    assert.equal(check.ok, false);
    assert.ok(check.detail.length > 0, 'it says what is wrong');
    rmSync(bogus);
  });

  test('an empty-but-valid file is not mistaken for a good backup', () => {
    // Structurally fine, no data: exactly what a backup of the wrong path looks
    // like, and the reason verification counts rows.
    const empty = join(ROOT, 'empty.sqlite');
    const fresh = openDb(empty);
    fresh.close();
    const check = verifyBackup(empty);
    assert.equal(check.ok, true, 'it opens');
    assert.match(check.detail, /users=0/, 'but the counts show it holds nothing');
  });

  test('retention keeps the newest and removes the rest', () => {
    for (const hour of [11, 12, 13, 14, 15]) {
      backupDatabase(db, new Date(`2026-08-20T${hour}:00:00Z`));
    }
    const kept = backupFiles();
    assert.equal(kept.length, 3, 'BACKUP_KEEP=3');
    // The ones kept are the newest, and the name sorts chronologically.
    assert.deepEqual(kept, kept.slice().sort());
    assert.match(kept[kept.length - 1], /T15-00-00Z/);
    assert.equal(latestBackup(), join(BACKUP_DIR, kept[kept.length - 1]));
  });

  test('pruning never removes everything', () => {
    prune(1);
    assert.equal(backupFiles().length, 1, 'the newest survives');
  });

  test('a restored backup is a working workspace, with the money intact', () => {
    const source = latestBackup()!;
    const target = join(ROOT, 'restored.db');
    rmSync(target, { force: true });
    // What the restore script does, minus the prompts.
    copyFileSync(source, target);

    const restored = openDb(target);
    const owner = restored.prepare("SELECT id FROM users WHERE email = 'priya@phot.ai'").get() as
      | { id: string }
      | undefined;
    const payments = restored.prepare('SELECT COUNT(*) AS n FROM payments').get() as { n: number };
    const total = restored
      .prepare('SELECT COALESCE(SUM(bank_amount_minor), 0) AS n FROM payments')
      .get() as { n: number };
    restored.close();

    assert.ok(owner, 'the accounts came back');
    assert.ok(payments.n > 0, 'the payments came back');
    assert.ok(total.n > 0, 'and their amounts, in minor units');
  });
});
