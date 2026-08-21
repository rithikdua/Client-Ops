import { EmptyRow, TableHead } from '../../components/ui';
import { DELIVERABLE_CYCLE } from '../../data/options';
import type { Client } from '../../data/types';
import { Button } from '../../ds/Button';
import { Chip } from '../../ds/Chip';
import { Icon, TrashButton } from '../../ds/Icon';
import { fmtDate } from '../../lib/dates';
import { isDeliverableOverdue } from '../../lib/invoices';
import { deliverableStatusColor } from '../../lib/statusColors';
import { safeHref } from '../../lib/urls';
import { useAccess } from '../../state/access';
import { useApp } from '../../state/AppState';

const GRID = '2fr 1fr 1fr 1.2fr 40px';

export function DeliverablesTab({ client }: { client: Client }) {
  const { actions } = useApp();
  const { canWrite } = useAccess();

  return (
    <div style={{ marginTop: 20 }}>
      {canWrite && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Button variant="secondary" size="sm" onClick={() => actions.openAddDeliverable(client.id)}>
            + Add deliverable
          </Button>
        </div>
      )}
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
                    href={safeHref(d.file.url)}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ fontSize: 12, fontWeight: 500 }}
                  >
                    {d.file.name}
                  </a>
                  {canWrite && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => actions.openAttachFile(client.id, d.id, d.file)}
                      aria-label={`Change the file attached to ${d.title}`}
                      style={{
                        fontSize: 11,
                        fontWeight: 400,
                        color: 'var(--ink-3)',
                        textDecoration: 'underline',
                      }}
                    >
                      edit
                    </button>
                  )}
                </div>
              ) : (
                canWrite && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => actions.openAttachFile(client.id, d.id, null)}
                    aria-label={`Attach the delivered file for ${d.title}`}
                    style={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: 'var(--ink-3)',
                      marginTop: 6,
                      textDecoration: 'underline',
                    }}
                  >
                    + Attach delivered file
                  </button>
                )
              )}
            </div>
            <span>{d.owner}</span>
            <span>{fmtDate(d.dueDate)}</span>
            {/* Clicking the status advances it: Not started → In progress → Done.
                Nothing on screen says so, so the button spells out what the next
                press will do rather than just reading out the current status. */}
            {canWrite ? (
              <button
                type="button"
                className="link-button"
                style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}
                onClick={() => actions.cycleDeliverable(client.id, d.id)}
                aria-label={`${d.title} is ${d.status}. Advance to ${DELIVERABLE_CYCLE[d.status]}`}
              >
                <Chip color={deliverableStatusColor(d.status)}>{d.status}</Chip>
                {isDeliverableOverdue(d) && <Chip color="red">Overdue</Chip>}
              </button>
            ) : (
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Chip color={deliverableStatusColor(d.status)}>{d.status}</Chip>
                {isDeliverableOverdue(d) && <Chip color="red">Overdue</Chip>}
              </span>
            )}
            {canWrite ? (
              <TrashButton
                onClick={() => actions.removeItem('deliverables', client.id, d.id)}
                label={`Remove deliverable ${d.title}`}
              />
            ) : (
              <span />
            )}
          </div>
        ))}
        {client.deliverables.length === 0 && <EmptyRow>No deliverables tracked yet.</EmptyRow>}
      </div>
    </div>
  );
}
