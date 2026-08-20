import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
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

export function uploadRoutes(db: Db): Router {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

  // Held in memory so the bytes can be inspected before anything reaches disk.
  const upload = multer({
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    storage: multer.memoryStorage(),
  });

  const router = Router({ mergeParams: true });

  /**
   * Accepts a file for a specific client, under the section that will own it.
   * Requiring both up front is what makes the download check possible later.
   */
  const handleUpload = (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    if (!db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId)) throw notFound('Client');
    if (!req.file) throw new HttpError(400, 'No file received.');

    const bytes = req.file.buffer;
    // The claimed type is a hint for disambiguating ZIP-based formats, nothing more.
    const detected = detectType(bytes, req.file.mimetype);
    if (!detected) {
      throw new HttpError(415, `That file is not a supported type. Allowed: ${ALLOWED_SUMMARY}.`);
    }

    const perUser = usedBytes(db, 'uploaded_by', req.actor!.userId);
    if (perUser + bytes.length > MAX_BYTES_PER_USER) {
      throw new HttpError(413, 'You have reached your upload storage limit.');
    }
    const total = usedBytes(db, null);
    if (total + bytes.length > MAX_BYTES_TOTAL) {
      throw new HttpError(413, 'This workspace has reached its upload storage limit.');
    }

    // Our own name, our own extension: a filename from the client never touches
    // the filesystem.
    const filename = `${randomUUID()}${detected.extension}`;
    const target = join(UPLOAD_DIR, filename);
    writeFileSync(target, bytes);

    try {
      db.prepare(
        `INSERT INTO uploads (id, filename, original_name, mime, size_bytes, client_id, section, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(),
        filename,
        req.file.originalname.slice(0, 300),
        detected.mime,
        bytes.length,
        clientId,
        // The owning section, so the download check asks the same question the
        // record does.
        req.uploadSection ?? 'clients',
        req.actor!.userId,
        new Date().toISOString(),
      );
    } catch (err) {
      // Never leave a file on disk with no record pointing at it.
      try {
        unlinkSync(target);
      } catch {
        /* the write may not have landed; nothing to undo */
      }
      throw err;
    }

    res.status(201).json({
      url: `/api/uploads/${filename}`,
      name: req.file.originalname,
      size: bytes.length,
      mime: detected.mime,
      section: req.uploadSection ?? 'clients',
    });
  };

  const guards = [requireAuth, requireWrite, requireUploadSection];
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
  return { removed, bytes };
}
