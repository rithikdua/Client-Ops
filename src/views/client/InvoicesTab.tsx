import { EmptyRow, Metric, RowMenu, RowMenuItem, TableHead } from '../../components/ui';
import type { Client } from '../../data/types';
import { Button } from '../../ds/Button';
import { Chip } from '../../ds/Chip';
import { Icon } from '../../ds/Icon';
import { fmtDate } from '../../lib/dates';
import {
  invoiceBankReceived,
  invoicePaidAmount,
  invoiceBalance,
  invoiceStatusLabel,
  invoiceTdsDeducted,
  paidPercent,
  paymentSettled,
} from '../../lib/invoices';
import { fmtMoney } from '../../lib/money';
import { chipDotColor, invoiceStatusColor } from '../../lib/statusColors';
import { useAccess } from '../../state/access';
import { useApp } from '../../state/AppState';

const GRID = '10px 1.2fr 1.3fr 0.9fr 0.9fr 0.9fr 36px';
const PAYMENT_GRID = '1fr 1fr 1fr 1fr 24px';

export function InvoicesTab({ client }: { client: Client }) {
  const { state, actions } = useApp();
  const { canWrite } = useAccess();
  const currency = client.currency;

  const baseBilled = client.invoices.reduce((a, i) => a + (i.baseAmount ?? i.amount), 0);
  const gstBilled = client.invoices.reduce((a, i) => a + (i.gstAmount || 0), 0);
  const totalInvoiced = client.invoices.reduce((a, i) => a + i.amount, 0);
  const bankReceived = client.invoices.reduce((a, i) => a + invoiceBankReceived(i), 0);
  const tdsDeducted = client.invoices.reduce((a, i) => a + invoiceTdsDeducted(i), 0);

  return (
    <div style={{ marginTop: 20 }}>
      <div className="card" style={{ padding: '16px 20px', marginBottom: 12 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))',
            gap: 16,
          }}
        >
          <Metric label="Base billed" value={fmtMoney(baseBilled, currency)} labelSize={11} valueSize={16} />
          <Metric label="GST billed" value={fmtMoney(gstBilled, currency)} labelSize={11} valueSize={16} />
          <Metric
            label="Total invoiced"
            value={fmtMoney(totalInvoiced, currency)}
            labelSize={11}
            valueSize={16}
          />
          <Metric
            label="Bank received"
            value={fmtMoney(bankReceived, currency)}
            valueColor="var(--success)"
            labelSize={11}
            valueSize={16}
          />
          <Metric label="TDS deducted" value={fmtMoney(tdsDeducted, currency)} labelSize={11} valueSize={16} />
          <Metric
            label="Pending due"
            value={fmtMoney(totalInvoiced - bankReceived - tdsDeducted, currency)}
            valueColor="var(--danger)"
            labelSize={11}
            valueSize={16}
          />
        </div>
      </div>

      {canWrite && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Button variant="secondary" size="sm" onClick={() => actions.openAddInvoice(client.id)}>
            + Add invoice
          </Button>
        </div>
      )}

      {/* Left unclipped so the per-row action menu can overflow the card. */}
      <div className="card">
        <TableHead
          gridTemplateColumns={GRID}
          style={{ borderRadius: '12px 12px 0 0' }}
          columns={['', 'Invoice', 'Amount', 'Issued', 'Due', 'Status', '']}
        />
        {client.invoices.map((inv) => {
          const statusLabel = invoiceStatusLabel(inv);
          const balance = invoiceBalance(inv);
          const paid = invoicePaidAmount(inv);
          const isPartial = paid > 0 && balance > 0;
          const expanded = !!state.expandedInvoices[inv.id];
          const canMarkPaid = balance > 0;
          return (
            <div key={inv.id} style={{ borderBottom: '1px solid var(--border-2)' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID,
                  padding: 'var(--row-pad)',
                  alignItems: 'center',
                  fontSize: 13.5,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: chipDotColor(invoiceStatusColor(inv)),
                  }}
                />
                <div>
                  <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{inv.number}</span>
                  {inv.file && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                      <Icon name="document" size={12} />
                      <a href={inv.file.url || '#'} target="_blank" rel="noreferrer" style={{ fontSize: 11.5 }}>
                        {inv.file.name}
                      </a>
                    </div>
                  )}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>{fmtMoney(inv.amount, currency)}</span>
                  {isPartial && (
                    <div
                      onClick={() => actions.toggleInvoiceExpand(inv.id)}
                      style={{ cursor: 'pointer', marginTop: 6, width: 84 }}
                    >
                      <div
                        style={{
                          height: 4,
                          borderRadius: 2,
                          background: 'var(--border-2)',
                          overflow: 'hidden',
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
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--ink-3)',
                          marginTop: 4,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {fmtMoney(balance, currency)} due
                      </div>
                    </div>
                  )}
                </div>
                <span>{fmtDate(inv.issueDate)}</span>
                <span>{fmtDate(inv.dueDate)}</span>
                <span>
                  <Chip color={invoiceStatusColor(inv)}>{statusLabel}</Chip>
                </span>
                {canWrite ? (
                  <RowMenu
                    wide
                    open={state.invoiceMenuOpenId === inv.id}
                    onToggle={() => actions.toggleInvoiceMenu(inv.id)}
                  >
                    {canMarkPaid && (
                      <>
                        <RowMenuItem onClick={() => actions.openLogPayment(client.id, inv.id, balance)}>
                          Log a payment
                        </RowMenuItem>
                        <RowMenuItem onClick={() => actions.markInvoicePaid(client.id, inv.id)}>
                          Mark fully paid
                        </RowMenuItem>
                      </>
                    )}
                    <RowMenuItem onClick={() => actions.openAttachInvoiceFile(client.id, inv.id, inv.file)}>
                      {inv.file ? 'Edit attached file' : 'Attach file'}
                    </RowMenuItem>
                    <RowMenuItem danger onClick={() => actions.removeItem('invoices', client.id, inv.id)}>
                      Delete invoice
                    </RowMenuItem>
                  </RowMenu>
                ) : (
                  <span />
                )}
              </div>

              {expanded && (
                <div style={{ padding: '0 20px 16px 30px' }}>
                  <div className="expand-panel">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--ink-3)',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                          }}
                        >
                          Payment history
                        </div>
                        <div style={{ fontSize: 13, marginTop: 3 }}>
                          <strong>{fmtMoney(paid, currency)}</strong>{' '}
                          <span style={{ color: 'var(--ink-3)' }}>
                            received of {fmtMoney(inv.amount, currency)}
                          </span>
                        </div>
                      </div>
                      {canMarkPaid && canWrite && (
                        <div
                          onClick={() => actions.openLogPayment(client.id, inv.id, balance)}
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: 'var(--phot-purple)',
                            cursor: 'pointer',
                            padding: '6px 10px',
                            border: '1px solid var(--phot-purple)',
                            borderRadius: 6,
                          }}
                        >
                          + Log payment
                        </div>
                      )}
                    </div>
                    {inv.payments.length > 0 ? (
                      <>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: PAYMENT_GRID,
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
                          <span />
                        </div>
                        {inv.payments.map((p) => (
                          <div
                            key={p.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: PAYMENT_GRID,
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
                            <span style={{ fontWeight: 600 }}>{fmtMoney(paymentSettled(p), currency)}</span>
                            {canWrite ? (
                              <img
                                src="/assets/icons/trash.svg"
                                width={13}
                                height={13}
                                onClick={() => actions.removePayment(client.id, inv.id, p.id)}
                                style={{ cursor: 'pointer', opacity: 0.5 }}
                                alt="Remove"
                              />
                            ) : (
                              <span />
                            )}
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
        {client.invoices.length === 0 && <EmptyRow>No invoices yet.</EmptyRow>}
      </div>
    </div>
  );
}
