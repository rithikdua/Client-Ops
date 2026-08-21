import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { SectionKey } from '../../../src/data/types';
import { requireAuth, requireWrite } from '../auth/permissions';
import { envNumber, envString } from '../config';
import { newId, transact, type Db } from '../db/index';
import { ALLOWED_SUMMARY, detectType } from '../domain/fileTypes';
import { HttpError, notFound } from '../http/errors';

const MB = 1024 * 1024;

// One megabyte is the floor: a limit small enough to reject everything is a
// configuration mistake, and 0 was what a blank value used to produce.
const MAX_UPLOAD_BYTES = envNumber('MAX_UPLOAD_BYTES', 10 * MB, { min: MB });
/** Ceiling on what one account can accumulate, not just one request. */
const MAX_BYTES_PER_USER = envNumber('MAX_UPLOAD_BYTES_PER_USER', 200 * MB, { min: MB });
/** Ceiling for the whole workspace, so one team cannot fill the disk. */
const MAX_BYTES_TOTAL = envNumber('MAX_UPLOAD_BYTES_TOTAL', 2048 * MB, { min: MB });

export const UPLOAD_DIR = envString('UPLOAD_DIR', join(process.cwd(), 'server', 'data', 'uploads'));

export interface UploadRow {
  id: string;
  filename: string;
  original_name: string;
  mime: string;
  client_id: string | null;
  section: SectionKey;
}

/**
 * The first few kilobytes, which is all a format sniffer needs. Reading the
 * whole file back would put us right where memoryStorage was.
 */
function readHead(path: string, bytes = 8192): Buffer {
  const handle = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const read = readSync(handle, buffer, 0, bytes, 0);
    return buffer.subarray(0, read);
  } finally {
    closeSync(handle);
  }
}

function usedBytes(db: Db, column: 'uploaded_by' | null, value?: string): number {
  const row = column
    ? (db
        .prepare(`SELECT COALESCE(SUM(size_bytes), 0) AS n FROM uploads WHERE ${column} = ?`)
        .get(value) as { n: number })
    : (db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS n FROM uploads').get() as { n: number });
  return row.n;
}

/**
 * Sections a file can belong to. An attachment is owned by the thing it is
 * attached to — an invoice PDF belongs to Invoices — and that is what decides
 * both who may upload it and who may later download it.
 */
export const UPLOAD_SECTIONS = ['clients', 'invoices', 'deliverables', 'documents'] as const;
export type UploadSection = (typeof UPLOAD_SECTIONS)[number];

function isUploadSection(value: string): value is UploadSection {
  return (UPLOAD_SECTIONS as readonly string[]).includes(value);
}

/**
 * Authorizes an upload against the section that will own the file, before a
 * single byte of the body is read.
 *
 * Previously this route had no section check at all: `requireAuth` and
 * `requireWrite` were the only guards, so anyone who could write anything could
 * attach a file to any client id they happened to know, consuming that
 * workspace's storage quota. And every upload was recorded as `clients`
 * regardless of what it was attached to, which made the download check
 * disagree with the section that owns the record — an invoices-only teammate
 * could see an invoice and not open its own attachment.
 */
function requireUploadSection(req: Request, _res: Response, next: NextFunction): void {
  const raw = (req.params as { section?: string }).section ?? 'clients';
  if (!isUploadSection(raw)) return next(new HttpError(400, 'Unknown attachment type.'));
  if (!req.actor!.access[raw]) {
    return next(new HttpError(403, `You do not have access to ${raw}.`));
  }
  req.uploadSection = raw;
  next();
}

/**
 * How many uploads may be in flight at once.
 *
 * Even streaming to disk, every concurrent upload holds a file handle, a socket
 * and a chunk of pipeline. This bounds all of them, and answers 503 with
 * Retry-After rather than degrading everything for everyone.
 */
const MAX_CONCURRENT_UPLOADS = envNumber('MAX_CONCURRENT_UPLOADS', 4, { min: 1, max: 64 });

export function uploadRoutes(db: Db): Router {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  const incoming = join(UPLOAD_DIR, 'incoming');
  mkdirSync(incoming, { recursive: true });

  /**
   * Streamed to disk under a temporary name, not buffered in memory.
   *
   * memoryStorage held the whole file in RAM before anything was validated, so
   * the process's exposure was the size limit multiplied by however many people
   * uploaded at once — ten concurrent 10 MB uploads meant 100 MB of heap, from
   * requests that had not yet been checked for being files at all.
   *
   * Writing first and inspecting after costs a temporary file, which is deleted
   * the moment the content turns out not to be what it claims.
   */
  const upload = multer({
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    storage: multer.diskStorage({
      destination: (_req, _file, done) => done(null, incoming),
      // Never the client's filename, not even temporarily.
      filename: (_req, _file, done) => done(null, `${randomUUID()}.part`),
    }),
  });

  let inFlight = 0;
  const limitConcurrency = (_req: Request, res: Response, next: NextFunction): void => {
    if (inFlight >= MAX_CONCURRENT_UPLOADS) {
      res.setHeader('Retry-After', '5');
      return next(new HttpError(503, 'Too many uploads in progress. Try again in a moment.'));
    }
    inFlight += 1;
    res.on('finish', () => {
      inFlight -= 1;
    });
    res.on('close', () => {
      // A client that hangs up mid-upload must release its slot too, or the
      // limit leaks downward until nothing can be uploaded at all.
      if (!res.writableEnded) inFlight -= 1;
    });
    next();
  };

  const router = Router({ mergeParams: true });

  /**
   * Accepts a file for a specific client, under the section that will own it.
   * Requiring both up front is what makes the download check possible later.
   */
  const handleUpload = (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const temp = req.file?.path;
    /** The temporary file must not survive any path out of here. */
    const discard = () => {
      if (temp) {
        try {
          unlinkSync(temp);
        } catch {
          /* already gone */
        }
      }
    };

    try {
      if (!db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId)) throw notFound('Client');
      if (!req.file || !temp) throw new HttpError(400, 'No file received.');

      const size = req.file.size;
      // Only the head is read: enough to identify the format, and constant
      // memory whatever the file's size.
      const head = readHead(temp);
      // The claimed type is a hint for disambiguating ZIP-based formats, nothing more.
      const detected = detectType(head, req.file.mimetype);
      if (!detected) {
        throw new HttpError(415, `That file is not a supported type. Allowed: ${ALLOWED_SUMMARY}.`);
      }

      const perUser = usedBytes(db, 'uploaded_by', req.actor!.userId);
      if (perUser + size > MAX_BYTES_PER_USER) {
        throw new HttpError(413, 'You have reached your upload storage limit.');
      }
      const total = usedBytes(db, null);
      if (total + size > MAX_BYTES_TOTAL) {
        throw new HttpError(413, 'This workspace has reached its upload storage limit.');
      }

      // Our own name, our own extension: a filename from the client never touches
      // the filesystem. Renaming within the same directory tree is atomic.
      const filename = `${randomUUID()}${detected.extension}`;
      const target = join(UPLOAD_DIR, filename);
      renameSync(temp, target);

      storeAndRespond(req, res, { filename, target, size, mime: detected.mime });
    } catch (err) {
      discard();
      throw err;
    }
  };

  /** Records the file and answers. Any failure takes the file with it. */
  const storeAndRespond = (
    req: Request,
    res: Response,
    file: { filename: string; target: string; size: number; mime: string },
  ) => {
    const { clientId } = req.params as { clientId: string };
    const { filename, target, size, mime } = file;
    const section = req.uploadSection ?? 'clients';

    try {
      db.prepare(
        `INSERT INTO uploads (id, filename, original_name, mime, size_bytes, client_id, section, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(),
        filename,
        req.file!.originalname.slice(0, 300),
        mime,
        size,
        clientId,
        // The owning section, so the download check asks the same question the
        // record does.
        section,
        req.actor!.userId,
        new Date().toISOString(),
      );
    } catch (err) {
      // Never leave a file on disk with no record pointing at it.
      try {
        unlinkSync(target);
      } catch {
        /* the rename may not have landed; nothing to undo */
      }
      throw err;
    }

    res.status(201).json({
      url: `/api/uploads/${filename}`,
      name: req.file!.originalname,
      size,
      mime,
      section,
    });
  };

  const guards = [requireAuth, requireWrite, requireUploadSection, limitConcurrency];
  // `/uploads` keeps working and means "belongs to the client record" (a task
  // attachment); `/uploads/invoices` and friends name the owning section.
  router.post('/', guards, upload.single('file'), handleUpload);
  router.post('/:section', guards, upload.single('file'), handleUpload);

  return router;
}

/**
 * Serves an uploaded file, but only to someone allowed to see the account it
 * belongs to. A URL is not a capability: previously any signed-in user who
 * obtained a link could read another team's document.
 */
export function uploadDownloadRoutes(db: Db): Router {
  const router = Router();

  router.get('/:filename', requireAuth, (req, res) => {
    // basename() strips any traversal attempt before the value is used.
    const filename = basename(req.params.filename);
    const row = db
      .prepare(
        'SELECT id, filename, original_name, mime, client_id, section FROM uploads WHERE filename = ?',
      )
      .get(filename) as UploadRow | undefined;
    if (!row) throw notFound('File');

    if (!req.actor!.access[row.section]) {
      throw new HttpError(403, 'You do not have access to this file.');
    }

    const detected = row.mime;
    const inline = detected.startsWith('image/');
    res.setHeader('Content-Type', detected);
    // Never let a browser sniff its way to a different, executable type.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(row.original_name || filename)}"`,
    );
    res.sendFile(join(UPLOAD_DIR, row.filename));
  });

  return router;
}

/** Filenames still referenced by a task, document, invoice or deliverable. */
function referencedFilenames(db: Db): Set<string> {
  const referenced = new Set<string>();
  const add = (value: string | null) => {
    if (!value) return;
    const match = /\/api\/uploads\/([^/?#"']+)/.exec(value);
    if (match) referenced.add(match[1]);
  };
  for (const row of db.prepare('SELECT url FROM task_attachments').all() as { url: string }[]) {
    add(row.url);
  }
  for (const row of db.prepare('SELECT url FROM documents').all() as { url: string | null }[]) {
    add(row.url);
  }
  for (const row of db.prepare('SELECT file_url FROM invoices').all() as { file_url: string | null }[]) {
    add(row.file_url);
  }
  for (const row of db.prepare('SELECT file_url FROM deliverables').all() as {
    file_url: string | null;
  }[]) {
    add(row.file_url);
  }
  return referenced;
}

/**
 * Deletes uploads nothing points at any more — abandoned form submissions, and
 * files whose task or document has since been deleted. Left older than
 * `graceHours` so a file uploaded seconds ago, mid-form, is never swept.
 */
export function collectOrphanUploads(db: Db, graceHours = 24): { removed: number; bytes: number } {
  const referenced = referencedFilenames(db);
  const cutoff = new Date(Date.now() - graceHours * 3600_000).toISOString();
  const candidates = db
    .prepare('SELECT id, filename, size_bytes FROM uploads WHERE created_at < ?')
    .all(cutoff) as { id: string; filename: string; size_bytes: number }[];

  let removed = 0;
  let bytes = 0;
  transact(db, () => {
    for (const row of candidates) {
      if (referenced.has(row.filename)) continue;
      try {
        unlinkSync(join(UPLOAD_DIR, row.filename));
      } catch {
        /* already gone from disk; still drop the row */
      }
      db.prepare('DELETE FROM uploads WHERE id = ?').run(row.id);
      removed += 1;
      bytes += row.size_bytes;
    }
  });

  // Half-written uploads: a request that died between the first byte and the
  // database row leaves a .part behind that no row will ever point at, so the
  // sweep above would never see it.
  const incoming = join(UPLOAD_DIR, 'incoming');
  if (existsSync(incoming)) {
    const cutoffMs = Date.now() - graceHours * 3600_000;
    for (const name of readdirSync(incoming)) {
      if (!name.endsWith('.part')) continue;
      const path = join(incoming, name);
      try {
        const stats = statSync(path);
        if (stats.mtimeMs > cutoffMs) continue;
        unlinkSync(path);
        removed += 1;
        bytes += stats.size;
      } catch {
        /* vanished under us, which is the outcome we wanted anyway */
      }
    }
  }

  return { removed, bytes };
}
