import { Router } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { logSystemActivity, todayISO } from '../domain/activity';
import { notFound } from '../http/errors';
import { documentSchema } from '../http/validate';
import { assertClient, snapshotFor } from './clients';

export function documentRoutes(db: Db): Router {
  const router = Router({ mergeParams: true });
  router.use(requireSection('documents'));

  router.post('/', requireWrite, (req, res) => {
    const { clientId } = req.params as { clientId: string };
    assertClient(db, clientId);
    const input = documentSchema.parse(req.body);
    transact(db, () => {
      db.prepare(
        `INSERT INTO documents (id, client_id, name, type, date, url, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(),
        clientId,
        input.name,
        input.type,
        todayISO(),
        input.url || null,
        input.source,
        new Date().toISOString(),
      );
      logSystemActivity(db, clientId, `Document "${input.name}" added`, req.actor!.name);
    });
    res.status(201).json(snapshotFor(db, req));
  });

  router.delete('/:documentId', requireWrite, (req, res) => {
    const { clientId, documentId } = req.params as { clientId: string; documentId: string };
    assertClient(db, clientId);
    const result = db
      .prepare('DELETE FROM documents WHERE id = ? AND client_id = ?')
      .run(documentId, clientId);
    if (result.changes === 0) throw notFound('Document');
    res.json(snapshotFor(db, req));
  });

  return router;
}
