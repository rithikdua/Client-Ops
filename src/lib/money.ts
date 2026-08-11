import type { CurrencyCode, GstMode } from '../data/types';

export const CURRENCY_MAP: Record<CurrencyCode, { symbol: string; locale: string; label: string }> =
  {
    USD: { symbol: '$', locale: 'en-US', label: 'USD — US Dollar' },
    INR: { symbol: '₹', locale: 'en-IN', label: 'INR — Indian Rupee' },
    EUR: { symbol: '€', locale: 'de-DE', label: 'EUR — Euro' },
    GBP: { symbol: '£', locale: 'en-GB', label: 'GBP — British Pound' },
    AED: { symbol: 'AED ', locale: 'en-AE', label: 'AED — UAE Dirham' },
  };

export const CURRENCY_OPTIONS = (Object.keys(CURRENCY_MAP) as CurrencyCode[]).map((code) => ({
  code,
  label: CURRENCY_MAP[code].label,
}));

/**
 * Formats a whole-currency amount. Cross-client roll-ups pass no code and fall
 * back to INR — summing mixed currencies isn't meaningful without FX rates, so
 * those totals are reported in the house currency.
 */
export function fmtMoney(n: number | undefined, code?: CurrencyCode): string {
  const c = CURRENCY_MAP[code ?? 'INR'] ?? CURRENCY_MAP.INR;
  return c.symbol + Math.round(n || 0).toLocaleString(c.locale);
}

/**
 * Splits a base amount into GST and gross total. With GST *excluded* the tax is
 * added on top of the base; with GST *included* the base already contains it.
 */
export function gstBreakdown(
  baseAmount: number,
  gstPercent: number,
  mode: GstMode,
): { base: number; gst: number; total: number } {
  const base = baseAmount || 0;
  const pct = gstPercent || 0;
  const gst = mode === 'included' ? base - base / (1 + pct / 100) : (base * pct) / 100;
  const total = mode === 'included' ? base : base + gst;
  return { base, gst, total };
}
