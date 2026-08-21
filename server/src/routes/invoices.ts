import { Router } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { logSystemActivity, todayISO } from '../domain/activity';
import { audit } from '../domain/audit';
import { balanceMinor, type PaymentLike } from '../domain/invoices';
import { HttpError, notFound } from '../http/errors';
import { fileSchema, invoiceSchema, paymentSchema, settleSchema } from '../http/validate';
import { gstBreakdown, toMinor } from '../money';
import {
  addAttachment,
  attachmentsFor,
  clearAttachments,
  setAttachment,
} from '../domain/attachments';
import { assertClient, snapshotFor } from './clients';

interface InvoiceRow {
  id: string;
  number: string;
  amount_minor: number;
  /** Loaded so a payment can be checked against it. */
  issue_date: string;
}

function loadInvoice(db: Db, clientId: string, invoiceId: string): InvoiceRow {
  const row = db
    .prepare(
      'SELECT id, number, amount_minor, issue_date FROM invoices WHERE id = ? AND client_id = ?',
    )
    .get(invoiceId, clientId) as InvoiceRow | undefined;
  if (!row) throw notFound('Invoice');
  return row;
}

function paymentsOf(db: Db, invoiceId: string): PaymentLike[] {
  return db
    .prepare('SELECT bank_amount_minor, tds_minor FROM payments WHERE invoice_id = ?')
    .all(invoiceId) as PaymentLike[];
}

/** Everything here sits behind the `invoices` section — money is need-to-know. */
/**
 * A payment cannot predate the invoice it settles.
 *
 * Each date was individually valid and never compared, so a payment dated
 * 1 August against an invoice issued on the 20th was accepted and quietly
 * wrong: it lands in the previous month's cash, moves the collections figures
 * for a period that was already reported, and puts the invoice's own timeline
 * out of order. In practice it is almost always a typo — the wrong month, or
 * last year — and refusing it is what a person would do.
 *
 * This workspace does not take money before raising the invoice; if that
 * changes, an advance belongs in its own record rather than attached to an
 * invoice that did not exist yet.
 */
function assertPaymentDate(invoice: { number: string; issue_date: string }, date: string): void {
  if (date < invoice.issue_date) {
    throw new HttpError(
      400,
      `A payment cannot be dated before the invoice was issued (${invoice.number} was issued on ${invoice.issue_date}).`,
    );
  }
}

export function invoiceRoutes(db: Db): Router {
  const router = Router({ mergeParams: true });
  router.use(requireSection('invoices'));

  router.post('/', requireWrite, (req, res) => {
    const { clientId } = req.params as { clientId: string };
    assertClient(db, clientId);
    const input = invoiceSchema.parse(req.body);

    // An invoice number is how a payment gets matched to a bill — in the bank
    // statement, in the client's ledger, in an email chasing it. Two invoices on
    // one account sharing a number makes every one of those ambiguous.
    const clash = db
      .prepare('SELECT id FROM invoices WHERE client_id = ? AND number = ?')
      .get(clientId, input.number);
    if (clash) {
      throw new HttpError(409, `This client already has an invoice numbered ${input.number}.`);
    }

    const { base, gst, total } = gstBreakdown(toMinor(input.baseAmount), input.gstPercent, input.gstMode);

    transact(db, () => {
      const invoiceId = newId();
      db.prepare(
        `INSERT INTO invoices (
           id, client_id, number, amount_minor, base_amount_minor, gst_percent, gst_amount_minor,
           gst_mode, issue_date, due_date, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        invoiceId,
        clientId,
        input.number,
        total,
        base,
        input.gstPercent,
        gst,
        input.gstMode,
        input.issueDate,
        input.dueDate,
        new Date().toISOString(),
      );
      // Same transaction as the invoice: an invoice whose file half-exists is a
      // state nothing should ever read.
      if (input.fileUrl) {
        addAttachment(db, { invoiceId }, { url: input.fileUrl, name: input.fileName ?? '' });
      }
      logSystemActivity(db, clientId, `Invoice ${input.number} added`, req.actor!.name);
    });

    res.status(201).json(snapshotFor(db, req));
  });

  router.delete('/:invoiceId', requireWrite, (req, res) => {
    const { clientId, invoiceId } = req.params as { clientId: string; invoiceId: string };
    const invoice = loadInvoice(db, clientId, invoiceId);
    transact(db, () => {
      db.prepare('DELETE FROM invoices WHERE id = ?').run(invoiceId);
      logSystemActivity(db, clientId, `Invoice ${invoice.number} deleted`, req.actor!.name);
      // Deleting an invoice destroys its payment history with it, so the amount
      // goes into the trail — the feed entry alone would not say what was lost.
      audit(db, req, {
        action: 'invoice.delete',
        targetType: 'invoice',
        targetId: invoiceId,
        targetLabel: invoice.number,
        detail: `client ${clientId}, ${invoice.amount_minor} minor units`,
      });
    });
    res.json(snapshotFor(db, req));
  });

  router.put('/:invoiceId/file', requireWrite, (req, res) => {
    const { clientId, invoiceId } = req.params as { clientId: string; invoiceId: string };
    loadInvoice(db, clientId, invoiceId);
    const input = fileSchema.parse(req.body);
    setAttachment(db, { invoiceId }, { url: input.fileUrl ?? '', name: input.fileName ?? '' });
    res.json(snapshotFor(db, req));
  });

  router.delete('/:invoiceId/file', requireWrite, (req, res) => {
    const { clientId, invoiceId } = req.params as { clientId: string; invoiceId: string };
    const invoice = loadInvoice(db, clientId, invoiceId);
    const attached = attachmentsFor(db, { invoiceId })[0];
    transact(db, () => {
      clearAttachments(db, { invoiceId });
      audit(db, req, {
        action: 'invoice.file_delete',
        targetType: 'invoice',
        targetId: invoiceId,
        targetLabel: invoice.number,
        detail: attached?.name ? `removed ${attached.name}` : 'removed attachment',
      });
    });
    res.json(snapshotFor(db, req));
  });

  router.post('/:invoiceId/payments', requireWrite, (req, res) => {
    const { clientId, invoiceId } = req.params as { clientId: string; invoiceId: string };
    const invoice = loadInvoice(db, clientId, invoiceId);
    const input = paymentSchema.parse(req.body);

    assertPaymentDate(invoice, input.date);

    // Refuse to settle more than is owed. Allowing it produced a negative
    // balance, which is not a state the rest of the app has any meaning for —
    // credits and refunds need their own accounting, not an overflowing invoice.
    const settled = toMinor(input.bankAmount) + toMinor(input.tds);
    const balance = balanceMinor(invoice.amount_minor, paymentsOf(db, invoiceId));
    if (settled > balance) {
      throw new HttpError(
        400,
        balance <= 0
          ? 'This invoice is already settled in full.'
          : 'That is more than the amount still outstanding on this invoice.',
      );
    }

    transact(db, () => {
      db.prepare(
        `INSERT INTO payments (id, invoice_id, bank_amount_minor, tds_minor, date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(),
        invoiceId,
        toMinor(input.bankAmount),
        toMinor(input.tds),
        input.date,
        new Date().toISOString(),
      );
      logSystemActivity(db, clientId, `Payment logged for invoice ${invoice.number}`, req.actor!.name);
    });

    res.status(201).json(snapshotFor(db, req));
  });

  /**
   * Settles whatever is still outstanding in one entry.
   *
   * The accounting date is explicit, defaulting to today. It used to be
   * hardcoded to today with no way to say otherwise, which is wrong whenever the
   * money arrived before anyone got around to recording it — an invoice settled
   * on the 21st for a transfer that landed on the 18th belonged in the 18th's
   * cash, and there was no way to say so.
   *
   * That hardcoded date was also `new Date().toISOString().slice(0, 10)` — the
   * UTC day, not the workspace's. Between midnight and 05:30 in Asia/Kolkata it
   * stamped yesterday, which is the exact bug M-01 fixed everywhere else and
   * this line escaped.
   */
  router.post('/:invoiceId/settle', requireWrite, (req, res) => {
    const { clientId, invoiceId } = req.params as { clientId: string; invoiceId: string };
    const invoice = loadInvoice(db, clientId, invoiceId);
    const input = settleSchema.parse(req.body ?? {});
    const date = input.date ?? todayISO();
    assertPaymentDate(invoice, date);

    const balance = balanceMinor(invoice.amount_minor, paymentsOf(db, invoiceId));
    if (balance <= 0) {
      res.json(snapshotFor(db, req));
      return;
    }

    transact(db, () => {
      db.prepare(
        `INSERT INTO payments (id, invoice_id, bank_amount_minor, tds_minor, date, created_at)
         VALUES (?, ?, ?, 0, ?, ?)`,
      ).run(newId(), invoiceId, balance, date, new Date().toISOString());
      logSystemActivity(db, clientId, `Payment logged for invoice ${invoice.number}`, req.actor!.name);
    });

    res.json(snapshotFor(db, req));
  });

  router.delete('/:invoiceId/payments/:paymentId', requireWrite, (req, res) => {
    const { clientId, invoiceId, paymentId } = req.params as {
      clientId: string;
      invoiceId: string;
      paymentId: string;
    };
    const invoice = loadInvoice(db, clientId, invoiceId);
    const payment = db
      .prepare(
        'SELECT bank_amount_minor, tds_minor, date FROM payments WHERE id = ? AND invoice_id = ?',
      )
      .get(paymentId, invoiceId) as
      | { bank_amount_minor: number; tds_minor: number; date: string }
      | undefined;
    if (!payment) throw notFound('Payment');

    transact(db, () => {
      db.prepare('DELETE FROM payments WHERE id = ? AND invoice_id = ?').run(paymentId, invoiceId);
      // Removing a payment un-settles an invoice. That is exactly the kind of
      // change someone would want explained later, so both the feed and the
      // trail record what was removed.
      logSystemActivity(
        db,
        clientId,
        `Payment removed from invoice ${invoice.number}`,
        req.actor!.name,
      );
      audit(db, req, {
        action: 'payment.delete',
        targetType: 'payment',
        targetId: paymentId,
        targetLabel: invoice.number,
        detail: `bank ${payment.bank_amount_minor} + TDS ${payment.tds_minor} minor units, dated ${payment.date}`,
      });
    });

    res.json(snapshotFor(db, req));
  });

  return router;
}
