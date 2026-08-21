import { envFlag, envNumber } from '../config';
import type { Db } from '../db/index';
import { collectIdempotencyKeys } from '../http/idempotency';
import { collectOrphanUploads } from '../routes/uploads';
import { backupDatabase, latestBackup, verifyBackup } from './backup';

/**
 * The maintenance nobody remembers to run.
 *
 * Everything here already existed as something you *could* invoke: a backup you
 * could take, an orphan sweep you could run. In practice that means it happens
 * once, during setup, and never again — the review's point about `uploads:gc`
 * existing but not being scheduled, and about a single-file database with no
 * backup process.
 *
 * Running it in-process is a deliberate trade. A separate cron job is the
 * conventional answer, but it needs a scheduler this deployment may not have,
 * and it is one more thing to forget. This runs wherever the server runs, and
 * for a single-instance deployment — which this is, by design — nothing
 * coordinates with anything else.
 *
 * On a deployment that *does* have cron, set MAINTENANCE=off and run the two
 * npm scripts instead. Both paths call the same functions.
 */

const HOUR_MS = 60 * 60 * 1000;

export interface MaintenanceOptions {
  backupEveryHours: number;
  gcEveryHours: number;
  /** Files younger than this are never swept: a form may still be open. */
  orphanGraceHours: number;
}

export function maintenanceOptions(): MaintenanceOptions {
  return {
    backupEveryHours: envNumber('BACKUP_EVERY_HOURS', 24, { min: 1, max: 24 * 30 }),
    gcEveryHours: envNumber('UPLOAD_GC_EVERY_HOURS', 24, { min: 1, max: 24 * 30 }),
    orphanGraceHours: envNumber('UPLOAD_GC_GRACE_HOURS', 24, { min: 1, max: 24 * 90 }),
  };
}

/** One maintenance pass. Exported so the CLI and the tests run the same thing. */
export async function runMaintenance(db: Db, options = maintenanceOptions()): Promise<void> {
  try {
    const result = await backupDatabase(db);
    const check = verifyBackup(result.path);
    // Verifying every time is the point: a backup nobody has opened is a
    // hypothesis, and the day you need it is the worst time to test it.
    if (check.ok) {
      console.log(
        `[client-ops] backup ${result.path} (${Math.round(result.bytes / 1024)} KB, ${check.detail})` +
          (result.removed.length ? `, pruned ${result.removed.length}` : ''),
      );
    } else {
      console.error(`[client-ops] BACKUP IS NOT USABLE: ${result.path} — ${check.detail}`);
    }

    // Said every time, either way. A backup that never left the machine is the
    // failure this exists to prevent, and it is silent unless something says so.
    const dest = result.destination;
    if (dest.error) {
      console.error(`[client-ops] BACKUP DID NOT REACH ${dest.describe}: ${dest.error}`);
    } else if (dest.sent) {
      console.log(
        `[client-ops] copied off-host to ${dest.describe}` +
          (dest.removed.length ? `, pruned ${dest.removed.length} there` : ''),
      );
    }
  } catch (err) {
    console.error('[client-ops] backup failed:', err instanceof Error ? err.message : err);
  }

  try {
    const { removed, bytes } = collectOrphanUploads(db, options.orphanGraceHours);
    if (removed > 0) {
      console.log(`[client-ops] swept ${removed} orphaned upload(s), ${Math.round(bytes / 1024)} KB`);
    }
  } catch (err) {
    console.error('[client-ops] upload sweep failed:', err instanceof Error ? err.message : err);
  }

  try {
    const forgotten = collectIdempotencyKeys(db);
    if (forgotten > 0) console.log(`[client-ops] forgot ${forgotten} spent idempotency key(s)`);
  } catch (err) {
    console.error('[client-ops] key cleanup failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Starts the timers. Returns a stop function; the timers are unref'd so they
 * never hold the process open by themselves.
 */
export function startMaintenance(db: Db): () => void {
  // Explicitly opt out where a real scheduler is running the npm scripts.
  if (process.env.MAINTENANCE?.trim().toLowerCase() === 'off') {
    console.log('[client-ops] in-process maintenance disabled (MAINTENANCE=off)');
    return () => {};
  }
  if (envFlag('SEED_DEMO_DATA')) {
    // A demo workspace is not worth backing up every day.
    return () => {};
  }

  const options = maintenanceOptions();
  const timers: NodeJS.Timeout[] = [];

  // A backup on start, so a deployment that is restarted daily still has one,
  // and so a broken backup path is discovered now rather than tomorrow night.
  const first = setTimeout(() => runMaintenance(db, options), 5_000);
  timers.push(first);

  const interval = setInterval(
    () => runMaintenance(db, options),
    options.backupEveryHours * HOUR_MS,
  );
  timers.push(interval);

  for (const t of timers) t.unref?.();

  console.log(
    `[client-ops] maintenance every ${options.backupEveryHours}h ` +
      `(backup + upload sweep); last backup: ${latestBackup() ?? 'none yet'}`,
  );

  return () => timers.forEach((t) => clearTimeout(t as unknown as NodeJS.Timeout));
}
