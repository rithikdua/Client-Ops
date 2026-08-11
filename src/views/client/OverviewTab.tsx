import type { Client } from '../../data/types';
import { fmtDate } from '../../lib/dates';
import { invoiceStatus } from '../../lib/invoices';
import { fmtMoney } from '../../lib/money';
import { useAccess } from '../../state/access';
import { SystemTag } from '../OverviewView';

function CountCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 22, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          color: 'var(--ink-3)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 3 }}>{value}</div>
    </div>
  );
}

export function OverviewTab({ client }: { client: Client }) {
  const { showInvoiceStats } = useAccess();

  const openDeliverables = client.deliverables.filter((d) => d.status !== 'Done').length;
  const openTasks = client.tasks.filter((t) => t.status !== 'Done').length;
  const pendingInvoices = client.invoices.filter((i) => invoiceStatus(i) !== 'Paid').length;
  const primaryContact = client.contacts[0];
  const activity = [...client.activity].sort((a, b) => b.date.localeCompare(a.date));

  const hasGstBreakdown = client.baseAmount != null;
  const hasAccountDetails = !!(
    client.legalName ||
    client.gstin ||
    client.natureOfBusiness ||
    client.cityTier ||
    client.scopeOfWork ||
    client.onboardingDate ||
    hasGstBreakdown
  );
  const gstBreakdownLabel =
    fmtMoney(client.gstAmount || 0, client.currency) +
    ' (' +
    (client.gstPercent || 0) +
    (client.gstMode === 'included' ? '%, included in base)' : '%, added on top)');

  const statsCols = showInvoiceStats ? 'repeat(5,minmax(0,1fr))' : 'repeat(4,minmax(0,1fr))';

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: statsCols, gap: 16, marginTop: 20 }}>
        <CountCard label="Contacts" value={client.contacts.length} />
        {showInvoiceStats && (
          <CountCard label="Invoices · unpaid" value={`${pendingInvoices} / ${client.invoices.length}`} />
        )}
        <CountCard label="Deliverables · open" value={`${openDeliverables} / ${client.deliverables.length}`} />
        <CountCard label="Documents on file" value={client.documents.length} />
        <CountCard label="Open to-dos" value={openTasks} />
      </div>

      {hasAccountDetails && (
        <div className="card" style={{ padding: '16px 20px', marginTop: 20 }}>
          <div
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: 13,
              marginBottom: 10,
            }}
          >
            Account details
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,1fr)',
              gap: 14,
              fontSize: 13,
            }}
          >
            <DetailField label="Legal name" value={client.legalName || ''} />
            <DetailField label="GSTIN" value={client.gstin || ''} />
            <DetailField label="Nature of business" value={client.natureOfBusiness || ''} />
            <DetailField label="City / tier" value={client.cityTier || ''} />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,1fr)',
              gap: 14,
              fontSize: 13,
              marginTop: 10,
            }}
          >
            <DetailField
              label="Onboarding date"
              value={client.onboardingDate ? fmtDate(client.onboardingDate) : ''}
            />
            <DetailField
              label="Mandate type"
              value={
                client.mandateType === 'Other'
                  ? client.mandateOther || 'Other'
                  : client.mandateType || 'Pilot'
              }
            />
            {hasGstBreakdown && (
              <>
                <DetailField label="Base amount" value={fmtMoney(client.baseAmount || 0, client.currency)} />
                <DetailField label="GST" value={gstBreakdownLabel} />
              </>
            )}
          </div>
          {client.scopeOfWork && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  color: 'var(--ink-3)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Scope of work
              </div>
              <div style={{ marginTop: 3, fontSize: 13.5, lineHeight: 1.5 }}>{client.scopeOfWork}</div>
            </div>
          )}
        </div>
      )}

      {client.notes && (
        <div className="card" style={{ padding: '16px 20px', marginTop: 20 }}>
          <div
            style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, marginBottom: 6 }}
          >
            Notes
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{client.notes}</div>
        </div>
      )}

      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 20,
        }}
      >
        <div className="card" style={{ padding: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>
            Primary contact
          </div>
          {primaryContact ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{primaryContact.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
                {primaryContact.role}
              </div>
              <div style={{ fontSize: 13, marginTop: 10 }}>
                <a href={`mailto:${primaryContact.email}`}>{primaryContact.email}</a>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>
                {primaryContact.phone}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--ink-3)', fontSize: 13.5 }}>No contacts added yet.</div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>
            Latest activity
          </div>
          {activity.slice(0, 3).map((act) => (
            <div
              key={act.id}
              style={{
                paddingBottom: 10,
                marginBottom: 10,
                borderBottom: '1px solid var(--border-2)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--ink-3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{act.author}</span> ·{' '}
                {fmtDate(act.date)}
                {act.kind === 'system' && <SystemTag />}
              </div>
              <div style={{ fontSize: 13, marginTop: 3, lineHeight: 1.4 }}>{act.note}</div>
            </div>
          ))}
          {activity.length === 0 && (
            <div style={{ color: 'var(--ink-3)', fontSize: 13.5 }}>No activity logged yet.</div>
          )}
        </div>
      </div>
    </>
  );
}
