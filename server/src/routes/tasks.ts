import { Router } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { logSystemActivity } from '../domain/activity';
import { mentionsAssignment, resolveAssignment } from '../domain/assignees';
import { bumpVersion } from '../domain/versions';
import { audit } from '../domain/audit';
import { notFound } from '../http/errors';
import { taskPatchSchema, taskSchema } from '../http/validate';
import { addAttachment, clearAttachments } from '../domain/attachments';
import { assertClient, snapshotFor } from './clients';
import { archiveRow } from '../domain/archive';

function replaceAttachments(db: Db, taskId: string, urls: string[]): void {
  clearAttachments(db, { taskId });
  for (const url of urls) addAttachment(db, { taskId }, { url });
}

export function taskRoutes(db: Db): Router {
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


  router.post('/', requireWrite, (req, res) => {
    const { clientId } = req.params as { clientId: string };
    assertClient(db, clientId);
    const input = taskSchema.parse(req.body);
    // Unassigned tickets default to whoever raised them, as before — but now as
    // an account rather than a copy of their name.
    const assignee = resolveAssignment(db, {
      userId: input.assigneeUserId,
      name: input.assignee || req.actor!.name,
    });
    const id = newId();

    transact(db, () => {
      db.prepare(
        `INSERT INTO tasks (id, client_id, title, description, assignee, assignee_user_id, status, priority, due_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        clientId,
        input.title,
        input.description,
        assignee.name,
        assignee.userId,
        input.status,
        input.priority,
        input.dueDate ?? '',
        new Date().toISOString(),
      );
      replaceAttachments(db, id, input.attachments);
      logSystemActivity(db, clientId, `Task "${input.title}" created`, req.actor!.name);
    });

    res.status(201).json(snapshotFor(db, req));
  });

  router.patch('/:taskId', requireWrite, (req, res) => {
    const { clientId, taskId } = req.params as { clientId: string; taskId: string };
    const existing = db
      .prepare(
        'SELECT id, title, status FROM tasks WHERE id = ? AND client_id = ? AND archived_at IS NULL',
      )
      .get(taskId, clientId) as { id: string; title: string; status: string } | undefined;
    if (!existing) throw notFound('Task');

    const input = taskPatchSchema.parse(req.body);
    const map: Record<string, string> = {
      title: 'title',
      description: 'description',
      // `assignee` is set through the resolver below, not by this map.
      status: 'status',
      priority: 'priority',
      dueDate: 'due_date',
    };
    const columns: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(map)) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) columns[column] = value;
    }

    if (mentionsAssignment({ userId: input.assigneeUserId, name: input.assignee })) {
      const assignee = resolveAssignment(db, {
        userId: input.assigneeUserId,
        name: input.assignee,
      });
      columns.assignee = assignee.name;
      columns.assignee_user_id = assignee.userId;
    }

    transact(db, () => {
      // First, so a stale write is refused before anything is changed.
      bumpVersion(db, 'tasks', taskId, input.version);
      if (Object.keys(columns).length > 0) {
        const assignments = Object.keys(columns)
          .map((c) => `${c} = @${c}`)
          .join(', ');
        db.prepare(`UPDATE tasks SET ${assignments} WHERE id = @id`).run({ ...columns, id: taskId });
      }
      if (input.attachments !== undefined) replaceAttachments(db, taskId, input.attachments);
      if (input.status !== undefined && input.status !== existing.status) {
        logSystemActivity(
          db,
          clientId,
          `Task "${input.title ?? existing.title}" moved to ${input.status}`,
          req.actor!.name,
        );
      }
    });

    res.json(snapshotFor(db, req));
  });

  router.delete('/:taskId', requireWrite, (req, res) => {
    const { clientId, taskId } = req.params as { clientId: string; taskId: string };
    assertClient(db, clientId);
    const existing = db
      .prepare('SELECT title FROM tasks WHERE id = ? AND client_id = ? AND archived_at IS NULL')
      .get(taskId, clientId) as { title: string } | undefined;
    if (!existing) throw notFound('Task');

    transact(db, () => {
      archiveRow(db, 'tasks', taskId);
      logSystemActivity(db, clientId, `Task "${existing.title}" deleted`, req.actor!.name);
      audit(db, req, {
        action: 'task.delete',
        targetType: 'task',
        targetId: taskId,
        targetLabel: existing.title,
        detail: `client ${clientId}`,
      });
    });

    res.json(snapshotFor(db, req));
  });

  return router;
}
