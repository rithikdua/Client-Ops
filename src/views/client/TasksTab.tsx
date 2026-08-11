import { AttachmentList, TaskStatusSelect, taskProjectKey } from '../../components/TaskBits';
import { EmptyRow } from '../../components/ui';
import type { Client } from '../../data/types';
import { Avatar } from '../../ds/Avatar';
import { Button } from '../../ds/Button';
import { Chip } from '../../ds/Chip';
import { TrashButton } from '../../ds/Icon';
import { fmtDate, parseISO, TODAY } from '../../lib/dates';
import { priorityColor, taskStatusColor } from '../../lib/statusColors';
import { useAccess } from '../../state/access';
import { useApp } from '../../state/AppState';

export function TasksTab({ client }: { client: Client }) {
  const { actions } = useApp();
  const { canWrite } = useAccess();
  const projectKey = taskProjectKey(client.name);

  return (
    <div style={{ marginTop: 20 }}>
      {canWrite && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Button variant="secondary" size="sm" onClick={() => actions.openAddTask(client.id)}>
            + Add task
          </Button>
        </div>
      )}
      <div className="card">
        {client.tasks.map((t, i) => {
          const done = t.status === 'Done';
          const overdue = !done && !!t.dueDate && parseISO(t.dueDate) < TODAY;
          const attachments = t.attachments ?? [];
          return (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: 'var(--row-pad)',
                borderBottom: '1px solid var(--border-2)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--ink-3)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {projectKey}-{i + 1}
                  </span>
                  <Chip color="purple">Task</Chip>
                </div>
                <span
                  onClick={() => actions.openTaskPreview(client.id, t)}
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: done ? 'var(--ink-3)' : 'var(--ink-1)',
                    textDecoration: done ? 'line-through' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {t.title}
                </span>
                {t.description && (
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.4 }}>
                    {t.description}
                  </div>
                )}
                {attachments.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <AttachmentList attachments={attachments} />
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  flexShrink: 0,
                  paddingTop: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
                  <Avatar initials={(t.assignee || '?')[0]} size={20} />
                  <span style={{ fontSize: 12, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                    {t.assignee}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 60 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: priorityColor(t.priority),
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                    {t.priority}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: overdue ? 'var(--danger)' : 'var(--ink-3)',
                    minWidth: 76,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.dueDate ? fmtDate(t.dueDate) : 'No due date'}
                </span>
                {canWrite ? (
                  <>
                    <TaskStatusSelect
                      status={t.status}
                      onChange={(status) => actions.setTaskStatus(client.id, t.id, status)}
                    />
                    <TrashButton onClick={() => actions.removeTask(client.id, t.id)} />
                  </>
                ) : (
                  <Chip color={taskStatusColor(t.status)}>{t.status}</Chip>
                )}
              </div>
            </div>
          );
        })}
        {client.tasks.length === 0 && <EmptyRow>No tasks yet — add one above.</EmptyRow>}
      </div>
    </div>
  );
}
