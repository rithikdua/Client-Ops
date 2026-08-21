/**
 * One maintenance pass: backup, verify, prune, sweep orphaned uploads, forget
 * spent idempotency keys.
 *
 *   npm run maintenance
 *
 * The server runs this on a timer already. This exists for deployments that
 * would rather drive it from cron — set MAINTENANCE=off and schedule this.
 */
import { openDb } from '../src/db/index';
import { runMaintenance } from '../src/ops/scheduler';

const db = openDb();
await runMaintenance(db);
db.close();
