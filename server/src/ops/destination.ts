import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { envFlag, envNumber, envString } from '../config';
import { DB_PATH } from '../db/index';

/**
 * Where a backup goes once it has been written.
 *
 * `VACUUM INTO` produces a consistent snapshot, which solves half the problem
 * and leaves the more important half untouched: it writes next to the database.
 * The copy you would restore from lives on the disk it exists to protect
 * against. One failed volume, one recycled container, one `rm -rf` of the data
 * directory, and both the workspace and every backup of it go together.
 *
 * A destination is deliberately small — send, list, fetch, prune — because that
 * is all a backup needs, and because the interface is the point: this ships with
 * a filesystem backend that covers the cases available without credentials (a
 * mounted volume, an NFS share, a second disk), and object storage slots in
 * behind the same four methods.
 */

export interface StoredBackup {
  name: string;
  bytes: number;
}

export interface BackupDestination {
  /** For logs and the health endpoint: says where things are going. */
  readonly describe: string;
  /** True when nothing is configured, so callers can say so loudly. */
  readonly isLocalOnly: boolean;
  send(localPath: string, name: string, sha256: string): Promise<void>;
  list(): Promise<StoredBackup[]>;
  /** Brings one back, for `npm run restore --from-destination`. */
  fetch(name: string, toPath: string): Promise<void>;
  prune(keep: number): Promise<string[]>;
}

const sha256Of = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/**
 * The default: backups stay on the machine.
 *
 * Not an error — a laptop or a demo does not need off-host copies, and failing
 * to start over it would be obnoxious. It reports itself so the maintenance log
 * and the readiness check can say what is and is not protected.
 */
class LocalOnly implements BackupDestination {
  readonly describe = 'local disk only (set BACKUP_DEST to copy them off the machine)';
  readonly isLocalOnly = true;
  async send(): Promise<void> {}
  async list(): Promise<StoredBackup[]> {
    return [];
  }
  async fetch(): Promise<void> {
    throw new Error('No backup destination is configured.');
  }
  async prune(): Promise<string[]> {
    return [];
  }
}

/**
 * Copies to a directory somewhere else — a mounted volume, an NFS share, a
 * second physical disk.
 *
 * Two things make this a backup rather than a second copy of the same risk.
 *
 * It refuses a directory on the same filesystem as the database. That check is
 * the whole point of the finding: a "remote" path that turns out to be a
 * subdirectory of the data volume is worse than no backup, because it looks
 * like one.
 *
 * It is a guard against a mistake rather than a law, so it can be overridden:
 * a bind-mounted host volume inside a container can report the same device id
 * as the container's own filesystem, and that setup is fine. Someone who knows
 * that can say so with `BACKUP_DEST_ALLOW_SAME_DEVICE=1`, which is a deliberate
 * assertion rather than a default nobody notices.
 *
 * And it verifies. The file is copied under a temporary name, re-hashed where
 * it landed, and only then renamed into place — so a half-written copy is never
 * mistaken for a good one, and silent corruption in transit is caught now
 * rather than during a restore.
 */
class DirectoryDestination implements BackupDestination {
  readonly isLocalOnly = false;
  readonly describe: string;

  constructor(private readonly dir: string) {
    this.describe = dir;
  }

  private ensure(): void {
    mkdirSync(this.dir, { recursive: true });
    const here = statSync(dirname(DB_PATH)).dev;
    const there = statSync(this.dir).dev;
    if (here === there && !envFlag('BACKUP_DEST_ALLOW_SAME_DEVICE')) {
      throw new Error(
        `BACKUP_DEST (${this.dir}) is on the same filesystem as the database. ` +
          'That is a second copy, not a backup — point it at another volume, ' +
          'unset it to keep backups local deliberately, or set ' +
          'BACKUP_DEST_ALLOW_SAME_DEVICE=1 if the device really is elsewhere ' +
          '(a bind mount can report the same id as its host).',
      );
    }
  }

  async send(localPath: string, name: string, sha256: string): Promise<void> {
    this.ensure();
    const staged = join(this.dir, `${name}.part`);
    const target = join(this.dir, name);
    try {
      copyFileSync(localPath, staged);
      const landed = sha256Of(staged);
      if (landed !== sha256) {
        throw new Error(
          `Backup arrived at ${this.dir} corrupted (expected ${sha256.slice(0, 12)}…, ` +
            `got ${landed.slice(0, 12)}…).`,
        );
      }
      renameSync(staged, target);
    } catch (err) {
      try {
        if (existsSync(staged)) rmSync(staged);
      } catch {
        /* nothing to undo */
      }
      throw err;
    }
  }

  async list(): Promise<StoredBackup[]> {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((name) => name.endsWith('.sqlite'))
      .sort()
      .map((name) => ({ name, bytes: statSync(join(this.dir, name)).size }));
  }

  async fetch(name: string, toPath: string): Promise<void> {
    const source = join(this.dir, name);
    if (!existsSync(source)) throw new Error(`${name} is not in ${this.dir}.`);
    copyFileSync(source, toPath);
  }

  async prune(keep: number): Promise<string[]> {
    const all = await this.list();
    // Names sort chronologically, so the tail is the newest.
    const doomed = all.slice(0, Math.max(0, all.length - keep));
    for (const file of doomed) rmSync(join(this.dir, file.name));
    return doomed.map((f) => f.name);
  }
}

/**
 * Reads `BACKUP_DEST`.
 *
 * Empty means local only. A path means a directory. A URL scheme is recognised
 * and refused by name rather than being quietly treated as a relative path,
 * because `BACKUP_DEST=s3://bucket` silently creating `./s3:/bucket` is exactly
 * the sort of thing nobody notices until a restore.
 */
export function backupDestination(value = envString('BACKUP_DEST', '')): BackupDestination {
  const dest = value.trim();
  if (!dest) return new LocalOnly();

  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(dest)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'file') {
    throw new Error(
      `BACKUP_DEST scheme "${scheme}://" is not supported yet. ` +
        'Supported: an absolute path, or file:///path. Object storage plugs in ' +
        'behind BackupDestination in server/src/ops/destination.ts.',
    );
  }
  return new DirectoryDestination(scheme === 'file' ? dest.slice('file://'.length) : dest);
}

/** How many copies to keep at the destination — usually more than locally. */
export const DEST_KEEP = envNumber('BACKUP_DEST_KEEP', 30, { min: 1, max: 3650 });
