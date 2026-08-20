/**
 * Takes a verified snapshot of the database.
 *
 *   npm run backup            # snapshot, verify, prune old ones
 *   npm run backup -- --list  # what is on disk
 *
 * Safe against a running server: SQLite writes the snapshot itself rather than
 * copying bytes out from underneath it.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '../src/db/index';
import { BACKUP_DIR, BACKUP_KEEP, backupDatabase, verifyBackup } from '../src/ops/backup';

const list = process.argv.includes('--list');

if (list) {
  if (!existsSync(BACKUP_DIR)) {
    console.log(`[client-ops] no backups yet (${BACKUP_DIR})`);
    process.exit(0);
  }
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.sqlite'))
    .sort()
    .reverse();
  if (files.length === 0) console.log(`[client-ops] no backups yet (${BACKUP_DIR})`);
  for (const f of files) {
    const { size, mtime } = statSync(join(BACKUP_DIR, f));
    console.log(`${f}  ${(size / 1024).toFixed(0)} KB  ${mtime.toISOString()}`);
  }
  console.log(`\nKeeping the newest ${BACKUP_KEEP}. Restore with: npm run restore -- <file>`);
  process.exit(0);
}

const db = openDb();
const result = backupDatabase(db);
const check = verifyBackup(result.path);
db.close();

console.log(`[client-ops] wrote ${result.path}`);
console.log(`[client-ops] ${(result.bytes / 1024).toFixed(0)} KB, sha256 ${result.sha256}`);
if (result.removed.length) {
  console.log(`[client-ops] pruned ${result.removed.length} older backup(s)`);
}

// A backup that has not been opened is a hypothesis.
if (!check.ok) {
  console.error(`[client-ops] THIS BACKUP IS NOT USABLE: ${check.detail}`);
  process.exit(1);
}
console.log(`[client-ops] verified: ${check.detail}`);
console.log('[client-ops] copy it somewhere that is not this machine.');
