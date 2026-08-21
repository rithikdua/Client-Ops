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
 * request to claim a key does the work; anything arriving later with the same
 * key is answered with **what the first request actually replied**, replayed
 * from the row rather than reconstructed.
 *
 * That distinction is the whole point, and the first version got it wrong. It
 * answered every replay with a freshly built workspace snapshot and a 200, which
 * is a plausible-looking answer to the wrong question:
 *
 *   - Two endpoints do not return a snapshot at all. `POST
 *     /api/team/:id/reset-password` returns a **one-time link**, and uploads
 *     return the URL of the file just stored. A retried reset — a flaky
 *     connection, nothing the Owner did — minted the token, wrote it to the
 *     audit log, cancelled any previous one, and then handed back a workspace
 *     snapshot. The link was gone: not recoverable from anywhere, because only
 *     its hash is stored. The Owner's only option was to issue another, which
 *     invalidates the first.
 *   - The status code is part of the answer. A create replied 201 and its
 *     retry 200.
 *   - A replay arriving while the original was still running got a snapshot
 *     that did not yet contain the write, i.e. a success response that appears
 *     to show the work never happened.
 *
 * Requests without the header are unaffected, so scripts and the CLI keep
 * working.
 */

/** Keys are opaque to us, but they still have to be a sane size. */
const MAX_KEY_LENGTH = 200;

/**
 * How long a claimed-but-unfinished key is assumed to be genuinely in flight.
 *
 * The row is written before the handler runs, so a process killed mid-request
 * leaves a claim that no one will ever complete. Without a bound, that key is
 * poisoned for as long as it is retained and the user can never retry the
 * intent — a worse failure than the one this guard exists to prevent.
 *
 * Well above any real request here (the slowest is a file upload) and well
 * below the point where a person gives up and tries again.
 */
const IN_FLIGHT_MS = 60_000;

/**
 * Beyond this, a response is remembered only as its status code.
 *
 * A snapshot for a demo workspace is about 17 KB, so this is far above any
 * realistic body; nothing but a snapshot could reach it, and a snapshot is the
 * one kind of response that can be rebuilt. Storing an unbounded blob per
 * request for the retention period is the thing worth avoiding.
 */
const MAX_STORED_BODY = 256 * 1024;

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

interface KeyRow {
  request_hash: string;
  created_at: string;
  status_code: number | null;
  response_body: string | null;
  completed_at: string | null;
}

export function idempotency(db: Db) {
  const claim = db.prepare(
    `INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const find = db.prepare(
    `SELECT request_hash, created_at, status_code, response_body, completed_at
       FROM idempotency_keys WHERE key = ? AND user_id = ?`,
  );
  const complete = db.prepare(
    `UPDATE idempotency_keys SET status_code = ?, response_body = ?, completed_at = ?
      WHERE key = ? AND user_id = ?`,
  );
  const reclaim = db.prepare(
    'UPDATE idempotency_keys SET created_at = ? WHERE key = ? AND user_id = ?',
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
    const now = new Date();

    /** Answers this request with what the original one said. */
    const replay = (row: KeyRow): void => {
      // Same key, different request. Almost always a client bug — reusing a key
      // for a new intent — and guessing which one to honour would be worse than
      // saying so.
      if (row.request_hash !== hash) {
        throw new HttpError(409, 'That Idempotency-Key was already used for a different request.');
      }

      if (!row.completed_at) {
        // The original is still running. Answering now means answering before
        // its write lands, so the honest response is "ask again shortly" — the
        // client already retries, and a retry after it finishes gets the real
        // answer.
        // Worded for a person, because it can reach one: the browser guards
        // against double submits, but nothing stops a second tab or a phone
        // resuming a request the first attempt is still finishing.
        throw new HttpError(409, 'That is still going through. Give it a moment and try again.');
      }

      res.setHeader('Idempotency-Replayed', 'true');
      if (row.response_body === null) {
        // Only a body too large to keep gets here, which in practice means a
        // workspace snapshot — the one response that can be rebuilt without
        // inventing anything. The status code still comes from the original.
        res.status(row.status_code ?? 200).json(buildSnapshot(db, req.actor!));
        return;
      }
      res.status(row.status_code ?? 200).json(JSON.parse(row.response_body));
    };

    const existing = find.get(key, userId) as KeyRow | undefined;
    if (existing) {
      const age = now.getTime() - new Date(existing.created_at).getTime();
      const abandoned = !existing.completed_at && age > IN_FLIGHT_MS;
      if (!abandoned) return replay(existing);
      // The process that claimed this died before answering. Take the claim
      // over rather than leaving the intent permanently unrepeatable.
      if (existing.request_hash !== hash) {
        throw new HttpError(409, 'That Idempotency-Key was already used for a different request.');
      }
      reclaim.run(now.toISOString(), key, userId);
    } else {
      try {
        claim.run(key, userId, endpoint, hash, now.toISOString());
      } catch (err) {
        // Two copies arriving at once: whoever lost the race is a replay, and
        // will be told to wait because the winner has not finished yet.
        if (err instanceof Error && UNIQUE_VIOLATION.test(err.message)) {
          const row = find.get(key, userId) as KeyRow | undefined;
          if (row) return replay(row);
        }
        throw err;
      }
    }

    // Remember what this request answers, so its retries can be given the same
    // thing. Recorded from `res.json` rather than `finish` because that is the
    // only place the body still exists.
    const sendJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode < 400) {
        try {
          const text = JSON.stringify(body);
          complete.run(
            res.statusCode,
            text.length > MAX_STORED_BODY ? null : text,
            new Date().toISOString(),
            key,
            userId,
          );
        } catch {
          /* Recording is best-effort: the work is done and the caller must be
             answered. A key left uncompleted expires as an abandoned claim. */
        }
      }
      return sendJson(body);
    };

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
 * Forgets keys older than `days`, and the stored responses of keys older than
 * `bodyHours`.
 *
 * The two ages are different because they answer different needs. A body only
 * has to outlive a client's retries, which is minutes; keeping every response
 * for the full retention would store a snapshot per create for a week. The key
 * and its fingerprint are kept longer, because that is what catches a client
 * reusing one key for a different intent — the bug worth reporting rather than
 * silently absorbing.
 */
export function collectIdempotencyKeys(db: Db, days = 7, bodyHours = 24): number {
  const at = (ms: number) => new Date(Date.now() - ms).toISOString();
  db.prepare(
    `UPDATE idempotency_keys SET response_body = NULL
      WHERE response_body IS NOT NULL AND completed_at < ?`,
  ).run(at(bodyHours * 3_600_000));
  return db.prepare('DELETE FROM idempotency_keys WHERE created_at < ?').run(at(days * 86_400_000))
    .changes;
}
