import { EmptyRow, Metric, PageHeader, SearchField, Select, TableHead } from '../components/ui';
import type { Client, CurrencyCode, Invoice } from '../data/types';
import { Chip } from '../ds/Chip';
import { Chevron } from '../ds/Icon';
import { fmtDate, invoicePeriodRange, parseISO, todayISO, type InvoicePeriod } from '../lib/dates';
import { downloadCsv } from '../lib/csv';
import {
  invoiceBalance,
  invoiceBankReceived,
  invoicePaidAmount,
  invoiceStatusLabel,
  invoiceTdsDeducted,
  paidPercent,
  paymentSettled,
} from '../lib/invoices';
import { fmtMoney } from '../lib/money';
import { invoiceStatusColor } from '../lib/statusColors';
import { useAccess } from '../state/access';
import { useApp, type InvoiceStatusFilter } from '../state/AppState';

const GRID = '16px 1.5fr 1.1fr 0.9fr 1fr 0.9fr 1fr';

const PERIOD_OPTIONS: { value: InvoicePeriod; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3', label: 'Last 3 months' },
  { value: 'last_6', label: 'Last 6 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'this_fy', label: 'Current financial year' },
  { value: 'last_fy', label: 'Previous financial year' },
  { value: 'custom', label: 'Custom range' },
];

interface Row {
  invoice: Invoice;
  client: Client;
  currency: CurrencyCode;
  statusLabel: string;
  balance: number;
  sortKey: string;
}

export function InvoicesView() {
  const { state, actions } = useApp();
  const { canOpenClients } = useAccess();

  // The period filter drives the finance summary; the search and status filters
  // narrow only the list below it.
  const period = invoicePeriodRange(state.invoicePeriod, state.invoiceCustomFrom, state.invoiceCustomTo);
  let baseBilled = 0;
  let gstBilled = 0;
  let totalInvoiced = 0;
  let bankReceived = 0;
  let tdsDeducted = 0;
  const inPeriod: Row[] = [];

  state.clients.forEach((c) =>
    c.invoices.forEach((inv) => {
      const issueDate = parseISO(inv.issueDate);
      if (period.start && issueDate < period.start) return;
      if (period.end && issueDate >= period.end) return;
      baseBilled += inv.baseAmount ?? inv.amount;
      gstBilled += inv.gstAmount || 0;
      totalInvoiced += inv.amount;
      bankReceived += invoiceBankReceived(inv);
      tdsDeducted += invoiceTdsDeducted(inv);
      const statusLabel = invoiceStatusLabel(inv);
      inPeriod.push({
        invoice: inv,
        client: c,
        currency: c.currency,
        statusLabel,
        balance: invoiceBalance(inv),
        // Paid invoices sink to the bottom, then order by due date.
        sortKey: (statusLabel === 'Paid' ? 1 : 0) + inv.dueDate,
      });
    }),
  );

  let rows = inPeriod;
  if (state.invoiceStatusFilter !== 'all') {
    rows = rows.filter((r) => r.statusLabel === state.invoiceStatusFilter);
  }
  const q = state.invoiceSearch.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (r) => r.client.name.toLowerCase().includes(q) || r.invoice.number.toLowerCase().includes(q),
    );
  }
  rows = rows.slice().sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const percentRealized =
    totalInvoiced > 0 ? Math.round(((bankReceived + tdsDeducted) / totalInvoiced) * 1000) / 10 : 0;

  const exportCsv = () =>
    downloadCsv(
      'invoices-payments-' + todayISO() + '.csv',
      ['Client', 'Invoice', 'Amount', 'Balance', 'Issued', 'Due', 'Status'],
      rows.map((r) => [
        r.client.name,
        r.invoice.number,
        fmtMoney(r.invoice.amount, r.currency),
        fmtMoney(r.balance, r.currency),
        fmtDate(r.invoice.issueDate),
        fmtDate(r.invoice.dueDate),
        r.statusLabel,
      ]),
    );

  return (
    <div className="page">
      <PageHeader
        title="Invoices &amp; Payments"
        subtitle='Every invoice across every account. Click a row to view its payment history — use "open" to jump to that client.'
        align="flex-end"
        action={
          <button type="button" className="btn btn--secondary" onClick={exportCsv}>
            Download CSV
          </button>
        }
      />

      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 18 }}>
          Finance summary
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 20 }}>
          <Metric label="Base billed" value={fmtMoney(baseBilled)} />
          <Metric label="GST billed" value={fmtMoney(gstBilled)} />
          <Metric label="Total invoiced" value={fmtMoney(totalInvoiced)} />
          <Metric label="Bank cash received" value={fmtMoney(bankReceived)} valueColor="var(--success)" />
          <Metric label="TDS deducted" value={fmtMoney(tdsDeducted)} />
          <Metric
            label="Pending cash due"
            value={fmtMoney(totalInvoiced - bankReceived - tdsDeducted)}
            valueColor="var(--danger)"
            extra={
              <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4, fontWeight: 600 }}>
                ↑ {percentRealized}% realized
              </div>
            }
          />
        </div>
      </div>

      <div className="filter-row">
        <SearchField
          value={state.invoiceSearch}
          onChange={actions.setInvoiceSearch}
          placeholder="Search client or invoice #…"
        />
        <Select<InvoiceStatusFilter>
          value={state.invoiceStatusFilter}
          onChange={actions.setInvoiceStatusFilter}
          options={[
            { value: 'all', label: 'All statuses' },
            'Paid',
            'Partially Paid',
            'Pending',
            'Overdue',
          ]}
        />
        <Select<InvoicePeriod>
          value={state.invoicePeriod}
          onChange={actions.setInvoicePeriod}
          options={PERIOD_OPTIONS}
        />
        {state.invoicePeriod === 'custom' && (
          <>
            <input
              type="date"
              className="date-input"
              value={state.invoiceCustomFrom}
              onChange={(e) => actions.setInvoiceCustomFrom(e.target.value)}
            />
            <input
              type="date"
              className="date-input"
              value={state.invoiceCustomTo}
              onChange={(e) => actions.setInvoiceCustomTo(e.target.value)}
            />
          </>
        )}
      </div>

      <div className="card card--clip">
        <TableHead
          gridTemplateColumns={GRID}
          columns={['', 'Client', 'Invoice', 'Amount', 'Balance', 'Due', 'Status']}
        />
        {rows.map(({ invoice: inv, client, currency, statusLabel, balance }) => {
          const expanded = !!state.expandedInvoices[inv.id];
          const isPartial = statusLabel === 'Partially Paid';
          return (
            <div key={inv.id} style={{ borderBottom: '1px solid var(--border-2)' }}>
              <div
                onClick={() => actions.toggleInvoiceExpand(inv.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID,
                  padding: 'var(--row-pad)',
                  alignItems: 'center',
                  fontSize: 13.5,
                  cursor: 'pointer',
                }}
              >
                <Chevron open={expanded} />
                <span style={{ fontWeight: 600 }}>
                  {client.name}{' '}
                  {canOpenClients && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.openClientTab(client.id, 'invoices');
                      }}
                      style={{
                        fontSize: 11,
                        color: 'var(--ink-3)',
                        fontWeight: 500,
                        textDecoration: 'underline',
                        marginLeft: 4,
                      }}
                    >
                      open
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{inv.number}</span>
                <span>{fmtMoney(inv.amount, currency)}</span>
                <div>
                  {balance > 0 ? (
                    <div style={{ width: 70 }}>
                      {isPartial && (
                        <div
                          style={{
                            height: 4,
                            borderRadius: 2,
                            background: 'var(--border-2)',
                            overflow: 'hidden',
                            marginBottom: 4,
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              background: 'var(--phot-purple)',
                              width: paidPercent(inv) + '%',
                            }}
                          />
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: isPartial ? 11 : 13,
                          color: isPartial ? 'var(--ink-3)' : 'var(--danger)',
                          fontWeight: isPartial ? 400 : 600,
                        }}
                      >
                        {fmtMoney(balance, currency)}
                        {isPartial ? ' due' : ''}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--ink-3)' }}>—</span>
                  )}
                </div>
                <span>{fmtDate(inv.dueDate)}</span>
                <span>
                  <Chip color={invoiceStatusColor(inv)}>{statusLabel}</Chip>
                </span>
              </div>

              {expanded && (
                <div style={{ padding: '0 20px 16px 46px' }}>
                  <div className="expand-panel">
                    <div style={{ fontSize: 13, marginBottom: 12 }}>
                      <strong>{fmtMoney(invoicePaidAmount(inv), currency)}</strong>{' '}
                      <span style={{ color: 'var(--ink-3)' }}>
                        received of {fmtMoney(inv.amount, currency)}
                      </span>
                    </div>
                    {inv.payments.length > 0 ? (
                      <>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr 1fr',
                            padding: '0 4px 6px 4px',
                            fontSize: 10.5,
                            color: 'var(--ink-3)',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            borderBottom: '1px solid var(--border-2)',
                          }}
                        >
                          <span>Date</span>
                          <span>Bank amount</span>
                          <span>TDS</span>
                          <span>Total</span>
                        </div>
                        {inv.payments.map((p) => (
                          <div
                            key={p.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr 1fr 1fr',
                              alignItems: 'center',
                              padding: '9px 4px',
                              fontSize: 12.5,
                              borderBottom: '1px solid var(--border-2)',
                            }}
                          >
                            <span>{fmtDate(p.date)}</span>
                            <span>{fmtMoney(p.bankAmount || 0, currency)}</span>
                            <span style={{ color: p.tds > 0 ? 'var(--ink-1)' : 'var(--ink-3)' }}>
                              {p.tds > 0 ? fmtMoney(p.tds, currency) : '—'}
                            </span>
                            <span style={{ fontWeight: 600 }}>
                              {fmtMoney(paymentSettled(p), currency)}
                            </span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '8px 4px 0 4px' }}>
                        No payments logged yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <EmptyRow>No invoices yet.</EmptyRow>}
      </div>
    </div>
  );
}
