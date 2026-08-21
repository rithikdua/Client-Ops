import { Router } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, type Db } from '../db/index';
import { todayISO } from '../domain/activity';
import { activitySchema } from '../http/validate';
import { assertClient, snapshotFor } from './clients';

export function activityRoutes(db: Db): Router {
  const router = Router({ mergeParams: true });
  router.use(requireSection('clients'));
  // Every route below belongs to a client, so the client has to exist and be
  // live. On the mount rather than in each handler: several of these used to
  // rely on their own `WHERE client_id = ?` lookups, which check the row is in
  // the right account but not that the account is still there — so an archived
  // client's tasks stayed editable through a URL somebody had open.
  router.use((req, _res, next) => {
    assertClient(db, (req.params as { clientId: string }).clientId);
    next();
  });


  // Only hand-written notes are accepted here; `system` entries are written by
  // the server as a side effect of other mutations and can't be forged. The
  // author is taken from the session, never the request body — otherwise anyone
  // could file "Approved payment" under the CEO's name.
  router.post('/', requireWrite, (req, res) => {
    const { clientId } = req.params as { clientId: string };
    assertClient(db, clientId);
    const input = activitySchema.parse(req.body);
    db.prepare(
      `INSERT INTO activity (id, client_id, date, author, note, kind, created_at)
       VALUES (?, ?, ?, ?, ?, 'note', ?)`,
    ).run(
      newId(),
      clientId,
      todayISO(),
      req.actor!.name,
      input.note,
      new Date().toISOString(),
    );
    res.status(201).json(snapshotFor(db, req));
  });

  return router;
}
