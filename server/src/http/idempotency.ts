import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Db } from '../db/index';
import { buildSnapshot } from '../domain/snapshot';
import { HttpError } from './errors';

/**
 * Makes a POST safe to send twice.
 *
 * Without this, one user intent could become two records. Reproduced in a
 * browser against a deliberately slow connection: click "Log payment", nothing
 * appears to happen for a second and a half, click again — two POSTs, two
 * payments of ₹1,234 against the same invoice, and an invoice that now looks
 * ₹1,234 more settled than the client actually paid. A phone that loses signal
 * mid-request and retries produces the same thing without anyone clicking twice.
 *
 * The client sends `Idempotency-Key: <uuid>` identifying the *intent* rather
 * than the request, and keeps it stable across retries of that intent. The first
 * request to claim a key does the work; anything arriving later with the same key
 * gets the current snapshot instead of a second insert.
 *
 * Requests without the header are unaffected, so scripts and the CLI keep
 * working.
 */

/** Keys are opaque to us, but they still have to be a sane size. */
const MAX_KEY_LENGTH = 200;

function readKey(req: Request): string | null {
  const raw = req.header('idempotency-key');
  if (!raw) return null;
  const key = raw.trim();
  if (!key) return null;
  if (key.length > MAX_KEY_LENGTH) {
    throw new HttpError(400, 'Idempotency-Key is too long.');
  }
  return key;
}

/**
 * A stable fingerprint of what was asked for. Object key order is normalised so
 * two encodings of the same request agree.
 */
function fingerprint(method: string, path: string, body: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = canonical((value as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return value;
  };
  return createHash('sha256')
    .update(JSON.stringify({ method, path, body: canonical(body) }))
    .digest('hex');
}

const UNIQUE_VIOLATION = /UNIQUE constraint failed/i;

export function idempotency(db: Db) {
  const insert = db.prepare(
    `INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const find = db.prepare(
    'SELECT request_hash FROM idempotency_keys WHERE key = ? AND user_id = ?',
  );
  const drop = db.prepare('DELETE FROM idempotency_keys WHERE key = ? AND user_id = ?');

  return (req: Request, res: Response, next: NextFunction): void => {
    // Only creates need this. A PATCH that sets a field to a value is already
    // idempotent, and a DELETE of something already gone is handled as a 404.
    if (req.method !== 'POST') return next();

    const key = readKey(req);
    if (!key || !req.actor) return next();

    // The route mounts overlap — /api/clients and /api/clients/:id/invoices both
    // match an invoice POST — so this middleware runs more than once for a single
    // request. Claiming the key twice would look like a duplicate of itself.
    if (req.idempotencyChecked) return next();
    req.idempotencyChecked = true;

    const userId = req.actor.userId;
    // originalUrl, not baseUrl + path: those are relative to whichever mount is
    // running, and the fingerprint has to describe the request, not the routing.
    const endpoint = `${req.method} ${req.originalUrl.split('?')[0]}`;
    const hash = fingerprint(req.method, endpoint, req.body);

    const replay = (existing: { request_hash: string }) => {
      // Same key, different request. Almost always a client bug — reusing a key
      // for a new intent — and guessing which one to honour would be worse than
      // saying so.
      if (existing.request_hash !== hash) {
        throw new HttpError(409, 'That Idempotency-Key was already used for a different request.');
      }
      res.status(200).json(buildSnapshot(db, req.actor!));
    };

    const existing = find.get(key, userId) as { request_hash: string } | undefined;
    if (existing) return replay(existing);

    try {
      insert.run(key, userId, endpoint, hash, new Date().toISOString());
    } catch (err) {
      // Two copies of the same request arriving at once: whoever lost the race
      // is a replay. The snapshot may not yet include the other's write, which
      // the next response corrects — far better than writing it twice.
      if (err instanceof Error && UNIQUE_VIOLATION.test(err.message)) {
        const now = find.get(key, userId) as { request_hash: string } | undefined;
        if (now) return replay(now);
      }
      throw err;
    }

    // A request that failed did not happen, so its key must not be spent —
    // otherwise correcting a rejected amount and submitting again would be
    // refused as a duplicate.
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        try {
          drop.run(key, userId);
        } catch {
          /* the row may already be gone; nothing to undo */
        }
      }
    });

    next();
  };
}

/**
 * Forgets keys older than `days`. They only need to outlive a client's retries;
 * keeping them forever would grow the table without bound.
 */
export function collectIdempotencyKeys(db: Db, days = 7): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return db.prepare('DELETE FROM idempotency_keys WHERE created_at < ?').run(cutoff).changes;
}
