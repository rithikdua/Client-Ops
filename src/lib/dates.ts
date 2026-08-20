import type { BillingCycle } from '../data/types';

/**
 * The IANA zone the workspace's calendar days are measured in.
 *
 * "Today" has to be one thing for everybody. Left to each machine's local zone,
 * a team in Mumbai and a server in UTC disagree about the date for five and a
 * half hours out of every twenty-four, and an invoice logged at 9pm gets stamped
 * with tomorrow — or yesterday, depending on which side did the stamping. The
 * server owns this value (WORKSPACE_TIMEZONE) and sends it with every snapshot;
 * the default matches the server's own so the two agree before the first
 * response arrives.
 */
let workspaceTimezone = 'Asia/Kolkata';

/** Applied from the snapshot. An unusable zone is ignored, not fatal. */
export function setWorkspaceTimezone(tz: string | undefined): void {
  if (!tz || tz === workspaceTimezone) return;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    workspaceTimezone = tz;
  } catch {
    // The server validates this at startup; if something impossible arrives
    // anyway, keeping the previous zone beats throwing inside a render.
  }
}

export function workspaceTimezoneName(): string {
  return workspaceTimezone;
}

export function uid(prefix: string): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 9);
}

/**
 * Today's calendar date in the workspace timezone, as `YYYY-MM-DD`.
 *
 * This used to be `TODAY.toISOString().slice(0, 10)`, which is a local-midnight
 * Date converted to UTC — so anywhere east of Greenwich it returned *yesterday*.
 * In Asia/Kolkata on 20 August it produced 2026-08-19, and this function seeds
 * the default issue date, payment date, start date and due date in thirteen
 * places: every amount the team logged defaulted to the wrong day, and disagreed
 * with the activity entry the server wrote for the very same action.
 */
export function todayISO(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: workspaceTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * The same day as a Date at browser-local midnight, for comparing against dates
 * parsed by `parseISO`. Both sides are calendar days pinned to local midnight,
 * so the comparison is date-to-date and never drifts by a few hours.
 *
 * A function rather than a constant: a tab left open overnight used to keep
 * yesterday's date until it was reloaded, quietly holding invoices back from
 * turning overdue.
 */
export function today(): Date {
  return parseISO(todayISO());
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

/**
 * Adds whole months, clamping to the last day of the target month instead of
 * spilling into the next one.
 *
 * `setMonth` alone is wrong for any date after the 28th: Jan 31 + 1 month lands
 * on Mar 3, because February has no 31st and JavaScript rolls the overflow
 * forward. A contract that starts on the 31st then drifts a few days further
 * every cycle, which moved the billing window enough to count the wrong invoices
 * in it. Business month-ends land on the 30th and 31st constantly, so this is the
 * normal case, not an edge one.
 */
export function addMonths(date: Date, n: number): Date {
  const year = date.getFullYear();
  const month = date.getMonth() + n;
  // Day 0 of the following month is the last day of the target month, and the
  // Date constructor normalises a month index outside 0-11 for us.
  const lastDayOfTarget = new Date(year, month + 1, 0).getDate();
  return new Date(
    year,
    month,
    Math.min(date.getDate(), lastDayOfTarget),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
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

/** Undefined when the user was not sent the roster; "to date" reads honestly. */
export function cyclePeriodLabel(cycle: BillingCycle | undefined): string {
  if (!cycle) return 'to date';
  return cycle === 'Monthly'
    ? 'this month'
    : cycle === 'Annual'
      ? 'this year'
      : cycle === 'One-time'
        ? 'total'
        : 'this quarter';
}

/**
 * The billing period containing `today()`. One-time contracts get a single
 * open-ended period.
 *
 * Every period is measured from the contract start date rather than from the
 * previous period, which is what keeps a month-end contract on its month-end.
 * Walking cycle by cycle compounds each clamp: Jan 31 → Feb 28 → Mar 28 → Apr 28
 * loses three days by spring, where anchoring gives Feb 28, Mar 31, Apr 30 — the
 * dates an invoice would actually carry.
 */
export function currentBillingPeriod(
  startDateISO: string,
  cycle: BillingCycle,
  now: Date = today(),
): { start: Date; end: Date } {
  const months = cycleMonths(cycle);
  const start0 = parseISO(startDateISO);
  if (months === 0) return { start: start0, end: addMonths(start0, 1200) };

  const monthsElapsed =
    (now.getFullYear() - start0.getFullYear()) * 12 + (now.getMonth() - start0.getMonth());
  // A contract that has not started yet sits in its first period.
  let cycles = Math.max(0, Math.floor(monthsElapsed / months));
  // Within the month, the anniversary may still be ahead of today (started on
  // the 31st, today is the 13th), which puts us in the previous period.
  while (cycles > 0 && addMonths(start0, months * cycles) > now) cycles -= 1;

  return {
    start: addMonths(start0, months * cycles),
    end: addMonths(start0, months * (cycles + 1)),
  };
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
  const startOfMonth = new Date(today().getFullYear(), today().getMonth(), 1);
  if (period === 'this_month') return { start: startOfMonth, end: addMonths(startOfMonth, 1) };
  if (period === 'last_month') return { start: addMonths(startOfMonth, -1), end: startOfMonth };
  if (period === 'last_3') return { start: addMonths(today(), -3), end: null };
  if (period === 'last_6') return { start: addMonths(today(), -6), end: null };
  if (period === 'this_year') {
    return { start: new Date(today().getFullYear(), 0, 1), end: new Date(today().getFullYear() + 1, 0, 1) };
  }
  if (period === 'this_fy' || period === 'last_fy') {
    const fyStartYear = today().getMonth() >= 3 ? today().getFullYear() : today().getFullYear() - 1;
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
