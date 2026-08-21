import { Router } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { logSystemActivity, todayISO } from '../domain/activity';
import { audit } from '../domain/audit';
import { notFound } from '../http/errors';
import { documentSchema } from '../http/validate';
import { addAttachment } from '../domain/attachments';
import { assertClient, snapshotFor } from './clients';

export function documentRoutes(db: Db): Router {
  const router = Router({ mergeParams: true });
  router.use(requireSection('documents'));

  router.post('/', requireWrite, (req, res) => {
    const { clientId } = req.params as { clientId: string };
    assertClient(db, clientId);
    const input = documentSchema.parse(req.body);
    transact(db, () => {
      const documentId = newId();
      db.prepare(
        `INSERT INTO documents (id, client_id, name, type, date, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        documentId,
        clientId,
        input.name,
        input.type,
        todayISO(),
        input.source,
        new Date().toISOString(),
      );
      // The file is the document, so it goes in as an attachment in the same
      // transaction: a document row with no attachment, or an attachment with
      // no document, are both states nothing should ever observe.
      if (input.url) addAttachment(db, { documentId }, { url: input.url, name: input.name });
      logSystemActivity(db, clientId, `Document "${input.name}" added`, req.actor!.name);
    });
    res.status(201).json(snapshotFor(db, req));
  });

  router.delete('/:documentId', requireWrite, (req, res) => {
    const { clientId, documentId } = req.params as { clientId: string; documentId: string };
    assertClient(db, clientId);
    const existing = db
      .prepare('SELECT name FROM documents WHERE id = ? AND client_id = ?')
      .get(documentId, clientId) as { name: string } | undefined;
    if (!existing) throw notFound('Document');

    transact(db, () => {
      db.prepare('DELETE FROM documents WHERE id = ? AND client_id = ?').run(documentId, clientId);
      logSystemActivity(db, clientId, `Document "${existing.name}" deleted`, req.actor!.name);
      audit(db, req, {
        action: 'document.delete',
        targetType: 'document',
        targetId: documentId,
        targetLabel: existing.name,
        detail: `client ${clientId}`,
      });
    });

    res.json(snapshotFor(db, req));
  });

  return router;
}
