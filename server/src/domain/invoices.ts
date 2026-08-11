import type { Minor } from '../money';

export interface PaymentLike {
  bank_amount_minor: number;
  tds_minor: number;
}

/**
 * What an invoice has actually settled. TDS withheld by the client counts:
 * the cash never lands in our account, but the liability is discharged.
 */
export function settledMinor(payments: PaymentLike[]): Minor {
  return payments.reduce((sum, p) => sum + (p.bank_amount_minor || 0) + (p.tds_minor || 0), 0);
}

export function balanceMinor(amountMinor: Minor, payments: PaymentLike[]): Minor {
  return amountMinor - settledMinor(payments);
}

export type InvoiceStatus = 'Paid' | 'Partially Paid' | 'Pending';

/** Status is always computed, never stored — see schema.sql. */
export function statusOf(amountMinor: Minor, payments: PaymentLike[]): InvoiceStatus {
  const settled = settledMinor(payments);
  if (amountMinor > 0 && settled >= amountMinor) return 'Paid';
  if (settled > 0) return 'Partially Paid';
  return 'Pending';
}
