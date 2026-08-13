import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { CurrencyCode } from '../../src/data/types';
import {
  addMoney,
  displayCurrency,
  fmtMoney,
  moneyEntries,
  type MoneyByCurrency,
} from '../../src/lib/money';

describe('C-04 currencies are never mixed', () => {
  test('amounts accumulate in their own currency', () => {
    const totals: MoneyByCurrency = {};
    addMoney(totals, 'INR', 10_000_00);
    addMoney(totals, 'USD', 5_000_00);
    addMoney(totals, 'INR', 2_500_00);

    assert.equal(totals.INR, 1_250_000);
    assert.equal(totals.USD, 500_000);
    // The thing the dashboard used to report: one number, silently added.
    assert.notEqual(totals.INR, 1_750_000);
  });

  test('a workspace with one currency reads as a single amount', () => {
    const totals = addMoney({}, 'INR', 65_000_000);
    assert.deepEqual(moneyEntries(totals), [['INR', 65_000_000]]);
    assert.equal(fmtMoney(65_000_000, 'INR'), '₹6,50,000');
  });

  test('a mixed workspace reports each currency separately', () => {
    const totals: MoneyByCurrency = {};
    addMoney(totals, 'INR', 65_000_000);
    addMoney(totals, 'USD', 10_000_000);
    const shown = moneyEntries(totals).map(([code, minor]) => fmtMoney(minor, code));
    assert.deepEqual(shown, ['$100,000', '₹6,50,000']);
    // Not this: 75000000 minor units wearing a rupee sign.
    assert.notEqual(shown.join(' '), fmtMoney(75_000_000, 'INR'));
  });

  test('currency order is stable, so a card does not reshuffle between renders', () => {
    const a: MoneyByCurrency = {};
    addMoney(a, 'INR', 100);
    addMoney(a, 'USD', 900);
    const b: MoneyByCurrency = {};
    addMoney(b, 'USD', 900);
    addMoney(b, 'INR', 100);
    assert.deepEqual(
      moneyEntries(a).map(([c]) => c),
      moneyEntries(b).map(([c]) => c),
    );
  });

  test('a zero bucket is still reported — it is a real total of zero', () => {
    const totals = addMoney({}, 'USD', 0);
    assert.deepEqual(moneyEntries(totals), [['USD', 0]]);
  });

  test('an empty total is captioned in a currency the workspace uses', () => {
    assert.equal(displayCurrency({}), 'INR', 'nothing to go on: the house currency');
    assert.equal(displayCurrency(addMoney({}, 'AED', 500)), 'AED');
  });

  test('each currency formats in its own convention', () => {
    // Indian grouping is 2,2,3 — not thousands.
    assert.equal(fmtMoney(11_800_000, 'INR'), '₹1,18,000');
    assert.equal(fmtMoney(11_800_000, 'USD'), '$118,000');
    assert.equal(fmtMoney(11_800_000, 'GBP'), '£118,000');
    assert.equal(fmtMoney(11_800_000, 'AED'), 'AED 118,000');
  });

  test('the currency argument is required, so nothing renders unlabelled', () => {
    // The regression this guards: fmtMoney used to default to INR, which is how
    // a cross-currency sum ended up with a ₹ in front of it. A caller that omits
    // the currency must not compile.
    // @ts-expect-error the currency is mandatory
    const unlabelled = (minor: number) => fmtMoney(minor);
    void unlabelled;

    const code: CurrencyCode = 'EUR';
    assert.equal(fmtMoney(100_00, code), '€100');
  });
});
