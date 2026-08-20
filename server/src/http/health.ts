import { accessSync, constants, mkdirSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { envNumber } from '../config';
import type { Db } from '../db/index';
import { UPLOAD_DIR } from '../routes/uploads';

/**
 * Liveness and readiness, which are different questions.
 *
 * The old `/api/health` always answered `{"ok":true}` as long as the process
 * was running. That is a liveness probe wearing a readiness probe's name, and
 * the gap between them is where the outages live: a database file gone
 * read-only, a full disk, an uploads directory that vanished with the container
 * it was mounted from. Every one of those leaves a process that answers
 * instantly and cannot serve a single request — so a load balancer keeps
 * sending traffic, and a deploy that broke the volume looks healthy.
 *
 *   /api/health/live   is this process alive? Restart it if not.
 *   /api/health/ready  can it actually serve? Take it out of rotation if not.
 *   /api/health        kept, and now equals readiness.
 */

/** Free space below which writes are about to start failing. */
const MIN_FREE_BYTES = envNumber('MIN_FREE_DISK_BYTES', 64 * 1024 * 1024, { min: 0 });

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

function checkDatabaseReadable(db: Db): Check {
  try {
    // Touch a real table, not `SELECT 1`: an open handle to a corrupt or
    // truncated file will answer a constant expression perfectly happily.
    db.prepare('SELECT COUNT(*) AS n FROM users').get();
    return { name: 'database:read', ok: true };
  } catch (err) {
    return { name: 'database:read', ok: false, detail: message(err) };
  }
}

function checkDatabaseWritable(db: Db): Check {
  try {
    // A transaction that always rolls back: proves the file and its WAL can be
    // written without leaving anything behind.
    db.exec('BEGIN IMMEDIATE');
    db.exec('ROLLBACK');
    return { name: 'database:write', ok: true };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* nothing was open */
    }
    return { name: 'database:write', ok: false, detail: message(err) };
  }
}

function checkUploadsWritable(): Check {
  const probe = join(UPLOAD_DIR, '.readiness');
  try {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    accessSync(UPLOAD_DIR, constants.W_OK);
    // Actually write: a directory can be reported writable and still be on a
    // full or read-only filesystem.
    writeFileSync(probe, 'ok');
    unlinkSync(probe);
    return { name: 'uploads:write', ok: true };
  } catch (err) {
    return { name: 'uploads:write', ok: false, detail: message(err) };
  }
}

function checkDiskSpace(): Check {
  try {
    const stats = statfsSync(UPLOAD_DIR);
    const free = stats.bavail * stats.bsize;
    return {
      name: 'disk:free',
      ok: free >= MIN_FREE_BYTES,
      detail: `${Math.round(free / 1024 / 1024)} MB free`,
    };
  } catch (err) {
    // Not every filesystem reports this; not knowing is not a failure.
    return { name: 'disk:free', ok: true, detail: `unavailable (${message(err)})` };
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function runReadinessChecks(db: Db): { ready: boolean; checks: Check[] } {
  const checks = [
    checkDatabaseReadable(db),
    checkDatabaseWritable(db),
    checkUploadsWritable(),
    checkDiskSpace(),
  ];
  return { ready: checks.every((c) => c.ok), checks };
}

export function healthRoutes(db: Db): Router {
  const router = Router();

  // Liveness: deliberately checks nothing. If this cannot answer, the process
  // is wedged and the only useful response is a restart — which is exactly what
  // an orchestrator does with a failed liveness probe, and exactly the wrong
  // response to a database that has gone read-only.
  router.get('/live', (_req, res) => {
    res.json({ ok: true, uptimeSeconds: Math.round(process.uptime()) });
  });

  router.get('/ready', (_req, res) => {
    const { ready, checks } = runReadinessChecks(db);
    res.status(ready ? 200 : 503).json({ ok: ready, checks });
  });

  // The original path, now meaning readiness — anything already pointed at it
  // was asking "can this serve traffic", and now gets a truthful answer.
  router.get('/', (_req, res) => {
    const { ready, checks } = runReadinessChecks(db);
    res.status(ready ? 200 : 503).json({ ok: ready, checks });
  });

  return router;
}
