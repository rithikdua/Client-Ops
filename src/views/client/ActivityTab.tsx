import type { Client } from '../../data/types';
import { Button } from '../../ds/Button';
import { fmtDate } from '../../lib/dates';
import { useApp } from '../../state/AppState';
import { SystemTag } from '../OverviewView';

export function ActivityTab({ client }: { client: Client }) {
  const { actions } = useApp();
  const activity = [...client.activity].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="secondary" size="sm" onClick={() => actions.openAddActivity(client.id)}>
          + Add note
        </Button>
      </div>
      <div className="card" style={{ padding: '4px 20px' }}>
        {activity.map((act) => (
          <div key={act.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border-2)' }}>
            <div
              style={{
                fontSize: 12,
                color: 'var(--ink-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{act.author}</span> ·{' '}
              {fmtDate(act.date)}
              {act.kind === 'system' && <SystemTag />}
            </div>
            <div style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.45 }}>{act.note}</div>
          </div>
        ))}
        {activity.length === 0 && (
          <div style={{ padding: '24px 0', color: 'var(--ink-3)', fontSize: 13.5 }}>
            No activity logged yet.
          </div>
        )}
      </div>
    </div>
  );
}
