import { EmptyRow, TableHead } from '../../components/ui';
import type { Client } from '../../data/types';
import { Button } from '../../ds/Button';
import { Chip } from '../../ds/Chip';
import { Icon, TrashButton } from '../../ds/Icon';
import { fmtDate } from '../../lib/dates';
import { isDeliverableOverdue } from '../../lib/invoices';
import { deliverableStatusColor } from '../../lib/statusColors';
import { useApp } from '../../state/AppState';

const GRID = '2fr 1fr 1fr 1.2fr 40px';

export function DeliverablesTab({ client }: { client: Client }) {
  const { actions } = useApp();

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="secondary" size="sm" onClick={() => actions.openAddDeliverable(client.id)}>
          + Add deliverable
        </Button>
      </div>
      <div className="card card--clip">
        <TableHead
          gridTemplateColumns={GRID}
          columns={['Deliverable', 'Owner', 'Due', 'Status', '']}
        />
        {client.deliverables.map((d) => (
          <div
            key={d.id}
            className="table-row"
            style={{ display: 'grid', gridTemplateColumns: GRID }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{d.title}</div>
              {d.description && (
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{d.description}</div>
              )}
              {d.file ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <Icon name="document" size={13} />
                  <a
                    href={d.file.url || '#'}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, fontWeight: 500 }}
                  >
                    {d.file.name}
                  </a>
                  <span
                    onClick={() => actions.openAttachFile(client.id, d.id, d.file)}
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    edit
                  </span>
                </div>
              ) : (
                <div
                  onClick={() => actions.openAttachFile(client.id, d.id, null)}
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-3)',
                    marginTop: 6,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  + Attach delivered file
                </div>
              )}
            </div>
            <span>{d.owner}</span>
            <span>{fmtDate(d.dueDate)}</span>
            {/* Clicking the status advances it: Not started → In progress → Done. */}
            <span
              style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}
              onClick={() => actions.cycleDeliverable(client.id, d.id)}
            >
              <Chip color={deliverableStatusColor(d.status)}>{d.status}</Chip>
              {isDeliverableOverdue(d) && <Chip color="red">Overdue</Chip>}
            </span>
            <TrashButton onClick={() => actions.removeItem('deliverables', client.id, d.id)} />
          </div>
        ))}
        {client.deliverables.length === 0 && <EmptyRow>No deliverables tracked yet.</EmptyRow>}
      </div>
    </div>
  );
}
