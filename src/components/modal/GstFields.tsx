import { GST_RATE_OPTIONS } from '../../data/options';
import type { CurrencyCode } from '../../data/types';
import { fmtMoney, gstBreakdown, toMinor } from '../../lib/money';
import { SegmentedControl } from '../ui';
import { FieldRow, ReadonlyTotal, SelectField, TextField, useModalForm } from './fields';

/**
 * Base amount + GST % + treatment toggle, with a live total. Shared by the
 * client contract form and the invoice form.
 */
export function GstFields({
  currency,
  basePlaceholder,
  totalLabel,
  layout,
}: {
  currency: CurrencyCode;
  basePlaceholder: string;
  totalLabel: string;
  /** `grid` spans the two-column client form; `stack` is the narrow modal. */
  layout: 'grid' | 'stack';
}) {
  const { form, set } = useModalForm();
  const mode = form.gstMode === 'included' ? 'included' : 'excluded';
  // The field holds whole currency units; the maths (and the server) work in minor units.
  const { gst, total } = gstBreakdown(toMinor(form.baseAmount ?? 0), Number(form.gstPercent) || 0, mode);
  const pct = Number(form.gstPercent) || 0;

  const hint =
    mode === 'included'
      ? `GST already included in base — ${fmtMoney(gst, currency)} of it is GST.`
      : `GST added on top of base — ${fmtMoney(gst, currency)} at ${pct}%.`;

  const flex = layout === 'stack' ? { flex: 1 } : undefined;
  const amounts = (
    <>
      <TextField
        label="Base amount"
        k="baseAmount"
        type="number"
        placeholder={basePlaceholder}
        style={flex}
      />
      <SelectField
        label="GST %"
        k="gstPercent"
        options={GST_RATE_OPTIONS.map((r) => ({ value: r, label: r + '%' }))}
        style={flex}
      />
    </>
  );

  const treatment = (
    <div style={layout === 'grid' ? { gridColumn: '1/-1' } : undefined}>
      <div className="field">GST treatment</div>
      <SegmentedControl
        small
        value={mode}
        onChange={(v) => set('gstMode', v)}
        options={[
          { value: 'excluded', label: 'GST excluded' },
          { value: 'included', label: 'GST included' },
        ]}
      />
      <div className="field-hint">{hint}</div>
    </div>
  );

  const totalBlock =
    layout === 'grid' ? (
      <div style={{ gridColumn: '1/-1' }}>
        <ReadonlyTotal label={totalLabel} value={fmtMoney(total, currency)} />
      </div>
    ) : (
      <ReadonlyTotal label={totalLabel} value={fmtMoney(total, currency)} />
    );

  return (
    <>
      {layout === 'grid' ? amounts : <FieldRow>{amounts}</FieldRow>}
      {treatment}
      {totalBlock}
    </>
  );
}
