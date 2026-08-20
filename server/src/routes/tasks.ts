import { Router } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { logSystemActivity } from '../domain/activity';
import { bumpVersion } from '../domain/versions';
import { audit } from '../domain/audit';
import { notFound } from '../http/errors';
import { taskPatchSchema, taskSchema } from '../http/validate';
import { assertClient, snapshotFor } from './clients';

function replaceAttachments(db: Db, taskId: string, urls: string[]): void {
  db.prepare('DELETE FROM task_attachments WHERE task_id = ?').run(taskId);
  const stmt = db.prepare('INSERT INTO task_attachments (id, task_id, url) VALUES (?, ?, ?)');
  for (const url of urls) {
    if (url.trim()) stmt.run(newId(), taskId, url.trim());
  }
}

export function taskRoutes(db: Db): Router {
  const router = Router({ mergeParams: true });
  router.use(requireSection('clients'));

  router.post('/', requireWrite, (req, res) => {
    const { clientId } = req.params as { clientId: string };
    assertClient(db, clientId);
    const input = taskSchema.parse(req.body);
    const id = newId();

    transact(db, () => {
      db.prepare(
        `INSERT INTO tasks (id, client_id, title, description, assignee, status, priority, due_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        clientId,
        input.title,
        input.description,
        input.assignee || req.actor!.name,
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
      .prepare('SELECT id, title, status FROM tasks WHERE id = ? AND client_id = ?')
      .get(taskId, clientId) as { id: string; title: string; status: string } | undefined;
    if (!existing) throw notFound('Task');

    const input = taskPatchSchema.parse(req.body);
    const map: Record<string, string> = {
      title: 'title',
      description: 'description',
      assignee: 'assignee',
      status: 'status',
      priority: 'priority',
      dueDate: 'due_date',
    };
    const columns: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(map)) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) columns[column] = value;
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
      .prepare('SELECT title FROM tasks WHERE id = ? AND client_id = ?')
      .get(taskId, clientId) as { title: string } | undefined;
    if (!existing) throw notFound('Task');

    transact(db, () => {
      db.prepare('DELETE FROM tasks WHERE id = ? AND client_id = ?').run(taskId, clientId);
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
