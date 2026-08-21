import type { Request } from 'express';
import { newId, type Db } from '../db/index';
import { clientIp } from '../http/rateLimit';

/**
 * The events worth reconstructing after the fact. Kept as a closed set so the
 * log can be filtered and read, rather than being a bag of free-text strings
 * that only make sense to whoever wrote the call site.
 */
export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.login_google'
  | 'auth.google_email_changed'
  | 'auth.logout'
  | 'auth.password_change'
  | 'auth.reset_redeemed'
  | 'auth.setup'
  | 'auth.preview_start'
  | 'auth.preview_stop'
  | 'client.delete'
  | 'contact.delete'
  | 'task.delete'
  | 'deliverable.delete'
  | 'document.delete'
  | 'invoice.delete'
  | 'invoice.file_delete'
  | 'payment.delete'
  | 'followup.delete'
  | 'team.add'
  | 'team.remove'
  | 'team.access_change'
  | 'team.reset_link';

export interface AuditEvent {
  action: AuditAction;
  /** What kind of thing was acted on: 'client', 'user', 'invoice'… */
  targetType?: string;
  targetId?: string;
  /** A human-readable name, captured now because the row may be gone later. */
  targetLabel?: string;
  detail?: string;
}

export interface AuditActor {
  userId: string | null;
  name: string;
  email: string;
  actingAsId?: string | null;
}

/**
 * Appends one row. Deliberately never throws: an audit write must not be able to
 * fail the operation it is describing, and a lost row is a smaller problem than
 * a delete that half happened. Failures are logged loudly instead.
 *
 * Call this *inside* the same transaction as the change it records wherever there
 * is one, so a rolled-back delete leaves no entry claiming it happened.
 */
export function recordAudit(db: Db, actor: AuditActor, event: AuditEvent, ip = ''): void {
  try {
    db.prepare(
      `INSERT INTO audit_log (
         id, at, actor_id, actor_name, actor_email, acting_as_id,
         action, target_type, target_id, target_label, detail, ip
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(),
      new Date().toISOString(),
      actor.userId,
      actor.name,
      actor.email,
      actor.actingAsId ?? null,
      event.action,
      event.targetType ?? '',
      event.targetId ?? '',
      (event.targetLabel ?? '').slice(0, 300),
      (event.detail ?? '').slice(0, 500),
      ip,
    );
  } catch (err) {
    console.error('[client-ops] failed to write audit entry:', event.action, err);
  }
}

/**
 * Records an event attributed to whoever made the request. The actor is the
 * signed-in account even when they are previewing as someone else — the preview
 * decides what they may do, never who did it.
 */
export function audit(db: Db, req: Request, event: AuditEvent): void {
  const actor = req.actor;
  recordAudit(
    db,
    {
      userId: actor?.userId ?? null,
      name: actor?.name ?? '',
      email: actor?.email ?? '',
      actingAsId: actor?.previewAsId ?? null,
    },
    event,
    clientIp(req),
  );
}

/**
 * Records an event for a request with no session yet — a failed sign-in, or the
 * first-run setup. The address is all there is to go on, so it is stored under a
 * null actor rather than being dropped.
 */
export function auditAnonymous(
  db: Db,
  req: Request,
  event: AuditEvent,
  identity: { name?: string; email?: string; userId?: string } = {},
): void {
  recordAudit(
    db,
    {
      userId: identity.userId ?? null,
      name: identity.name ?? '',
      email: identity.email ?? '',
    },
    event,
    clientIp(req),
  );
}

export interface AuditRow {
  id: string;
  at: string;
  actor_id: string | null;
  actor_name: string;
  actor_email: string;
  acting_as_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  target_label: string;
  detail: string;
  ip: string;
}

/** Most recent first. Used by `npm run audit`; there is no API surface for it. */
export function readAudit(db: Db, opts: { limit?: number; action?: string } = {}): AuditRow[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
  if (opts.action) {
    return db
      .prepare('SELECT * FROM audit_log WHERE action LIKE ? ORDER BY at DESC, id DESC LIMIT ?')
      .all(opts.action.replace(/\*/g, '%'), limit) as AuditRow[];
  }
  return db
    .prepare('SELECT * FROM audit_log ORDER BY at DESC, id DESC LIMIT ?')
    .all(limit) as AuditRow[];
}
