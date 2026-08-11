import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balanceMinor, settledMinor, statusOf } from '../src/domain/invoices';

const payment = (bank: number, tds = 0) => ({ bank_amount_minor: bank, tds_minor: tds });

test('an invoice with no payments is Pending and fully outstanding', () => {
  assert.equal(statusOf(2400000, []), 'Pending');
  assert.equal(balanceMinor(2400000, []), 2400000);
});

test('TDS counts towards settling the invoice even though no cash arrives', () => {
  const payments = [payment(1000000, 100000)];
  assert.equal(settledMinor(payments), 1100000);
  assert.equal(balanceMinor(2400000, payments), 1300000);
  assert.equal(statusOf(2400000, payments), 'Partially Paid');
});

test('an invoice settled entirely by TDS still reads as Paid', () => {
  const payments = [payment(0, 2400000)];
  assert.equal(statusOf(2400000, payments), 'Paid');
  assert.equal(balanceMinor(2400000, payments), 0);
});

test('part-payments accumulate to Paid without floating-point drift', () => {
  // Three payments of 33.33 + one of 0.01 on a 100.00 invoice.
  const payments = [payment(3333), payment(3333), payment(3333), payment(1)];
  assert.equal(settledMinor(payments), 10000);
  assert.equal(statusOf(10000, payments), 'Paid');
  assert.equal(balanceMinor(10000, payments), 0);
});

test('overpayment reads as Paid and reports a negative balance', () => {
  const payments = [payment(2500000)];
  assert.equal(statusOf(2400000, payments), 'Paid');
  assert.equal(balanceMinor(2400000, payments), -100000);
});

test('a zero-amount invoice is never Paid by having no payments', () => {
  assert.equal(statusOf(0, []), 'Pending');
});
