import { Router } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { logSystemActivity } from '../domain/activity';
import { balanceMinor, type PaymentLike } from '../domain/invoices';
import { notFound } from '../http/errors';
import { fileSchema, invoiceSchema, paymentSchema } from '../http/validate';
import { gstBreakdown, toMinor } from '../money';
import { assertClient, snapshotFor } from './clients';

interface InvoiceRow {
  id: string;
  number: string;
  amount_minor: number;
}

function loadInvoice(db: Db, clientId: string, invoiceId: string): InvoiceRow {
  const row = db
    .prepare('SELECT id, number, amount_minor FROM invoices WHERE id = ? AND client_id = ?')
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
export function invoiceRoutes(db: Db): Router {
  const router = Router({ mergeParams: true });
  router.use(requireSection('invoices'));

  router.post('/', requireWrite, (req, res) => {
    const { clientId } = req.params as { clientId: string };
    assertClient(db, clientId);
    const input = invoiceSchema.parse(req.body);
    const { base, gst, total } = gstBreakdown(toMinor(input.baseAmount), input.gstPercent, input.gstMode);

    transact(db, () => {
      db.prepare(
        `INSERT INTO invoices (
           id, client_id, number, amount_minor, base_amount_minor, gst_percent, gst_amount_minor,
           gst_mode, issue_date, due_date, file_name, file_url, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(),
        clientId,
        input.number,
        total,
        base,
        input.gstPercent,
        gst,
        input.gstMode,
        input.issueDate,
        input.dueDate,
        input.fileName || null,
        input.fileUrl || null,
        new Date().toISOString(),
      );
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
    });
    res.json(snapshotFor(db, req));
  });

  router.put('/:invoiceId/file', requireWrite, (req, res) => {
    const { clientId, invoiceId } = req.params as { clientId: string; invoiceId: string };
    loadInvoice(db, clientId, invoiceId);
    const input = fileSchema.parse(req.body);
    db.prepare('UPDATE invoices SET file_name = ?, file_url = ? WHERE id = ?').run(
      input.fileName || null,
      input.fileUrl || null,
      invoiceId,
    );
    res.json(snapshotFor(db, req));
  });

  router.delete('/:invoiceId/file', requireWrite, (req, res) => {
    const { clientId, invoiceId } = req.params as { clientId: string; invoiceId: string };
    loadInvoice(db, clientId, invoiceId);
    db.prepare('UPDATE invoices SET file_name = NULL, file_url = NULL WHERE id = ?').run(invoiceId);
    res.json(snapshotFor(db, req));
  });

  router.post('/:invoiceId/payments', requireWrite, (req, res) => {
    const { clientId, invoiceId } = req.params as { clientId: string; invoiceId: string };
    const invoice = loadInvoice(db, clientId, invoiceId);
    const input = paymentSchema.parse(req.body);

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

  /** Settles whatever is still outstanding in one entry. */
  router.post('/:invoiceId/settle', requireWrite, (req, res) => {
    const { clientId, invoiceId } = req.params as { clientId: string; invoiceId: string };
    const invoice = loadInvoice(db, clientId, invoiceId);
    const balance = balanceMinor(invoice.amount_minor, paymentsOf(db, invoiceId));
    if (balance <= 0) {
      res.json(snapshotFor(db, req));
      return;
    }

    transact(db, () => {
      db.prepare(
        `INSERT INTO payments (id, invoice_id, bank_amount_minor, tds_minor, date, created_at)
         VALUES (?, ?, ?, 0, ?, ?)`,
      ).run(newId(), invoiceId, balance, new Date().toISOString().slice(0, 10), new Date().toISOString());
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
    loadInvoice(db, clientId, invoiceId);
    const result = db
      .prepare('DELETE FROM payments WHERE id = ? AND invoice_id = ?')
      .run(paymentId, invoiceId);
    if (result.changes === 0) throw notFound('Payment');
    res.json(snapshotFor(db, req));
  });

  return router;
}
