/**
 * Permanently removes records that were archived more than `--days` ago.
 *
 *   npm run purge-archived -- --days 90          # show what would go
 *   npm run purge-archived -- --days 90 --yes    # actually do it
 *
 * Deliberately manual. Archiving exists so that recovering from a mistake does
 * not depend on noticing it quickly, and a nightly purge would quietly put that
 * deadline back — this is the one operation in the app that genuinely destroys
 * data, so it asks.
 */
import { openDb } from '../src/db/index';
import { ARCHIVABLE, purgeArchived, type ArchivableTable } from '../src/domain/archive';

const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};

const days = Number(arg('days') ?? 90);
if (!Number.isFinite(days) || days < 0) {
  console.error('--days must be a number of days, e.g. --days 90');
  process.exit(1);
}
const confirmed = process.argv.includes('--yes');

const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
const db = openDb();

const pending = Object.keys(ARCHIVABLE).map((table) => {
  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM ${table} WHERE archived_at IS NOT NULL AND archived_at < ?`,
    )
    .get(cutoff) as { n: number };
  return [table as ArchivableTable, n] as const;
});

const total = pending.reduce((a, [, n]) => a + n, 0);
if (total === 0) {
  console.log(`[client-ops] nothing archived before ${cutoff.slice(0, 10)}.`);
  db.close();
  process.exit(0);
}

console.log(`[client-ops] archived before ${cutoff.slice(0, 10)}:`);
for (const [table, n] of pending) if (n > 0) console.log(`  ${n} ${table}`);

if (!confirmed) {
  // Counting clients separately, because deleting one takes everything under it
  // and the number above understates what actually disappears.
  const clients = pending.find(([t]) => t === 'clients')?.[1] ?? 0;
  if (clients > 0) {
    console.log(
      `\n  Note: those ${clients} client(s) take their invoices, payments, contacts,\n` +
        '  deliverables, documents, tasks and activity with them.',
    );
  }
  console.log('\nNothing was removed. Add --yes to go ahead.');
  db.close();
  process.exit(0);
}

const removed = purgeArchived(db, cutoff);
db.close();

console.log('\n[client-ops] permanently removed:');
for (const [table, n] of Object.entries(removed)) if (n > 0) console.log(`  ${n} ${table}`);
console.log('Run `npm run uploads:gc` to release any files those records held.');
