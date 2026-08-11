import { Router } from 'express';
import { ACCESS_SECTIONS } from '../../../src/data/options';
import type { Access } from '../../../src/data/types';
import { hashPassword } from '../auth/passwords';
import { requireSection, requireTeamAdmin, writeAccess } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { HttpError, notFound } from '../http/errors';
import { accessSchema, teammateSchema } from '../http/validate';
import { snapshotFor } from './clients';

/** Coerces an untrusted `{section: bool}` map into a full Access record. */
function toAccess(input: Record<string, boolean>): Access {
  return ACCESS_SECTIONS.reduce((acc, section) => {
    acc[section.key] = !!input[section.key];
    return acc;
  }, {} as Access);
}

export function teamRoutes(db: Db): Router {
  const router = Router();

  router.get('/', requireSection('team'), (req, res) => {
    res.json(snapshotFor(db, req));
  });

  // Creating people and changing what they can see is Owner-only.
  router.post('/', requireSection('team'), requireTeamAdmin, (req, res) => {
    const input = teammateSchema.parse(req.body);
    const taken = db.prepare('SELECT id FROM users WHERE email = ?').get(input.email);
    if (taken) throw new HttpError(409, 'That email address is already in use.');

    const id = newId();
    const { hash, salt } = hashPassword(input.password);

    transact(db, () => {
      db.prepare(
        `INSERT INTO users (id, name, email, role, permission, password_hash, password_salt, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, input.name, input.email, input.role, input.permission, hash, salt, new Date().toISOString());
      writeAccess(
        db,
        id,
        input.access
          ? toAccess(input.access)
          : toAccess(Object.fromEntries(ACCESS_SECTIONS.map((s) => [s.key, true]))),
      );
    });

    res.status(201).json(snapshotFor(db, req));
  });

  router.put('/:userId/access', requireSection('team'), requireTeamAdmin, (req, res) => {
    const { userId } = req.params;
    const user = db.prepare('SELECT id, permission FROM users WHERE id = ?').get(userId) as
      | { id: string; permission: string }
      | undefined;
    if (!user) throw notFound('Teammate');

    const { access } = accessSchema.parse(req.body);
    writeAccess(db, userId, toAccess(access));
    res.json(snapshotFor(db, req));
  });

  router.delete('/:userId', requireSection('team'), requireTeamAdmin, (req, res) => {
    const { userId } = req.params;
    if (userId === req.actor!.userId) throw new HttpError(400, 'You cannot remove your own account.');

    const user = db.prepare('SELECT permission FROM users WHERE id = ?').get(userId) as
      | { permission: string }
      | undefined;
    if (!user) throw notFound('Teammate');

    // Never leave the workspace without an Owner who can administer it.
    if (user.permission === 'Owner') {
      const owners = db
        .prepare("SELECT COUNT(*) AS n FROM users WHERE permission = 'Owner'")
        .get() as { n: number };
      if (owners.n <= 1) throw new HttpError(409, 'The last Owner cannot be removed.');
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json(snapshotFor(db, req));
  });

  return router;
}
