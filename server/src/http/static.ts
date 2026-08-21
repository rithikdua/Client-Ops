import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { envFlag, envString } from '../config';

const here = dirname(fileURLToPath(import.meta.url));

/** Where `vite build` puts the front end. */
export const STATIC_DIR = envString('STATIC_DIR', join(here, '..', '..', '..', 'dist'));

/**
 * Serves the built front end from the same origin as the API.
 *
 * Until this existed, `npm start` ran the API and nothing else, while `vite
 * build` produced a `dist/` that some unspecified other thing was expected to
 * serve. Two consequences, both real:
 *
 * The repository could not demonstrate a complete running system, so "does the
 * deployed thing work" was unanswerable from inside it — which is exactly what
 * the review meant by the production topology not being represented here.
 *
 * And every security header this server sets, the Content-Security-Policy above
 * all, applied only to JSON and file downloads. A CSP's job is to constrain a
 * *document*, and no document was ever served by the process that sets it. The
 * header was decoration.
 *
 * Same origin also means the browser sends the session cookie without CORS, and
 * the Origin check on writes has one value to accept rather than a list.
 *
 * In development this stays off: Vite serves the front end on its own port with
 * hot reload, and proxies /api here.
 */
export function serveStaticApp(app: Express): boolean {
  const wanted = envFlag('SERVE_STATIC') || process.env.NODE_ENV === 'production';
  if (!wanted) return false;
  if (!existsSync(join(STATIC_DIR, 'index.html'))) {
    console.warn(
      `[client-ops] no built front end at ${STATIC_DIR} — run "npm run build" before starting in production.`,
    );
    return false;
  }

  // Asset filenames carry a content hash, so they can be cached hard and
  // forever; a change ships under a different name. The document itself must
  // never be cached — it is what points at the current asset names, and a stale
  // copy would keep loading the previous build.
  app.use(
    '/assets',
    express.static(join(STATIC_DIR, 'assets'), {
      immutable: true,
      maxAge: '1y',
      index: false,
      setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
    }),
  );
  app.use(express.static(STATIC_DIR, { index: false }));

  // Anything that is not an API call is the app itself. There is no router in
  // this front end yet, so every path renders the same document; when routing
  // arrives, this is already the behaviour it needs.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(STATIC_DIR, 'index.html'));
  });

  return true;
}
