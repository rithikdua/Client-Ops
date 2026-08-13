/**
 * Prints the audit trail — deletions and account administration, newest first.
 *
 *   npm run audit                        # last 100 entries
 *   npm run audit -- --limit 500
 *   npm run audit -- --action team.*     # only team administration
 *   npm run audit -- --action auth.login_failed
 *   npm run audit -- --json              # for piping somewhere else
 *
 * Deliberately a script and not an endpoint. The trail records what
 * administrators did, so serving it to the app would mean building a screen that
 * an Owner could read — and an Owner is exactly whose actions it exists to
 * record. Reading it should require access to the machine.
 */
import { openDb } from '../src/db/index';
import { readAudit } from '../src/domain/audit';

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

const db = openDb();
const rows = readAudit(db, {
  limit: Number(arg('limit') ?? 100),
  action: arg('action'),
});
db.close();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else if (rows.length === 0) {
  console.log('[client-ops] no audit entries matched.');
} else {
  for (const row of rows.slice().reverse()) {
    const actor = row.actor_email || row.actor_name || row.actor_id || 'unknown';
    const as = row.acting_as_id ? ` (previewing as ${row.acting_as_id})` : '';
    const target = row.target_label || row.target_id;
    console.log(
      [
        row.at,
        row.action.padEnd(22),
        actor + as,
        target ? `→ ${target}` : '',
        row.detail ? `[${row.detail}]` : '',
        row.ip ? `from ${row.ip}` : '',
      ]
        .filter(Boolean)
        .join('  '),
    );
  }
  console.log(`\n[client-ops] ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}.`);
}
