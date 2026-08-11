import { Router } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { logSystemActivity, todayISO } from '../domain/activity';
import { notFound } from '../http/errors';
import { contactSchema } from '../http/validate';
import { assertClient, snapshotFor } from './clients';

export function contactRoutes(db: Db): Router {
  const router = Router({ mergeParams: true });
  router.use(requireSection('clients'));

  router.post('/', requireWrite, (req, res) => {
    const { clientId } = req.params as { clientId: string };
    assertClient(db, clientId);
    const input = contactSchema.parse(req.body);
    transact(db, () => {
      db.prepare(
        'INSERT INTO contacts (id, client_id, name, role, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(newId(), clientId, input.name, input.role, input.email, input.phone);
      logSystemActivity(db, clientId, `Contact "${input.name}" added`, req.actor!.name);
    });
    res.status(201).json(snapshotFor(db, req));
  });

  router.delete('/:contactId', requireWrite, (req, res) => {
    const { clientId, contactId } = req.params as { clientId: string; contactId: string };
    assertClient(db, clientId);
    const result = db
      .prepare('DELETE FROM contacts WHERE id = ? AND client_id = ?')
      .run(contactId, clientId);
    if (result.changes === 0) throw notFound('Contact');
    res.json(snapshotFor(db, req));
  });

  return router;
}

/**
 * The Follow-ups → Phonebook screen can add a contact to a brand-new client in
 * one step, so this lives outside the /clients/:id tree.
 */
export function globalContactRoutes(db: Db): Router {
  const router = Router();
  router.use(requireSection('clients'));

  router.post('/', requireWrite, (req, res) => {
    const input = contactSchema.parse(req.body);
    const clientId = String(req.body?.clientId ?? '');

    transact(db, () => {
      let targetId = clientId;
      if (clientId === '__new__') {
        targetId = newId();
        db.prepare(
          `INSERT INTO clients (
             id, name, industry, health, owner, stage, currency, billing_cycle,
             contract_value_minor, start_date, payment_terms, created_at
           ) VALUES (?, ?, '', 'Active', ?, 'Onboarding', 'INR', 'Monthly', 0, ?, 'Net 30', ?)`,
        ).run(
          targetId,
          input.newClientName?.trim() || 'Untitled client',
          req.actor!.name,
          todayISO(),
          new Date().toISOString(),
        );
        logSystemActivity(db, targetId, 'Client created', req.actor!.name);
      } else {
        assertClient(db, targetId);
      }

      db.prepare(
        'INSERT INTO contacts (id, client_id, name, role, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(newId(), targetId, input.name, input.role, input.email, input.phone);
      logSystemActivity(db, targetId, `Contact "${input.name}" added`, req.actor!.name);
    });

    res.status(201).json(snapshotFor(db, req));
  });

  return router;
}
