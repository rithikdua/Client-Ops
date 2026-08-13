import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addMonths, currentBillingPeriod, toISO } from '../../src/lib/dates';

/** Local midnight, matching how the app parses a stored `YYYY-MM-DD`. */
function at(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function period(startISO: string, cycle: 'Monthly' | 'Quarterly' | 'Annual' | 'One-time', todayISO: string) {
  const { start, end } = currentBillingPeriod(startISO, cycle, at(todayISO));
  return `${toISO(start)}..${toISO(end)}`;
}

describe('H-14 month-end date arithmetic', () => {
  test('adding a month to a month-end date stays in the next month', () => {
    // setMonth alone gives Mar 3 here, and that error compounds every cycle.
    assert.equal(toISO(addMonths(at('2026-01-31'), 1)), '2026-02-28');
    assert.equal(toISO(addMonths(at('2026-01-30'), 1)), '2026-02-28');
    assert.equal(toISO(addMonths(at('2026-03-31'), 1)), '2026-04-30');
    assert.equal(toISO(addMonths(at('2026-05-31'), 1)), '2026-06-30');
  });

  test('February in a leap year gets its 29th', () => {
    assert.equal(toISO(addMonths(at('2028-01-31'), 1)), '2028-02-29');
    assert.equal(toISO(addMonths(at('2024-02-29'), 12)), '2025-02-28');
    assert.equal(toISO(addMonths(at('2024-02-29'), 48)), '2028-02-29');
  });

  test('a clamped date does not stay clamped on the way back out', () => {
    // Anchoring is what buys this: Jan 31 + 2 months is Mar 31, not Feb 28 + 1.
    assert.equal(toISO(addMonths(at('2026-01-31'), 2)), '2026-03-31');
    assert.equal(toISO(addMonths(at('2026-01-31'), 3)), '2026-04-30');
    assert.equal(toISO(addMonths(at('2026-01-31'), 4)), '2026-05-31');
  });

  test('subtracting months clamps the same way', () => {
    assert.equal(toISO(addMonths(at('2026-03-31'), -1)), '2026-02-28');
    assert.equal(toISO(addMonths(at('2026-01-15'), -1)), '2025-12-15');
  });

  test('ordinary dates are untouched', () => {
    assert.equal(toISO(addMonths(at('2026-06-15'), 1)), '2026-07-15');
    assert.equal(toISO(addMonths(at('2026-12-01'), 1)), '2027-01-01');
    assert.equal(toISO(addMonths(at('2026-06-15'), 12)), '2027-06-15');
  });

  test('a month-end contract bills on month-ends, with no drift', () => {
    // Was Aug 3 .. Sep 3 — seven months of accumulated overflow.
    assert.equal(period('2026-01-31', 'Monthly', '2026-08-13'), '2026-07-31..2026-08-31');
    assert.equal(period('2026-01-31', 'Monthly', '2026-02-15'), '2026-01-31..2026-02-28');
    assert.equal(period('2026-01-31', 'Monthly', '2026-03-01'), '2026-02-28..2026-03-31');
  });

  test('a period that has not begun yet is not treated as the current one', () => {
    // Started on the 31st; on the 13th the anniversary is still ahead, so the
    // period being billed is the previous one.
    assert.equal(period('2025-08-31', 'Monthly', '2026-08-13'), '2026-07-31..2026-08-31');
    assert.equal(period('2025-08-31', 'Monthly', '2026-08-31'), '2026-08-31..2026-09-30');
  });

  test('quarterly and annual cycles anchor on the start date too', () => {
    assert.equal(period('2025-11-30', 'Quarterly', '2026-08-13'), '2026-05-30..2026-08-30');
    assert.equal(period('2026-02-28', 'Quarterly', '2026-08-13'), '2026-05-28..2026-08-28');
    assert.equal(period('2024-02-29', 'Annual', '2026-08-13'), '2026-02-28..2027-02-28');
    assert.equal(period('2020-02-29', 'Annual', '2028-08-13'), '2028-02-29..2029-02-28');
  });

  test('the first period covers the day the contract starts', () => {
    assert.equal(period('2026-08-13', 'Monthly', '2026-08-13'), '2026-08-13..2026-09-13');
    // And a contract starting in the future sits in its own first period rather
    // than reporting one that already ended.
    assert.equal(period('2026-11-30', 'Monthly', '2026-08-13'), '2026-11-30..2026-12-30');
  });

  test('a one-time contract is a single open period', () => {
    const { start, end } = currentBillingPeriod('2026-01-31', 'One-time', at('2026-08-13'));
    assert.equal(toISO(start), '2026-01-31');
    assert.ok(end.getFullYear() > 2100, 'a one-time contract should not roll over');
  });

  test('a long-running contract lands on the right period, cheaply', () => {
    // Ten years of monthly cycles, resolved arithmetically rather than by
    // walking — the old loop gave up after 500 iterations.
    assert.equal(period('2016-01-31', 'Monthly', '2026-08-13'), '2026-07-31..2026-08-31');
    assert.equal(period('1990-03-31', 'Monthly', '2026-08-13'), '2026-07-31..2026-08-31');
  });
});
