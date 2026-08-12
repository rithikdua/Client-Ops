import { Avatar } from '../ds/Avatar';
import { Chip, type ChipColor } from '../ds/Chip';
import { PageHeader, StatCard } from '../components/ui';
import { addDays, fmtDate, parseISO, TODAY } from '../lib/dates';
import { invoiceBalance, isDeliverableOverdue, isInvoiceOverdue } from '../lib/invoices';
import { fmtMoney } from '../lib/money';
import { useAccess } from '../state/access';
import { useApp } from '../state/AppState';
import { useFollowUpRows } from '../state/derive';

export function OverviewView() {
  const { state, actions } = useApp();
  const { showInvoiceStats, canWrite, access } = useAccess();
  const { pending: pendingFollowUps } = useFollowUpRows();
  const clients = state.clients;

  const withOutstanding = clients.map((c) => ({
    c,
    outstanding: c.invoices.reduce((a, i) => a + invoiceBalance(i), 0),
    overdueInv: c.invoices.filter(isInvoiceOverdue).length,
    overdueDel: c.deliverables.filter(isDeliverableOverdue).length,
  }));

  const totalCount = clients.length;
  const activeCount = clients.filter((c) => c.health === 'Active').length;
  const atRiskCount = clients.filter((c) => c.health === 'At Risk').length;
  const totalOutstanding = withOutstanding.reduce((a, x) => a + x.outstanding, 0);
  const overdueInvoiceCount = withOutstanding.reduce((a, x) => a + x.overdueInv, 0);
  const overdueDelCount = withOutstanding.reduce((a, x) => a + x.overdueDel, 0);
  const in14 = addDays(TODAY, 14);
  const dueSoonCount = clients.reduce(
    (a, c) => a + c.deliverables.filter((d) => d.status !== 'Done' && parseISO(d.dueDate) <= in14).length,
    0,
  );

  const weekAgo = addDays(TODAY, -7);
  const monthAgo = addDays(TODAY, -30);
  const in30 = addDays(TODAY, 30);
  const newThisWeek = clients.filter((c) => parseISO(c.startDate) >= weekAgo).length;
  const newThisMonth = clients.filter((c) => parseISO(c.startDate) >= monthAgo).length;
  const upcomingRenewals = clients.filter(
    (c) => c.contractEndDate && parseISO(c.contractEndDate) >= TODAY && parseISO(c.contractEndDate) <= in30,
  ).length;
  const portfolioValue = clients.reduce((a, c) => a + (c.contractValue || 0), 0);
  const onboardingCount = clients.filter((c) => c.stage === 'Onboarding').length;

  const needsAttention = withOutstanding.filter(
    (x) => x.c.health === 'At Risk' || x.overdueInv > 0 || x.overdueDel > 0,
  );

  const recentActivity = clients
    .flatMap((c) =>
      c.activity.map((a) => ({
        clientName: c.name,
        date: a.date,
        note: a.note,
        isSystem: a.kind === 'system',
      })),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  // Cards are dropped, not zeroed, when their data is withheld.
  const showDeliverables = !!access.deliverables;
  const canOpenClients = !!access.clients;
  const primaryCards = 2 + (showInvoiceStats ? 1 : 0) + (showDeliverables ? 1 : 0);
  const statsCols = `repeat(${primaryCards},minmax(0,1fr))`;
  const secondaryCols = showInvoiceStats ? 'repeat(5,minmax(0,1fr))' : 'repeat(4,minmax(0,1fr))';

  return (
    <div className="page">
      <PageHeader
        title="Client Ops overview"
        subtitle="A single view of every B2B account — contracts, invoices, deliverables and activity."
        marginBottom={24}
        action={
          canWrite && (
            <button type="button" className="btn btn--primary" onClick={actions.openAddClient}>
              <img src="/assets/icons/add-square.svg" width={16} height={16} className="icon-invert" alt="" />
              Add client
            </button>
          )
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: statsCols, gap: 16 }}>
        <StatCard
          label="Active clients"
          value={activeCount}
          chip={<Chip color="green">of {totalCount} accounts</Chip>}
        />
        <StatCard
          label="Accounts at risk"
          value={atRiskCount}
          chip={<Chip color={atRiskCount > 0 ? 'amber' : 'green'}>needs attention</Chip>}
        />
        {showInvoiceStats && (
          <StatCard
            label="Outstanding balance"
            value={fmtMoney(totalOutstanding)}
            chip={
              <Chip color={overdueInvoiceCount > 0 ? 'red' : 'green'}>
                {overdueInvoiceCount} overdue
              </Chip>
            }
          />
        )}
        {showDeliverables && (
          <StatCard
            label="Deliverables due (14d)"
            value={dueSoonCount}
            chip={<Chip color={overdueDelCount > 0 ? 'red' : 'green'}>{overdueDelCount} overdue</Chip>}
          />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: secondaryCols, gap: 16, marginTop: 16 }}>
        <StatCard label="New this week" value={newThisWeek} small />
        <StatCard label="New this month" value={newThisMonth} small />
        <StatCard label="Renewals due (30d)" value={upcomingRenewals} small />
        <StatCard label="In onboarding" value={onboardingCount} small />
        {showInvoiceStats && (
          <StatCard label="Total portfolio value" value={fmtMoney(portfolioValue)} small />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, marginTop: 24 }}>
        <div className="card card--clip">
          <div className="card-head card-title">Needs attention</div>
          {needsAttention.map((x) => {
            const reasons: { label: string; color: ChipColor }[] = [];
            if (x.c.health === 'At Risk') reasons.push({ label: 'At risk', color: 'amber' });
            if (x.overdueInv > 0)
              reasons.push({ label: x.overdueInv + ' invoice overdue', color: 'red' });
            if (x.overdueDel > 0)
              reasons.push({ label: x.overdueDel + ' deliverable overdue', color: 'red' });
            return (
              <div
                key={x.c.id}
                onClick={canOpenClients ? () => actions.openClient(x.c.id) : undefined}
                style={{
                  padding: 'var(--row-pad)',
                  borderBottom: '1px solid var(--border-2)',
                  cursor: canOpenClients ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar initials={x.c.name[0]} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13.5 }}>
                      {x.c.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{x.c.industry}</div>
                  </div>
                </div>
                <div
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 44, marginTop: 8 }}
                >
                  {reasons.map((r) => (
                    <Chip key={r.label} color={r.color}>
                      {r.label}
                    </Chip>
                  ))}
                </div>
              </div>
            );
          })}
          {needsAttention.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>
              Every account is on track.
            </div>
          )}
        </div>

        <div className="card card--clip">
          <div className="card-head card-title">Recent activity</div>
          {recentActivity.map((act, i) => (
            <div
              key={i}
              style={{ padding: 'var(--row-pad)', borderBottom: '1px solid var(--border-2)' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 12,
                  color: 'var(--ink-3)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{act.clientName}</span>
                  {act.isSystem && <SystemTag />}
                </span>
                <span>{fmtDate(act.date)}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-1)', marginTop: 4, lineHeight: 1.4 }}>
                {act.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card--clip" style={{ marginTop: 20 }}>
        <div
          className="card-head"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <div className="card-title">Upcoming follow-ups</div>
          <span
            onClick={() => actions.goTo('followups')}
            style={{ fontSize: 12.5, color: 'var(--phot-purple)', cursor: 'pointer' }}
          >
            View all {pendingFollowUps.length}
          </span>
        </div>
        {pendingFollowUps.slice(0, 5).map((row) => (
          <div
            key={row.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 'var(--row-pad)',
              borderBottom: '1px solid var(--border-2)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{row.name}</span>
              <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}> · {row.clientName}</span>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>{row.reason}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 12 }}>
              <div style={{ fontSize: 12, color: row.dueColor }}>{row.dueDateFormatted}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{row.owner}</div>
            </div>
          </div>
        ))}
        {pendingFollowUps.length === 0 && (
          <div style={{ padding: '24px 20px', color: 'var(--ink-3)', fontSize: 13.5 }}>
            No pending follow-ups.
          </div>
        )}
      </div>
    </div>
  );
}

/** Marks an activity entry as auto-logged rather than hand-written. */
export function SystemTag() {
  return (
    <span
      style={{
        fontSize: 10.5,
        color: 'var(--ink-3)',
        background: 'var(--surface-2)',
        borderRadius: 4,
        padding: '1px 6px',
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      SYSTEM
    </span>
  );
}
