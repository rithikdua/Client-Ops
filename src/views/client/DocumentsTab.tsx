import { EmptyRow, TableHead } from '../../components/ui';
import type { Client } from '../../data/types';
import { Button } from '../../ds/Button';
import { Chip } from '../../ds/Chip';
import { Icon, TrashButton } from '../../ds/Icon';
import { fmtDate } from '../../lib/dates';
import { useApp } from '../../state/AppState';

const GRID = '2fr 0.85fr 1fr 0.9fr 32px';

export function DocumentsTab({ client }: { client: Client }) {
  const { actions } = useApp();

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="secondary" size="sm" onClick={() => actions.openAddDocument(client.id)}>
          + Add document
        </Button>
      </div>
      <div className="card card--clip">
        <TableHead
          gridTemplateColumns={GRID}
          columnGap={12}
          columns={['Document', 'Type', 'Source', 'Added', '']}
        />
        {client.documents.map((doc) => (
          <div
            key={doc.id}
            className="table-row"
            style={{ display: 'grid', gridTemplateColumns: GRID, columnGap: 12 }}
          >
            <a
              href={doc.url || undefined}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minWidth: 0,
                color: doc.url ? 'var(--phot-purple)' : 'var(--ink-1)',
                cursor: doc.url ? 'pointer' : 'default',
                textDecoration: 'none',
              }}
            >
              <Icon name="document" size={15} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {doc.name}
              </span>
            </a>
            <div>
              <Chip color="grey">{doc.type}</Chip>
            </div>
            <div>
              <Chip color={doc.source === 'client' ? 'amber' : 'purple'}>
                {doc.source === 'client' ? 'From client' : 'From us'}
              </Chip>
            </div>
            <span style={{ whiteSpace: 'nowrap', color: 'var(--ink-3)' }}>{fmtDate(doc.date)}</span>
            <TrashButton onClick={() => actions.removeItem('documents', client.id, doc.id)} />
          </div>
        ))}
        {client.documents.length === 0 && <EmptyRow>No documents on file.</EmptyRow>}
      </div>
    </div>
  );
}
