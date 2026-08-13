import { EmptyRow, PageHeader, TableHead } from '../components/ui';
import type { Client, ClientDocument } from '../data/types';
import { Chip } from '../ds/Chip';
import { Icon } from '../ds/Icon';
import { fmtDate } from '../lib/dates';
import { useAccess } from '../state/access';
import { useApp } from '../state/AppState';

const GRID = '1.4fr 1.8fr 1fr 1fr';

export function DocumentsView() {
  const { state, actions } = useApp();
  const { canOpenClients } = useAccess();

  const rows: { client: Client; doc: ClientDocument }[] = [];
  state.clients.forEach((c) => c.documents.forEach((doc) => rows.push({ client: c, doc })));
  rows.sort((a, b) => b.doc.date.localeCompare(a.doc.date));

  return (
    <div className="page">
      <PageHeader
        title="Documents"
        subtitle="Every contract and file across every account. Click a row to open that client."
      />

      <div className="card card--clip">
        <TableHead gridTemplateColumns={GRID} columns={['Client', 'Document', 'Type', 'Added']} />
        {rows.map(({ client, doc }) => (
          <div
            key={doc.id}
            className={canOpenClients ? 'table-row table-row--click' : 'table-row'}
            style={{ display: 'grid', gridTemplateColumns: GRID }}
            onClick={canOpenClients ? () => actions.openClientTab(client.id, 'documents') : undefined}
          >
            <span style={{ fontWeight: 600 }}>{client.name}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="document" size={15} />
              {doc.name}
            </span>
            <span>
              <Chip color="grey">{doc.type}</Chip>
            </span>
            <span>{fmtDate(doc.date)}</span>
          </div>
        ))}
        {rows.length === 0 && <EmptyRow>No documents on file.</EmptyRow>}
      </div>
    </div>
  );
}
