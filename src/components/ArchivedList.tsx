import type { ArchivedRecord } from '../data/types';
import { fmtDate } from '../lib/dates';
import { Button } from '../ds/Button';
import { EmptyRow, TableHead } from './ui';

/**
 * What has been deleted, and how to get it back.
 *
 * The same list on the Clients screen and inside a client, because "deleted"
 * means the same thing everywhere: hidden, not destroyed. Showing when
 * something was archived rather than just that it was matters — it is usually
 * how you recognise the one you meant, when three things share a name.
 */
export function ArchivedList({
  rows,
  loading,
  canWrite,
  empty,
  onRestore,
  showKind = false,
}: {
  rows: ArchivedRecord[];
  loading: boolean;
  canWrite: boolean;
  empty: string;
  onRestore: (type: string, id: string) => void;
  /** Set when the list mixes invoices, tasks and documents together. */
  showKind?: boolean;
}) {
  const grid = showKind ? '1.4fr 1fr 1fr 120px' : '2fr 1fr 120px';

  return (
    <div className="card card--clip">
      <TableHead
        gridTemplateColumns={grid}
        columns={[...(showKind ? ['Kind'] : []), 'Name', 'Archived', '']}
      />
      {loading && <EmptyRow>Loading…</EmptyRow>}
      {!loading && rows.length === 0 && <EmptyRow>{empty}</EmptyRow>}
      {!loading &&
        rows.map((row) => (
          <div
            key={`${row.type}-${row.id}`}
            className="table-row"
            style={{ display: 'grid', gridTemplateColumns: grid, alignItems: 'center' }}
          >
            {showKind && <span style={{ color: 'var(--ink-3)' }}>{KIND_LABELS[row.type] ?? row.type}</span>}
            <span style={{ fontWeight: 600 }}>
              {row.label || '(no name)'}
              {/* On the workspace-wide list, which account this belonged to is
                  most of what identifies it. */}
              {!showKind && row.clientName && (
                <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> · {row.clientName}</span>
              )}
            </span>
            <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
              {fmtDate(row.archivedAt.slice(0, 10))}
            </span>
            <span style={{ textAlign: 'right' }}>
              {canWrite && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onRestore(row.type, row.id)}
                  ariaLabel={`Restore ${row.label}`}
                >
                  Restore
                </Button>
              )}
            </span>
          </div>
        ))}
    </div>
  );
}

const KIND_LABELS: Record<string, string> = {
  clients: 'Client',
  contacts: 'Contact',
  invoices: 'Invoice',
  deliverables: 'Deliverable',
  documents: 'Document',
  tasks: 'Task',
  follow_ups: 'Follow-up',
};
