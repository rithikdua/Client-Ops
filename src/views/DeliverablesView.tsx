import { EmptyRow, PageHeader, RowAction, Select, TableHead } from '../components/ui';
import type { Client, Deliverable, DeliverableStatus } from '../data/types';
import { Chip } from '../ds/Chip';
import { fmtDate } from '../lib/dates';
import { isDeliverableOverdue } from '../lib/invoices';
import { deliverableStatusColor } from '../lib/statusColors';
import { useAccess } from '../state/access';
import { useApp, type DeliverableSortBy } from '../state/AppState';

const GRID = '1.4fr 1.6fr 1fr 1fr 1.2fr';
const STATUS_ORDER: Record<DeliverableStatus, number> = {
  'In progress': 0,
  'Not started': 1,
  Done: 2,
};

export function DeliverablesView() {
  const { state, actions } = useApp();
  const { canOpenClients } = useAccess();

  const rows: { client: Client; deliverable: Deliverable; sortKey: string }[] = [];
  state.clients.forEach((c) =>
    c.deliverables.forEach((d) =>
      rows.push({ client: c, deliverable: d, sortKey: (d.status === 'Done' ? 1 : 0) + d.dueDate }),
    ),
  );

  const sorted = rows.slice();
  if (state.deliverableSortBy === 'status') {
    sorted.sort(
      (a, b) =>
        STATUS_ORDER[a.deliverable.status] - STATUS_ORDER[b.deliverable.status] ||
        a.deliverable.dueDate.localeCompare(b.deliverable.dueDate),
    );
  } else if (state.deliverableSortBy === 'client') {
    sorted.sort((a, b) => a.client.name.localeCompare(b.client.name));
  } else if (state.deliverableSortBy === 'owner') {
    sorted.sort((a, b) => a.deliverable.owner.localeCompare(b.deliverable.owner));
  } else {
    sorted.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }

  return (
    <div className="page">
      <PageHeader
        title="Deliverables"
        subtitle="Every commitment across every account. Click a row to open that client."
        align="flex-end"
        action={
          <Select<DeliverableSortBy>
            label="Sort deliverables by"
            value={state.deliverableSortBy}
            onChange={actions.setDeliverableSortBy}
            options={[
              { value: 'due', label: 'Sort: Due date' },
              { value: 'status', label: 'Sort: Status' },
              { value: 'client', label: 'Sort: Client' },
              { value: 'owner', label: 'Sort: Owner' },
            ]}
          />
        }
      />

      <div className="card card--clip">
        <TableHead
          gridTemplateColumns={GRID}
          columns={['Client', 'Deliverable', 'Owner', 'Due', 'Status']}
        />
        {sorted.map(({ client, deliverable: d }) => (
          <div
            key={d.id}
            className={canOpenClients ? 'table-row table-row--click' : 'table-row'}
            style={{ display: 'grid', gridTemplateColumns: GRID }}
            onClick={canOpenClients ? () => actions.openClientTab(client.id, 'deliverables') : undefined}
          >
            <span style={{ fontWeight: 600 }}>
              {canOpenClients ? (
                <RowAction
                  onClick={() => actions.openClientTab(client.id, 'deliverables')}
                  label={`Open ${client.name}, deliverables`}
                >
                  {client.name}
                </RowAction>
              ) : (
                client.name
              )}
            </span>
            <span>{d.title}</span>
            <span>{d.owner}</span>
            <span>{fmtDate(d.dueDate)}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Chip color={deliverableStatusColor(d.status)}>{d.status}</Chip>
              {isDeliverableOverdue(d) && <Chip color="red">Overdue</Chip>}
            </span>
          </div>
        ))}
        {sorted.length === 0 && <EmptyRow>No deliverables tracked yet.</EmptyRow>}
      </div>
    </div>
  );
}
