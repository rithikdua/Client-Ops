import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { DB_PATH } from '../db/index';

/**
 * This app is single-instance by design, and now says so out loud.
 *
 * Three things here are per-process, and none of them coordinate: a SQLite file
 * on local disk, uploads on local disk, and rate-limit counters in memory. Run
 * two copies behind a load balancer and you get two databases, attachments that
 * exist on whichever machine received them, and a login throttle that allows N
 * times as many attempts as it claims. None of that fails loudly — it just
 * quietly stops being true.
 *
 * A lock file cannot prevent a second instance on another machine, which is
 * exactly the deployment that would break. What it can do is catch the common
 * case — two processes on one host sharing a data directory — and say plainly
 * what the constraint is, so nobody has to infer it from the source.
 */

const LOCK_PATH = join(dirname(DB_PATH), 'instance.lock');

interface Lock {
  pid: number;
  host: string;
  startedAt: string;
}

function readLock(): Lock | null {
  try {
    return JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as Lock;
  } catch {
    return null;
  }
}

/** Whether a pid is a live process on *this* machine. */
function isRunning(pid: number): boolean {
  try {
    // Signal 0 checks for existence without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists and belongs to someone else.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Claims the data directory. Warns rather than exits: a stale lock from a
 * container that was killed must not stop the replacement from starting, and
 * refusing to boot is a worse failure than a loud warning.
 */
export function claimInstance(): () => void {
  try {
    mkdirSync(dirname(LOCK_PATH), { recursive: true });
    const existing = readLock();

    if (existing && existing.host === hostname() && isRunning(existing.pid)) {
      console.warn(
        `[client-ops] WARNING: another instance appears to be running on this host ` +
          `(pid ${existing.pid}, started ${existing.startedAt}) against the same data directory.\n` +
          `[client-ops] This app is single-instance: SQLite, local uploads and in-memory rate ` +
          `limits are not shared between processes. Expect inconsistent throttling and, on ` +
          `separate hosts, separate databases. See "Deployment" in the README.`,
      );
    }

    const mine: Lock = { pid: process.pid, host: hostname(), startedAt: new Date().toISOString() };
    writeFileSync(LOCK_PATH, JSON.stringify(mine, null, 2));
  } catch (err) {
    // Never let bookkeeping stop the server from starting.
    console.warn(
      '[client-ops] could not write the instance lock:',
      err instanceof Error ? err.message : err,
    );
    return () => {};
  }

  const release = () => {
    const current = readLock();
    // Only clear our own: a lock rewritten by a newer process is not ours.
    if (current?.pid === process.pid) rmSync(LOCK_PATH, { force: true });
  };
  return release;
}

export const INSTANCE_LOCK_PATH = LOCK_PATH;
export const instanceLockExists = () => existsSync(LOCK_PATH);
