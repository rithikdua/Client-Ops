import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireWrite } from '../auth/permissions';
import { HttpError } from '../http/errors';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Only formats we are willing to serve back to a browser. */
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
]);

const ALLOWED_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.pdf',
  '.csv',
  '.doc',
  '.docx',
  '.xlsx',
]);

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? join(process.cwd(), 'server', 'data', 'uploads');

export function uploadRoutes(): Router {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

  const upload = multer({
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
      // Never trust the client's filename on disk: generate our own and keep
      // only a vetted extension, so nothing can path-traverse or end up
      // executable.
      filename: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        cb(null, `${randomUUID()}${ALLOWED_EXT.has(ext) ? ext : ''}`);
      },
    }),
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(new HttpError(415, `Unsupported file type: ${file.mimetype}`));
        return;
      }
      cb(null, true);
    },
  });

  const router = Router();

  router.post('/', requireAuth, requireWrite, upload.single('file'), (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file received.');
    res.status(201).json({
      url: `/api/uploads/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
    });
  });

  return router;
}
