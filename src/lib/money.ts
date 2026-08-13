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
 * Money crossing the API — and everything in `src/data/types.ts` — is an integer
 * count of minor units (paise/cents). Only convert at the edges: `toMinor` when
 * reading a form field, `fmtMoney`/`fromMinor` when showing a value.
 */
export function toMinor(majorUnits: number | string): number {
  return Math.round(Number(majorUnits || 0) * 100);
}

export function fromMinor(minor: number | undefined): number {
  return (minor ?? 0) / 100;
}

/** Minor units as a form-field string, e.g. 9600000 -> "96000". */
export function minorToInput(minor: number | undefined): string {
  if (minor == null) return '';
  const major = minor / 100;
  return String(Number.isInteger(major) ? major : Number(major.toFixed(2)));
}

/**
 * Formats a minor-unit amount in a stated currency.
 *
 * The currency is required. It used to be optional and fell back to INR, which
 * meant every cross-client roll-up added rupees to dollars and printed the result
 * with a ₹ in front of it — a wrong number wearing a confident label, on the
 * screen people would use to decide things. Totals are now kept per currency
 * (see `MoneyByCurrency`), and the compiler makes it impossible to render an
 * amount without saying what it is denominated in.
 *
 * Sub-unit precision is dropped on display (₹15,254.24 reads as ₹15,254); the
 * stored value keeps it.
 */
export function fmtMoney(minor: number | undefined, code: CurrencyCode): string {
  const c = CURRENCY_MAP[code] ?? CURRENCY_MAP.INR;
  return c.symbol + Math.round(fromMinor(minor)).toLocaleString(c.locale);
}

/**
 * Amounts held one bucket per currency, because there is no exchange rate here
 * and inventing one would be worse than showing two numbers. A workspace that
 * bills in a single currency — the common case — has exactly one entry and reads
 * exactly as it did before.
 */
export type MoneyByCurrency = Partial<Record<CurrencyCode, number>>;

/** Adds an amount to its own currency's bucket. Never across currencies. */
export function addMoney(
  totals: MoneyByCurrency,
  code: CurrencyCode,
  minor: number,
): MoneyByCurrency {
  totals[code] = (totals[code] ?? 0) + minor;
  return totals;
}

/**
 * The buckets that have a value, in a fixed currency order so the same currency
 * appears in the same position in every card on the screen.
 */
export function moneyEntries(totals: MoneyByCurrency): [CurrencyCode, number][] {
  return (Object.keys(CURRENCY_MAP) as CurrencyCode[])
    .filter((code) => totals[code] !== undefined)
    .map((code) => [code, totals[code] ?? 0]);
}

/**
 * Currency to show when there is nothing to total — an empty workspace, or a
 * section with no rows. Preferring one that is actually in use avoids captioning
 * a zero in a currency this workspace does not bill in.
 */
export function displayCurrency(totals: MoneyByCurrency, fallback: CurrencyCode = 'INR'): CurrencyCode {
  return moneyEntries(totals)[0]?.[0] ?? fallback;
}

/**
 * Splits a base amount into GST and gross total, all in minor units. Mirrors
 * `server/src/money.ts` so the form preview matches what the server will store.
 *
 * - `excluded`: GST is added on top of the base.
 * - `included`: the base already contains GST, so we work the tax back out.
 */
export function gstBreakdown(
  baseMinor: number,
  gstPercent: number,
  mode: GstMode,
): { base: number; gst: number; total: number } {
  const base = Math.round(baseMinor || 0);
  const pct = gstPercent || 0;
  if (mode === 'included') {
    const net = Math.round((base * 100) / (100 + pct));
    return { base, gst: base - net, total: base };
  }
  const gst = Math.round((base * pct) / 100);
  return { base, gst, total: base + gst };
}
