import type { BillingCycle } from '../data/types';

/**
 * The demo clock. The seeded accounts are dated around this day so the overdue
 * invoices, due-soon deliverables and billing countdowns always read as
 * intended. Swap this for `new Date()` to run against the real calendar.
 */
export const TODAY = new Date('2026-08-06T00:00:00');

export function uid(prefix: string): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 9);
}

export function todayISO(): string {
  return TODAY.toISOString().slice(0, 10);
}

/** Parses a `YYYY-MM-DD` string as local midnight (not UTC). */
export function parseISO(iso: string): Date {
  return new Date(iso + 'T00:00:00');
}

export function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  return parseISO(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtDateObj(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000);
}

export function billingShort(cycle: BillingCycle): string {
  return cycle === 'Monthly'
    ? 'mo'
    : cycle === 'Quarterly'
      ? 'qtr'
      : cycle === 'One-time'
        ? 'one-time'
        : 'yr';
}

/** Months per billing cycle; 0 means there is no recurrence. */
export function cycleMonths(cycle: BillingCycle): number {
  return cycle === 'Monthly' ? 1 : cycle === 'Annual' ? 12 : cycle === 'One-time' ? 0 : 3;
}

export function cyclePeriodLabel(cycle: BillingCycle): string {
  return cycle === 'Monthly'
    ? 'this month'
    : cycle === 'Annual'
      ? 'this year'
      : cycle === 'One-time'
        ? 'total'
        : 'this quarter';
}

/**
 * Walks forward from the contract start date in whole cycles to find the
 * period containing TODAY. One-time contracts get a single open-ended period.
 */
export function currentBillingPeriod(
  startDateISO: string,
  cycle: BillingCycle,
): { start: Date; end: Date } {
  const months = cycleMonths(cycle);
  const start0 = parseISO(startDateISO);
  if (months === 0) return { start: start0, end: addMonths(start0, 1200) };
  let cursor = start0;
  let next = addMonths(cursor, months);
  let guard = 0;
  while (next <= TODAY && guard < 500) {
    cursor = next;
    next = addMonths(cursor, months);
    guard++;
  }
  return { start: cursor, end: next };
}

export type InvoicePeriod =
  | 'all'
  | 'this_month'
  | 'last_month'
  | 'last_3'
  | 'last_6'
  | 'this_year'
  | 'this_fy'
  | 'last_fy'
  | 'custom';

/**
 * Resolves a period filter to a `[start, end)` window. A null bound is open.
 * Financial years run April → March.
 */
export function invoicePeriodRange(
  period: InvoicePeriod,
  customFrom: string,
  customTo: string,
): { start: Date | null; end: Date | null } {
  const startOfMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  if (period === 'this_month') return { start: startOfMonth, end: addMonths(startOfMonth, 1) };
  if (period === 'last_month') return { start: addMonths(startOfMonth, -1), end: startOfMonth };
  if (period === 'last_3') return { start: addMonths(TODAY, -3), end: null };
  if (period === 'last_6') return { start: addMonths(TODAY, -6), end: null };
  if (period === 'this_year') {
    return { start: new Date(TODAY.getFullYear(), 0, 1), end: new Date(TODAY.getFullYear() + 1, 0, 1) };
  }
  if (period === 'this_fy' || period === 'last_fy') {
    const fyStartYear = TODAY.getMonth() >= 3 ? TODAY.getFullYear() : TODAY.getFullYear() - 1;
    const y = period === 'this_fy' ? fyStartYear : fyStartYear - 1;
    return { start: new Date(y, 3, 1), end: new Date(y + 1, 3, 1) };
  }
  if (period === 'custom') {
    return {
      start: customFrom ? parseISO(customFrom) : null,
      // `to` is inclusive for the user, so push the exclusive end out a day.
      end: customTo ? addDays(parseISO(customTo), 1) : null,
    };
  }
  return { start: null, end: null };
}
