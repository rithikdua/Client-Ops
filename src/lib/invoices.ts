import type { Deliverable, Invoice, Payment } from '../data/types';
import { today, parseISO } from './dates';

export type InvoiceStatus = 'Paid' | 'Partially Paid' | 'Pending';
/** What a row displays — `Overdue` replaces the underlying status in the UI. */
export type InvoiceStatusLabel = InvoiceStatus | 'Overdue';

/** TDS withheld by the client still settles the invoice, so it counts as paid. */
export function paymentSettled(p: Payment): number {
  return (p.bankAmount || 0) + (p.tds || 0);
}

export function invoicePaidAmount(inv: Invoice): number {
  return (inv.payments || []).reduce((a, p) => a + paymentSettled(p), 0);
}

export function invoiceBankReceived(inv: Invoice): number {
  return (inv.payments || []).reduce((a, p) => a + (p.bankAmount || 0), 0);
}

export function invoiceTdsDeducted(inv: Invoice): number {
  return (inv.payments || []).reduce((a, p) => a + (p.tds || 0), 0);
}

export function invoiceBalance(inv: Invoice): number {
  return inv.amount - invoicePaidAmount(inv);
}

export function invoiceStatus(inv: Invoice): InvoiceStatus {
  const paid = invoicePaidAmount(inv);
  if (inv.amount > 0 && paid >= inv.amount) return 'Paid';
  if (paid > 0) return 'Partially Paid';
  return 'Pending';
}

export function isInvoiceOverdue(inv: Invoice): boolean {
  return invoiceStatus(inv) !== 'Paid' && parseISO(inv.dueDate) < today();
}

export function invoiceStatusLabel(inv: Invoice): InvoiceStatusLabel {
  return isInvoiceOverdue(inv) ? 'Overdue' : invoiceStatus(inv);
}

export function isDeliverableOverdue(d: Deliverable): boolean {
  return d.status !== 'Done' && parseISO(d.dueDate) < today();
}

/** Percentage of an invoice collected, floored at 2% so the bar stays visible. */
export function paidPercent(inv: Invoice): number {
  return Math.max(2, Math.min(100, Math.round((invoicePaidAmount(inv) / inv.amount) * 100)));
}
