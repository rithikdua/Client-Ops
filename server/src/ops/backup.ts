import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { envNumber, envString } from '../config';
import { DB_PATH, type Db } from '../db/index';

/**
 * Backups of the one file that holds everything.
 *
 * SQLite's convenience is that the whole workspace — clients, invoices,
 * payments, the audit trail — is a single file. That is also the risk: one bad
 * disk, one careless `rm`, one container recycled with its volume, and there is
 * nothing to go back to. "The file exists" is not a backup strategy.
 *
 * Copying the file with `cp` is not either. SQLite in WAL mode keeps recent
 * writes in a sidecar, so a byte copy taken mid-write yields a database missing
 * its most recent transactions, or an unopenable one. `VACUUM INTO` asks SQLite
 * itself for a consistent, fully-checkpointed snapshot while the server keeps
 * serving.
 */

export const BACKUP_DIR = envString('BACKUP_DIR', join(DB_PATH, '..', 'backups'));

/** How many to keep. Older ones are removed after each successful backup. */
export const BACKUP_KEEP = envNumber('BACKUP_KEEP', 14, { min: 1, max: 3650 });

export interface BackupResult {
  path: string;
  bytes: number;
  sha256: string;
  removed: string[];
}

/** `client-ops-2026-08-20T08-30-00Z.sqlite` — sorts chronologically as text. */
function backupName(at: Date): string {
  return `client-ops-${at.toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z')}.sqlite`;
}

/** Digest of the snapshot, so a transfer to off-host storage can be checked. */
function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Writes a consistent snapshot and prunes old ones. Safe to run against a live
 * database — that is the entire point of doing it this way.
 */
export function backupDatabase(db: Db, at: Date = new Date()): BackupResult {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const target = join(BACKUP_DIR, backupName(at));
  if (existsSync(target)) rmSync(target);

  // VACUUM INTO does not accept a bound parameter, and the path comes from
  // configuration rather than a request, but quote it properly anyway.
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  const result: BackupResult = {
    path: target,
    bytes: statSync(target).size,
    sha256: sha256(target),
    removed: prune(),
  };
  return result;
}

/** Removes all but the newest BACKUP_KEEP snapshots. */
export function prune(keep: number = BACKUP_KEEP): string[] {
  if (!existsSync(BACKUP_DIR)) return [];
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('client-ops-') && f.endsWith('.sqlite'))
    .sort()
    .reverse();
  const removed: string[] = [];
  for (const stale of files.slice(keep)) {
    rmSync(join(BACKUP_DIR, stale), { force: true });
    removed.push(stale);
  }
  return removed;
}

/**
 * Opens a backup and checks it is a usable database with the tables that matter
 * still in it.
 *
 * A backup nobody has restored is a hypothesis. This is what makes it a fact,
 * and it runs after every scheduled backup rather than on the day it is needed.
 */
export function verifyBackup(path: string): { ok: boolean; detail: string } {
  let db: Database.Database | null = null;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') return { ok: false, detail: `integrity_check: ${integrity}` };

    // Row counts, so a structurally valid but empty file is not mistaken for a
    // good backup of a workspace that has data in it.
    const counts = ['users', 'clients', 'invoices', 'payments', 'audit_log'].map((table) => {
      const row = db!.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      return `${table}=${row.n}`;
    });
    return { ok: true, detail: counts.join(' ') };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    db?.close();
  }
}

/** The newest backup on disk, or null. */
export function latestBackup(): string | null {
  if (!existsSync(BACKUP_DIR)) return null;
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('client-ops-') && f.endsWith('.sqlite'))
    .sort();
  const newest = files[files.length - 1];
  return newest ? join(BACKUP_DIR, newest) : null;
}
