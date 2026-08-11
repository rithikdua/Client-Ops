import {
  BILLING_OPTIONS,
  HEALTH_OPTIONS,
  MANDATE_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
  STAGE_OPTIONS,
} from '../../data/options';
import type { CurrencyCode } from '../../data/types';
import { CURRENCY_OPTIONS } from '../../lib/money';
import { useApp } from '../../state/AppState';
import { GstFields } from './GstFields';
import { FormSection, SelectField, TextAreaField, TextField, useModalForm } from './fields';

const SPAN = { gridColumn: '1/-1' } as const;

export function ClientForm({ isNew }: { isNew: boolean }) {
  const { state, actions } = useApp();
  const { form } = useModalForm();
  const teamOptions = state.team.map((t) => t.name);
  const currency = (form.currency as CurrencyCode) || 'INR';

  // Typing a contact name that already exists elsewhere offers to reuse it,
  // rather than silently creating a duplicate.
  const q = (form.contactName ?? '').toLowerCase();
  const suggestions =
    isNew && q.length >= 2
      ? state.clients
          .flatMap((c) => c.contacts.map((ct) => ({ ...ct, clientName: c.name })))
          .filter((ct) => ct.name.toLowerCase().includes(q))
          .slice(0, 5)
      : [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
      <TextField label="Brand / short name" k="name" placeholder="Acme Corp" />
      <TextField label="Legal name" k="legalName" placeholder="Acme Corporation Pvt. Ltd." />
      <TextField label="Industry" k="industry" placeholder="Retail & e-commerce" />
      <SelectField label="Account owner" k="owner" options={teamOptions} />
      <SelectField label="Health" k="health" options={HEALTH_OPTIONS} />
      <SelectField label="Onboarding stage" k="stage" options={STAGE_OPTIONS} />
      <TextField label="Onboarding date" k="onboardingDate" type="date" />
      <SelectField
        label="Currency"
        k="currency"
        options={CURRENCY_OPTIONS.map((c) => ({ value: c.code, label: c.label }))}
      />
      <TextField label="Contract start date" k="startDate" type="date" />
      <TextField label="Contract end date" k="contractEndDate" type="date" />

      <FormSection span>Contract value breakdown</FormSection>
      <GstFields
        layout="grid"
        currency={currency}
        basePlaceholder="80000"
        totalLabel="Total contract amount"
      />

      <SelectField label="Billing cycle" k="billingCycle" options={BILLING_OPTIONS} />
      <SelectField label="Payment terms" k="paymentTerms" options={PAYMENT_TERMS_OPTIONS} />
      <TextField label="GSTIN" k="gstin" placeholder="22AAAAA0000A1Z5" />
      <TextField label="Nature of business" k="natureOfBusiness" />
      <TextField label="City / tier" k="cityTier" placeholder="Bengaluru · Tier 1" />
      <SelectField label="Mandate type" k="mandateType" options={MANDATE_OPTIONS} />
      {form.mandateType === 'Other' && (
        <TextField label="If other, specify mandate" k="mandateOther" />
      )}
      <TextAreaField label="Scope of work" k="scopeOfWork" style={SPAN} />
      <TextField label="Website" k="website" placeholder="https://client.com" />
      <TextAreaField
        label="Notes"
        k="notes"
        placeholder="Anything else worth knowing about this account"
        style={SPAN}
      />

      {isNew && (
        <>
          <FormSection span>Primary contact</FormSection>
          <TextField
            label="Contact name"
            k="contactName"
            placeholder="Start typing to match existing contacts…"
          />
          <TextField label="Role" k="contactRole" />
          {suggestions.length > 0 && (
            <div
              style={{
                gridColumn: '1/-1',
                marginTop: -6,
                marginBottom: 4,
                border: '1px solid var(--border-1)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {suggestions.map((sug) => (
                <div
                  key={sug.id}
                  onClick={() => actions.selectContactSuggestion(sug)}
                  style={{
                    padding: '9px 12px',
                    fontSize: 13,
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-2)',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{sug.name}</span>
                  <span style={{ color: 'var(--ink-3)' }}>
                    {' '}
                    · {sug.clientName}
                    {sug.role ? ' · ' + sug.role : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <TextField label="Email" k="contactEmail" />
          <TextField label="Phone" k="contactPhone" />

          <FormSection span>What we're committed to deliver</FormSection>
          <TextField
            label="Initial commitment / scope"
            k="initialCommitment"
            placeholder="e.g. Onboarding kickoff deck"
          />
          <TextField label="Due date" k="initialCommitmentDue" type="date" />
        </>
      )}
    </div>
  );
}
