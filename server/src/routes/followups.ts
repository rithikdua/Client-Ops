import { Router } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { addDaysISO, todayISO } from '../domain/activity';
import { audit } from '../domain/audit';
import { resolveAssignment } from '../domain/assignees';
import { bumpVersion } from '../domain/versions';
import { notFound } from '../http/errors';
import { completeFollowUpSchema, followUpSchema } from '../http/validate';
import { snapshotFor } from './clients';
import { archiveRow } from '../domain/archive';

export function followUpRoutes(db: Db): Router {
  const router = Router();
  router.use(requireSection('followups'));

  router.get('/', (req, res) => {
    res.json(snapshotFor(db, req));
  });

  router.post('/', requireWrite, (req, res) => {
    const input = followUpSchema.parse(req.body);
    // An unowned follow-up belongs to whoever created it.
    const owner = resolveAssignment(db, {
      userId: input.ownerUserId,
      name: input.owner || req.actor!.name,
    });
    db.prepare(
      `INSERT INTO follow_ups (
         id, name, company_name, email, phone, related_client_id, reason, owner, owner_user_id,
         due_date, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
    ).run(
      newId(),
      input.name,
      input.companyName,
      input.email,
      input.phone,
      input.relatedClientId || null,
      input.reason,
      owner.name,
      owner.userId,
      input.dueDate,
      new Date().toISOString(),
    );
    res.status(201).json(snapshotFor(db, req));
  });

  router.patch('/:followUpId', requireWrite, (req, res) => {
    const { followUpId } = req.params;
    if (!db.prepare('SELECT id FROM follow_ups WHERE id = ? AND archived_at IS NULL').get(followUpId)) {
      throw notFound('Follow-up');
    }
    const input = followUpSchema.parse(req.body);
    bumpVersion(db, 'follow_ups', followUpId, input.version);
    const owner = resolveAssignment(db, { userId: input.ownerUserId, name: input.owner });
    db.prepare(
      `UPDATE follow_ups SET
         name = ?, company_name = ?, email = ?, phone = ?, related_client_id = ?,
         reason = ?, owner = ?, owner_user_id = ?, due_date = ?
       WHERE id = ?`,
    ).run(
      input.name,
      input.companyName,
      input.email,
      input.phone,
      input.relatedClientId || null,
      input.reason,
      owner.name,
      owner.userId,
      input.dueDate,
      followUpId,
    );
    res.json(snapshotFor(db, req));
  });

  /**
   * Records the outcome of a call: either close it out, or log what was said and
   * push it to a later date. The note becomes part of the call history either way.
   */
  router.post('/:followUpId/complete', requireWrite, (req, res) => {
    const { followUpId } = req.params;
    if (!db.prepare('SELECT id FROM follow_ups WHERE id = ? AND archived_at IS NULL').get(followUpId)) {
      throw notFound('Follow-up');
    }
    const input = completeFollowUpSchema.parse(req.body);

    transact(db, () => {
      if (input.note) {
        db.prepare(
          'INSERT INTO follow_up_log (id, follow_up_id, date, note, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(newId(), followUpId, todayISO(), input.note, new Date().toISOString());
      }
      if (input.action === 'done') {
        db.prepare("UPDATE follow_ups SET status = 'Done' WHERE id = ?").run(followUpId);
      } else {
        db.prepare("UPDATE follow_ups SET status = 'Pending', due_date = ? WHERE id = ?").run(
          input.nextDate || addDaysISO(todayISO(), 2),
          followUpId,
        );
      }
    });

    res.json(snapshotFor(db, req));
  });

  router.post('/:followUpId/reopen', requireWrite, (req, res) => {
    const result = db
      .prepare("UPDATE follow_ups SET status = 'Pending' WHERE id = ?")
      .run(req.params.followUpId);
    if (result.changes === 0) throw notFound('Follow-up');
    res.json(snapshotFor(db, req));
  });

  // A follow-up belongs to no client until it becomes one, so there is no
  // activity feed to log this in — the audit trail is the only record.
  router.delete('/:followUpId', requireWrite, (req, res) => {
    const { followUpId } = req.params;
    const existing = db
      .prepare('SELECT name, company_name, status FROM follow_ups WHERE id = ? AND archived_at IS NULL')
      .get(followUpId) as { name: string; company_name: string; status: string } | undefined;
    if (!existing) throw notFound('Follow-up');

    transact(db, () => {
      archiveRow(db, 'follow_ups', followUpId);
      audit(db, req, {
        action: 'followup.delete',
        targetType: 'followup',
        targetId: followUpId,
        targetLabel: existing.company_name ? `${existing.name} (${existing.company_name})` : existing.name,
        detail: `was ${existing.status}`,
      });
    });

    res.json(snapshotFor(db, req));
  });

  return router;
}
