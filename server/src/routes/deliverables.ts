import { Router } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { logSystemActivity } from '../domain/activity';
import { resolveAssignment } from '../domain/assignees';
import { bumpVersion } from '../domain/versions';
import { audit } from '../domain/audit';
import { notFound } from '../http/errors';
import { deliverablePatchSchema, deliverableSchema } from '../http/validate';
import { addAttachment, setAttachment } from '../domain/attachments';
import { assertClient, snapshotFor } from './clients';

export function deliverableRoutes(db: Db): Router {
  const router = Router({ mergeParams: true });
  router.use(requireSection('deliverables'));

  router.post('/', requireWrite, (req, res) => {
    const { clientId } = req.params as { clientId: string };
    assertClient(db, clientId);
    const input = deliverableSchema.parse(req.body);
    const owner = resolveAssignment(db, { userId: input.ownerUserId, name: input.owner });

    transact(db, () => {
      const deliverableId = newId();
      db.prepare(
        `INSERT INTO deliverables (
           id, client_id, title, description, owner, owner_user_id, due_date, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        deliverableId,
        clientId,
        input.title,
        input.description,
        owner.name,
        owner.userId,
        input.dueDate,
        input.status,
        new Date().toISOString(),
      );
      // In the same transaction as the row it belongs to.
      if (input.fileUrl) {
        addAttachment(db, { deliverableId }, { url: input.fileUrl, name: input.fileName ?? '' });
      }
      logSystemActivity(db, clientId, `Deliverable "${input.title}" added`, req.actor!.name);
    });
    res.status(201).json(snapshotFor(db, req));
  });

  router.patch('/:deliverableId', requireWrite, (req, res) => {
    const { clientId, deliverableId } = req.params as { clientId: string; deliverableId: string };
    const existing = db
      .prepare('SELECT id, title, status FROM deliverables WHERE id = ? AND client_id = ?')
      .get(deliverableId, clientId) as { id: string; title: string; status: string } | undefined;
    if (!existing) throw notFound('Deliverable');

    const input = deliverablePatchSchema.parse(req.body);

    transact(db, () => {
      bumpVersion(db, 'deliverables', deliverableId, input.version);
      if (input.status !== undefined) {
        db.prepare('UPDATE deliverables SET status = ? WHERE id = ?').run(input.status, deliverableId);
        if (input.status !== existing.status) {
          logSystemActivity(
            db,
            clientId,
            `Deliverable "${existing.title}" moved to ${input.status}`,
            req.actor!.name,
          );
        }
      }
      if (input.fileName !== undefined || input.fileUrl !== undefined) {
        setAttachment(db, { deliverableId }, {
          url: input.fileUrl ?? '',
          name: input.fileName ?? '',
        });
      }
    });

    res.json(snapshotFor(db, req));
  });

  router.delete('/:deliverableId', requireWrite, (req, res) => {
    const { clientId, deliverableId } = req.params as { clientId: string; deliverableId: string };
    assertClient(db, clientId);
    const existing = db
      .prepare('SELECT title FROM deliverables WHERE id = ? AND client_id = ?')
      .get(deliverableId, clientId) as { title: string } | undefined;
    if (!existing) throw notFound('Deliverable');

    transact(db, () => {
      db.prepare('DELETE FROM deliverables WHERE id = ? AND client_id = ?').run(
        deliverableId,
        clientId,
      );
      logSystemActivity(db, clientId, `Deliverable "${existing.title}" deleted`, req.actor!.name);
      audit(db, req, {
        action: 'deliverable.delete',
        targetType: 'deliverable',
        targetId: deliverableId,
        targetLabel: existing.title,
        detail: `client ${clientId}`,
      });
    });

    res.json(snapshotFor(db, req));
  });

  return router;
}
