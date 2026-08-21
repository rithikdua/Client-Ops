import { EmptyRow, Metric, MoneyTotals, PageHeader, SearchField, Select, TableHead } from '../components/ui';
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
import { addMoney, fmtMoney, moneyEntries, type MoneyByCurrency } from '../lib/money';
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

/**
 * Which question a figure answers. Without these the panel reads as one report
 * and is two: an invoice raised on 31 July and paid on 10 August belongs to
 * July's billing and to August's cash.
 */
const basis = (text: string) => (
  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{text}</div>
);
const ISSUED = basis('invoices issued in period');
const RECEIVED = basis('payments dated in period');

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
  // Every figure in the finance summary is kept per currency. This screen used to
  // add rupees to dollars and print the sum with a ₹ in front, which is a wrong
  // number on the screen most likely to be used for a decision.
  //
  // Two different questions share this panel, and they were being answered from
  // one filter. What was *billed* is a property of the invoices issued in the
  // period. What was *received* is a property of the payments dated in it. An
  // invoice issued on 31 July and paid on 10 August used to report ₹1,00,000 of
  // July cash — money that was still in the client's account all month.
  const inPeriod = (date: string) => {
    const day = parseISO(date);
    if (period.start && day < period.start) return false;
    if (period.end && day >= period.end) return false;
    return true;
  };

  /* Billed: invoices *issued* in the period, and how much of that has come in. */
  const baseBilled: MoneyByCurrency = {};
  const gstBilled: MoneyByCurrency = {};
  const totalInvoiced: MoneyByCurrency = {};
  const settledOnBilled: MoneyByCurrency = {};
  /* Received: payments *dated* in the period, whenever the invoice was raised. */
  const bankReceived: MoneyByCurrency = {};
  const tdsDeducted: MoneyByCurrency = {};

  const cohort: Row[] = [];

  state.clients.forEach((c) =>
    c.invoices.forEach((inv) => {
      // Cash first, across every invoice — a payment received this month may
      // belong to an invoice raised long before it.
      for (const payment of inv.payments) {
        if (!inPeriod(payment.date)) continue;
        addMoney(bankReceived, c.currency, payment.bankAmount);
        addMoney(tdsDeducted, c.currency, payment.tds);
      }

      if (!inPeriod(inv.issueDate)) return;
      addMoney(baseBilled, c.currency, inv.baseAmount ?? inv.amount);
      addMoney(gstBilled, c.currency, inv.gstAmount || 0);
      addMoney(totalInvoiced, c.currency, inv.amount);
      addMoney(settledOnBilled, c.currency, invoiceBankReceived(inv) + invoiceTdsDeducted(inv));
      const statusLabel = invoiceStatusLabel(inv);
      cohort.push({
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

  let rows = cohort;
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

  /**
   * Still outstanding on what was billed in the period — measured against that
   * cohort's own settlement, not against the period's cash, which may have paid
   * off invoices from another period entirely.
   */
  const stillOutstanding = moneyEntries(totalInvoiced).reduce<MoneyByCurrency>(
    (acc, [code, invoiced]) => addMoney(acc, code, invoiced - (settledOnBilled[code] ?? 0)),
    {},
  );

  /** A ratio only means something inside one currency, and one cohort. */
  const percentRealized = (code: CurrencyCode) => {
    const invoiced = totalInvoiced[code] ?? 0;
    if (invoiced <= 0) return 0;
    return Math.round(((settledOnBilled[code] ?? 0) / invoiced) * 1000) / 10;
  };

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
        <div style={{ marginBottom: 18 }}>
          <h2 className="card-title">Finance summary</h2>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            What was billed is counted from the invoice date; what came in is counted from the
            payment date.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 20 }}>
          <Metric label="Base billed" value={<MoneyTotals totals={baseBilled} />} extra={ISSUED} />
          <Metric label="GST billed" value={<MoneyTotals totals={gstBilled} />} extra={ISSUED} />
          <Metric
            label="Total invoiced"
            value={<MoneyTotals totals={totalInvoiced} />}
            extra={ISSUED}
          />
          <Metric
            label="Bank cash received"
            value={<MoneyTotals totals={bankReceived} color="var(--success)" />}
            valueColor="var(--success)"
            extra={RECEIVED}
          />
          <Metric label="TDS deducted" value={<MoneyTotals totals={tdsDeducted} />} extra={RECEIVED} />
          <Metric
            label="Still outstanding"
            value={
              <MoneyTotals
                totals={stillOutstanding}
                color="var(--danger)"
                // The percentage sits with the currency it was computed from,
                // because a settlement ratio across currencies is meaningless.
                perCurrency={(code) => (
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12,
                      color: 'var(--success)',
                      marginTop: 4,
                      fontWeight: 600,
                    }}
                  >
                    ↑ {percentRealized(code)}% realized
                  </span>
                )}
              />
            }
            valueColor="var(--danger)"
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
          label="Filter invoices by status"
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
          label="Filter invoices by period"
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
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => actions.toggleInvoiceExpand(inv.id)}
                  aria-expanded={expanded}
                  aria-controls={`invoice-${inv.id}`}
                  aria-label={`Payment history for ${inv.number}`}
                >
                  <Chevron open={expanded} />
                </button>
                <span style={{ fontWeight: 600 }}>
                  {client.name}{' '}
                  {canOpenClients && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.openClientTab(client.id, 'invoices');
                      }}
                      aria-label={`Open ${client.name}`}
                      style={{
                        fontSize: 11,
                        color: 'var(--ink-3)',
                        fontWeight: 500,
                        textDecoration: 'underline',
                        marginLeft: 4,
                      }}
                    >
                      open
                    </button>
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
                <div id={`invoice-${inv.id}`} style={{ padding: '0 20px 16px 46px' }}>
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
