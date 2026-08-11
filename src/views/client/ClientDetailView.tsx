import type { Client, ClientTabId } from '../../data/types';
import { Avatar } from '../../ds/Avatar';
import { Button } from '../../ds/Button';
import { Chip } from '../../ds/Chip';
import { Icon } from '../../ds/Icon';
import { MetaCell } from '../../components/ui';
import { currentBillingPeriod, cyclePeriodLabel, fmtDate, fmtDateObj, parseISO, TODAY } from '../../lib/dates';
import { invoiceBalance, invoicePaidAmount } from '../../lib/invoices';
import { fmtMoney } from '../../lib/money';
import { healthColor, stageColor } from '../../lib/statusColors';
import { useAccess } from '../../state/access';
import { useApp } from '../../state/AppState';
import { ActivityTab } from './ActivityTab';
import { ContactsTab } from './ContactsTab';
import { DeliverablesTab } from './DeliverablesTab';
import { DocumentsTab } from './DocumentsTab';
import { InvoicesTab } from './InvoicesTab';
import { OverviewTab } from './OverviewTab';
import { TasksTab } from './TasksTab';

const TAB_LABELS: Record<ClientTabId, string> = {
  overview: 'Overview',
  contacts: 'Contacts',
  invoices: 'Invoices & Payments',
  deliverables: 'Deliverables',
  documents: 'Documents',
  tasks: 'Tasks',
  activity: 'Activity',
};

export function ClientDetailView({ client }: { client: Client }) {
  const { state, actions } = useApp();
  const { showInvoiceStats, visibleClientTabs, canWrite } = useAccess();

  // A restricted teammate previewing the account falls back to Overview rather
  // than seeing an empty tab.
  const activeTab: ClientTabId = visibleClientTabs.includes(state.clientTabId)
    ? state.clientTabId
    : 'overview';

  const outstanding = client.invoices.reduce((a, i) => a + invoiceBalance(i), 0);
  const openDeliverableCount = client.deliverables.filter((d) => d.status !== 'Done').length;

  const period = currentBillingPeriod(client.startDate, client.billingCycle);
  const paidThisPeriod = client.invoices
    .filter((i) => parseISO(i.issueDate) >= period.start && parseISO(i.issueDate) < period.end)
    .reduce((a, i) => a + invoicePaidAmount(i), 0);
  const daysUntilNextBilling = Math.round((period.end.getTime() - TODAY.getTime()) / 86400000);
  const billingSoon = daysUntilNextBilling <= 7;
  const isOneTime = client.billingCycle === 'One-time';

  const metaCols = showInvoiceStats ? 'repeat(4,1fr)' : 'repeat(2,1fr)';

  return (
    <div className="page">
      <div
        onClick={actions.goClients}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--ink-3)',
          fontSize: 13,
          cursor: 'pointer',
          marginBottom: 16,
        }}
      >
        <Icon name="arrow-left" size={14} />
        All clients
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Avatar initials={client.name[0]} size={48} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 700,
                  fontSize: 26,
                  letterSpacing: '-0.01em',
                }}
              >
                {client.name}
              </div>
              <Chip color={healthColor(client.health)}>{client.health}</Chip>
              <Chip color={stageColor(client.stage)}>{client.stage}</Chip>
            </div>
            <div style={{ color: 'var(--ink-3)', fontSize: 13.5, marginTop: 4 }}>
              {client.industry} · Client since {fmtDate(client.startDate)} ·{' '}
              {client.paymentTerms || 'Net 30'}
              {client.contractEndDate && <> · Renews {fmtDate(client.contractEndDate)}</>}
              {client.website && (
                <>
                  {' '}
                  ·{' '}
                  <a href={client.website} target="_blank" rel="noreferrer">
                    {client.website}
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
        {canWrite && (
          <Button variant="secondary" size="md" onClick={() => actions.openEditClient(client)}>
            Edit client
          </Button>
        )}
      </div>

      <div
        className="card card--clip"
        style={{ display: 'grid', gridTemplateColumns: metaCols, gap: 0, marginTop: 24 }}
      >
        <MetaCell label="Account owner" style={{ padding: '16px 20px', borderRight: '1px solid var(--border-2)' }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, marginTop: 6 }}>
            {client.owner}
          </div>
        </MetaCell>
        {showInvoiceStats && (
          <>
            <MetaCell
              label="Contract value"
              style={{ padding: '16px 20px', borderRight: '1px solid var(--border-2)' }}
            >
              <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, marginTop: 6 }}>
                {fmtMoney(client.contractValue, client.currency)} / {client.billingCycle}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>
                Paid {cyclePeriodLabel(client.billingCycle)}:{' '}
                {fmtMoney(paidThisPeriod, client.currency)}
              </div>
              {!isOneTime && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: billingSoon ? 'var(--warning)' : 'var(--ink-4)',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11.5,
                      color: billingSoon ? 'var(--ink-1)' : 'var(--ink-3)',
                    }}
                  >
                    Next billing {fmtDateObj(period.end)} ({daysUntilNextBilling}d)
                  </span>
                </div>
              )}
            </MetaCell>
            <MetaCell
              label="Outstanding balance"
              style={{ padding: '16px 20px', borderRight: '1px solid var(--border-2)' }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 600,
                  fontSize: 14,
                  marginTop: 6,
                  color: outstanding > 0 ? 'var(--danger)' : 'var(--ink-1)',
                }}
              >
                {fmtMoney(outstanding, client.currency)}
              </div>
            </MetaCell>
          </>
        )}
        <MetaCell label="Open deliverables" style={{ padding: '16px 20px' }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, marginTop: 6 }}>
            {openDeliverableCount}
          </div>
        </MetaCell>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 24,
          borderBottom: '1px solid var(--border-2)',
          marginTop: 28,
        }}
      >
        {visibleClientTabs.map((id) => {
          const active = activeTab === id;
          return (
            <div
              key={id}
              onClick={() => actions.setClientTab(id)}
              style={{
                padding: '12px 2px',
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--ink-1)' : 'var(--ink-3)',
                borderBottom: active ? '2px solid var(--phot-purple)' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {TAB_LABELS[id]}
            </div>
          );
        })}
      </div>

      {activeTab === 'overview' && <OverviewTab client={client} />}
      {activeTab === 'contacts' && <ContactsTab client={client} />}
      {activeTab === 'invoices' && <InvoicesTab client={client} />}
      {activeTab === 'deliverables' && <DeliverablesTab client={client} />}
      {activeTab === 'documents' && <DocumentsTab client={client} />}
      {activeTab === 'tasks' && <TasksTab client={client} />}
      {activeTab === 'activity' && <ActivityTab client={client} />}
    </div>
  );
}
