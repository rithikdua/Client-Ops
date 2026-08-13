import { Router } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { logSystemActivity } from '../domain/activity';
import { audit } from '../domain/audit';
import { notFound } from '../http/errors';
import { deliverablePatchSchema, deliverableSchema } from '../http/validate';
import { assertClient, snapshotFor } from './clients';

export function deliverableRoutes(db: Db): Router {
  const router = Router({ mergeParams: true });
  router.use(requireSection('deliverables'));

  router.post('/', requireWrite, (req, res) => {
    const { clientId } = req.params as { clientId: string };
    assertClient(db, clientId);
    const input = deliverableSchema.parse(req.body);
    transact(db, () => {
      db.prepare(
        `INSERT INTO deliverables (
           id, client_id, title, description, owner, due_date, status, file_name, file_url, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(),
        clientId,
        input.title,
        input.description,
        input.owner,
        input.dueDate,
        input.status,
        input.fileName || null,
        input.fileUrl || null,
        new Date().toISOString(),
      );
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
        db.prepare('UPDATE deliverables SET file_name = ?, file_url = ? WHERE id = ?').run(
          input.fileName || null,
          input.fileUrl || null,
          deliverableId,
        );
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
