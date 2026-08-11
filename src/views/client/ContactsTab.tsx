import { EmptyRow, TableHead } from '../../components/ui';
import type { Client } from '../../data/types';
import { Button } from '../../ds/Button';
import { TrashButton } from '../../ds/Icon';
import { useApp } from '../../state/AppState';

const GRID = '1.2fr 1fr 1.4fr 1fr 40px';

export function ContactsTab({ client }: { client: Client }) {
  const { actions } = useApp();

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="secondary" size="sm" onClick={() => actions.openAddContact(client.id)}>
          + Add contact
        </Button>
      </div>
      <div className="card card--clip">
        <TableHead
          gridTemplateColumns={GRID}
          columns={['Name', 'Role', 'Email', 'Phone', '']}
        />
        {client.contacts.map((ct) => (
          <div
            key={ct.id}
            className="table-row"
            style={{ display: 'grid', gridTemplateColumns: GRID }}
          >
            <span style={{ fontWeight: 600 }}>{ct.name}</span>
            <span>{ct.role}</span>
            <span>
              <a href={`mailto:${ct.email}`}>{ct.email}</a>
            </span>
            <span>{ct.phone}</span>
            <TrashButton onClick={() => actions.removeItem('contacts', client.id, ct.id)} />
          </div>
        ))}
        {client.contacts.length === 0 && <EmptyRow>No contacts added yet.</EmptyRow>}
      </div>
    </div>
  );
}
