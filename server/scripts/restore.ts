/**
 * Puts a backup back.
 *
 *   npm run restore -- <backup-file>
 *   npm run restore -- --latest
 *   npm run restore -- --list-remote          # what is at BACKUP_DEST
 *   npm run restore -- --remote <name>        # fetch it from there and restore
 *
 * The half of a backup strategy that usually does not exist until the day it is
 * needed, which is the worst possible day to write it.
 *
 * Refuses to run against a live server, verifies the backup *before* touching
 * anything, and moves the current database aside rather than deleting it — a
 * restore of the wrong file should not be the second disaster of the day.
 */
import { copyFileSync, existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DB_PATH, openDb } from '../src/db/index';
import { latestBackup, verifyBackup } from '../src/ops/backup';
import { backupDestination } from '../src/ops/destination';

const args = process.argv.slice(2).filter((a) => a !== '--yes');
const assumeYes = process.argv.includes('--yes');

// The case this exists for: the machine is gone and the only copy is elsewhere.
if (args.includes('--list-remote')) {
  const dest = backupDestination();
  const stored = await dest.list();
  if (stored.length === 0) {
    console.log(`[client-ops] nothing at ${dest.describe}`);
  } else {
    console.log(`[client-ops] at ${dest.describe}:`);
    for (const file of stored) {
      console.log(`  ${file.name}  ${Math.round(file.bytes / 1024)} KB`);
    }
  }
  process.exit(0);
}

let source = args.includes('--latest') ? latestBackup() : args[0];

const remoteAt = args.indexOf('--remote');
if (remoteAt !== -1) {
  const name = args[remoteAt + 1];
  if (!name) {
    console.error('Usage: npm run restore -- --remote <name>   (see --list-remote)');
    process.exit(1);
  }
  const dest = backupDestination();
  // Into a temporary file first: it still has to pass verification before
  // anything on this machine is touched.
  source = join(mkdtempSync(join(tmpdir(), 'client-ops-restore-')), basename(name));
  await dest.fetch(name, source);
  console.log(`[client-ops] fetched ${name} from ${dest.describe}`);
}

if (!source) {
  console.error('Usage: npm run restore -- <backup-file>   (or --latest)');
  process.exit(1);
}
if (!existsSync(source)) {
  console.error(`[client-ops] no such backup: ${source}`);
  process.exit(1);
}

// Check it before anything is moved: restoring a corrupt file over a working
// database turns a recoverable problem into an unrecoverable one.
const check = verifyBackup(source);
if (!check.ok) {
  console.error(`[client-ops] refusing to restore an unusable backup: ${check.detail}`);
  process.exit(1);
}

console.log(`[client-ops] restoring ${basename(source)}`);
console.log(`[client-ops] contents:  ${check.detail}`);
console.log(`[client-ops] target:    ${DB_PATH}`);

if (existsSync(DB_PATH) && !assumeYes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    'This replaces the current database. The current one is kept as .superseded. Continue? [y/N] ',
  );
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('[client-ops] nothing was changed.');
    process.exit(0);
  }
}

// Stop early if something still holds the database: a restore under a running
// server produces a process serving a file that no longer exists.
//
// Only when there is something to hold. openDb() creates the file if it is
// missing, so probing unconditionally would conjure an empty database and then
// carefully preserve it as "the previous one".
if (existsSync(DB_PATH)) {
  try {
    const probe = openDb(DB_PATH);
    probe.exec('BEGIN IMMEDIATE');
    probe.exec('ROLLBACK');
    probe.close();
  } catch (err) {
    console.error(
      '[client-ops] the database is in use — stop the server first.',
      err instanceof Error ? `(${err.message})` : '',
    );
    process.exit(1);
  }
}

const superseded = `${DB_PATH}.superseded`;
if (existsSync(DB_PATH)) {
  rmSync(superseded, { force: true });
  renameSync(DB_PATH, superseded);
}
// The WAL and shm belong to the database being replaced, not to the backup.
for (const sidecar of ['-wal', '-shm']) {
  rmSync(`${DB_PATH}${sidecar}`, { force: true });
}

copyFileSync(source, DB_PATH);

// Open it through the normal path, so any pending migration runs now rather
// than on the next boot, and a failure surfaces while the old file is still
// sitting next to it.
const restored = openDb(DB_PATH);
const users = restored.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
const clients = restored.prepare('SELECT COUNT(*) AS n FROM clients').get() as { n: number };
restored.close();

console.log(`[client-ops] restored: ${users.n} account(s), ${clients.n} client(s).`);
if (existsSync(superseded)) {
  console.log(`[client-ops] the previous database is at ${superseded}`);
}
console.log('[client-ops] uploaded files are not part of the database — restore those separately.');
