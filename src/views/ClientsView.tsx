import { ArchivedList } from '../components/ArchivedList';
import {
  PageHeader,
  RowAction,
  SearchField,
  SegmentedControl,
  Select,
  ShowMore,
  TableHead,
  useWindowed,
} from '../components/ui';
import { HEALTH_OPTIONS } from '../data/options';
import type { Health } from '../data/types';
import { Avatar } from '../ds/Avatar';
import { Chip } from '../ds/Chip';
import { billingShort, fmtDate } from '../lib/dates';
import { invoiceBalance } from '../lib/invoices';
import { fmtMoney } from '../lib/money';
import { healthColor, stageColor } from '../lib/statusColors';
import { useAccess } from '../state/access';
import { useApp, type SortBy } from '../state/AppState';

const HEALTH_ORDER: Record<Health, number> = { 'At Risk': 0, Active: 1, Churned: 2 };

/** Accounts whose health this user was not sent sort last rather than first. */
function healthRank(h: Health | undefined): number {
  return h ? HEALTH_ORDER[h] : Object.keys(HEALTH_ORDER).length;
}

export function ClientsView() {
  const { state, actions } = useApp();
  const { showInvoiceStats, canWrite } = useAccess();

  const gridTemplateColumns = showInvoiceStats
    ? '1.8fr 1fr 1.1fr 1fr 1fr 1fr 1fr'
    : '1.8fr 1fr 1.1fr 1fr 1fr';

  let rows = state.clients.map((c) => ({
    client: c,
    outstanding: c.invoices.reduce((a, i) => a + invoiceBalance(i), 0),
  }));

  const q = state.search.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (r) =>
        r.client.name.toLowerCase().includes(q) ||
        (r.client.industry ?? '').toLowerCase().includes(q),
    );
  }
  if (state.healthFilter !== 'all') rows = rows.filter((r) => r.client.health === state.healthFilter);
  rows.sort((a, b) =>
    state.sortBy === 'value'
      ? (b.client.contractValue ?? 0) - (a.client.contractValue ?? 0)
      : state.sortBy === 'health'
        ? healthRank(a.client.health) - healthRank(b.client.health)
        : a.client.name.localeCompare(b.client.name),
  );

  const total = state.clients.length;
  const window = useWindowed(rows);

  return (
    <div className="page">
      <PageHeader
        title="Clients"
        subtitle={`${total} account${total === 1 ? '' : 's'} under management`}
        action={
          canWrite && (
            <button type="button" className="btn btn--primary" onClick={actions.openAddClient}>
              <img src="/assets/icons/add-square.svg" width={16} height={16} className="icon-invert" alt="" />
              Add client
            </button>
          )
        }
      />

      {/*
        Deleting a client hides it rather than destroying it, so this is where
        it goes and where it comes back from. Under the old behaviour one click
        took the account and everything under it — invoices, contacts,
        deliverables, documents, tasks — with nothing to undo it.
      */}
      <SegmentedControl<'active' | 'archived'>
        label="Which accounts to show"
        value={state.clientsTab}
        onChange={actions.setClientsTab}
        options={[
          { value: 'active', label: `Active (${total})` },
          { value: 'archived', label: 'Archived' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {state.clientsTab === 'archived' ? (
        <ArchivedList
          rows={state.archived.filter((a) => a.type === 'clients')}
          loading={state.archivedLoading}
          canWrite={canWrite}
          empty="Nothing archived. Deleted accounts appear here."
          onRestore={actions.restoreArchived}
        />
      ) : (
      <>
      <div className="filter-row">
        <SearchField
          value={state.search}
          onChange={actions.setSearch}
          placeholder="Search clients, industries…"
        />
        <Select<Health | 'all'>
          label="Filter by health"
          value={state.healthFilter}
          onChange={actions.setHealthFilter}
          options={[{ value: 'all', label: 'All health' }, ...HEALTH_OPTIONS]}
        />
        <Select<SortBy>
          label="Sort clients by"
          value={state.sortBy}
          onChange={actions.setSortBy}
          options={[
            { value: 'name', label: 'Sort: Name' },
            { value: 'value', label: 'Sort: Contract value' },
            { value: 'health', label: 'Sort: Health' },
          ]}
        />
      </div>

      <div className="card card--clip">
        <TableHead
          gridTemplateColumns={gridTemplateColumns}
          columns={[
            'Client',
            'Health',
            'Owner',
            'Stage',
            ...(showInvoiceStats ? ['Contract value', 'Outstanding'] : []),
            'Since',
          ]}
        />
        {window.visible.map(({ client, outstanding }) => (
          <div
            key={client.id}
            className="table-row table-row--click"
            style={{ display: 'grid', gridTemplateColumns }}
            onClick={() => actions.openClient(client.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <Avatar initials={client.name[0]} size={30} />
              <div style={{ minWidth: 0 }}>
                {/* The row keeps its click for the mouse; this is what a
                    keyboard reaches and what a screen reader announces. */}
                <RowAction
                  onClick={() => actions.openClient(client.id)}
                  style={{ fontWeight: 600 }}
                  label={`Open ${client.name}`}
                >
                  {client.name}
                </RowAction>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{client.industry}</div>
              </div>
            </div>
            <div>
              <Chip color={healthColor(client.health)}>{client.health}</Chip>
            </div>
            <div>{client.owner}</div>
            <div>
              <Chip color={stageColor(client.stage)}>{client.stage}</Chip>
            </div>
            {showInvoiceStats && (
              <>
                <div>
                  {fmtMoney(client.contractValue, client.currency)}
                  {client.billingCycle && (
                    <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
                      {' '}
                      /{billingShort(client.billingCycle)}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    color: outstanding > 0 ? 'var(--danger)' : 'var(--ink-3)',
                    fontWeight: 600,
                  }}
                >
                  {outstanding > 0 ? fmtMoney(outstanding, client.currency) : '—'}
                </div>
              </>
            )}
            <div style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{fmtDate(client.startDate)}</div>
          </div>
        ))}
        <ShowMore hidden={window.hidden} onShowMore={window.showMore} />
      </div>
      </>
      )}
    </div>
  );
}
