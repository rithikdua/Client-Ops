import { Router, type Request } from 'express';
import { requireSection, requireWrite } from '../auth/permissions';
import { newId, transact, type Db } from '../db/index';
import { logSystemActivity, todayISO } from '../domain/activity';
import { bumpVersion } from '../domain/versions';
import { audit } from '../domain/audit';
import { buildSnapshot } from '../domain/snapshot';
import { HttpError, notFound } from '../http/errors';
import { clientPatchSchema, clientSchema } from '../http/validate';
import { fromMinor, gstBreakdown, toMinor } from '../money';

/** Fails the request unless the client exists. */
export function assertClient(db: Db, clientId: string): void {
  const row = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!row) throw notFound('Client');
}

export function snapshotFor(db: Db, req: Request) {
  return buildSnapshot(db, req.actor!);
}

type ClientInput = ReturnType<typeof clientSchema.parse>;

/** The three inputs that decide a contract's value. */
interface MoneyInput {
  baseAmount?: number;
  gstPercent?: number;
  gstMode?: 'excluded' | 'included';
}

/** Any of these arriving means the request is changing money. */
function touchesMoney(input: MoneyInput): boolean {
  return (
    input.baseAmount !== undefined ||
    input.gstPercent !== undefined ||
    input.gstMode !== undefined
  );
}

/**
 * Contract money is stored pre-computed so reads never re-derive GST.
 *
 * `existing` must be supplied on an update. A PATCH may carry only one of the
 * three fields, and defaulting the others to zero would silently rewrite a
 * ten-lakh contract to nothing: `{ "gstPercent": 12 }` alone used to recalculate
 * from a base of 0. Anything the caller omits is taken from the stored row.
 */
function contractColumns(input: MoneyInput, existing?: MoneyInput) {
  const baseAmount = input.baseAmount ?? existing?.baseAmount ?? 0;
  const gstPercent = input.gstPercent ?? existing?.gstPercent ?? 0;
  const gstMode = input.gstMode ?? existing?.gstMode ?? 'excluded';

  const { base, gst, total } = gstBreakdown(toMinor(baseAmount), gstPercent, gstMode);
  return {
    contract_value_minor: total,
    base_amount_minor: base,
    gst_percent: gstPercent,
    gst_amount_minor: gst,
    gst_mode: gstMode,
  };
}

/** Reads the stored money back as whole currency units, for merging. */
function storedMoney(db: Db, clientId: string): MoneyInput {
  const row = db
    .prepare('SELECT base_amount_minor, gst_percent, gst_mode FROM clients WHERE id = ?')
    .get(clientId) as
    | { base_amount_minor: number | null; gst_percent: number | null; gst_mode: string | null }
    | undefined;
  if (!row) throw notFound('Client');
  return {
    baseAmount: fromMinor(row.base_amount_minor ?? 0),
    gstPercent: row.gst_percent ?? 0,
    gstMode: row.gst_mode === 'included' ? 'included' : 'excluded',
  };
}

export function clientRoutes(db: Db): Router {
  const router = Router();

  // Editing money requires invoice access on top of write permission, so a
  // teammate who cannot see contract values cannot change them either. gstMode
  // counts: on its own it still triggers a recalculation of the contract value.
  const requireMoneyAccess = (req: Request, input: MoneyInput) => {
    if (touchesMoney(input) && !req.actor!.access.invoices) {
      throw new HttpError(403, 'You do not have access to contract values.');
    }
  };

  router.get('/', requireSection('clients'), (req, res) => {
    res.json(snapshotFor(db, req));
  });

  router.post('/', requireSection('clients'), requireWrite, (req, res) => {
    const input: ClientInput = clientSchema.parse(req.body);
    requireMoneyAccess(req, input);
    const id = newId();
    const now = new Date().toISOString();
    const money = contractColumns(input);

    transact(db, () => {
      db.prepare(
        `INSERT INTO clients (
           id, name, industry, health, owner, stage, currency, billing_cycle,
           contract_value_minor, base_amount_minor, gst_percent, gst_amount_minor, gst_mode,
           start_date, onboarding_date, contract_end_date, payment_terms, website, notes,
           legal_name, gstin, nature_of_business, city_tier, mandate_type, mandate_other,
           scope_of_work, created_at
         ) VALUES (
           @id, @name, @industry, @health, @owner, @stage, @currency, @billing_cycle,
           @contract_value_minor, @base_amount_minor, @gst_percent, @gst_amount_minor, @gst_mode,
           @start_date, @onboarding_date, @contract_end_date, @payment_terms, @website, @notes,
           @legal_name, @gstin, @nature_of_business, @city_tier, @mandate_type, @mandate_other,
           @scope_of_work, @created_at
         )`,
      ).run({
        id,
        name: input.name,
        industry: input.industry,
        health: input.health,
        owner: input.owner,
        stage: input.stage,
        currency: input.currency,
        billing_cycle: input.billingCycle,
        ...money,
        start_date: input.startDate,
        onboarding_date: input.onboardingDate || input.startDate,
        contract_end_date: input.contractEndDate || null,
        payment_terms: input.paymentTerms,
        website: input.website,
        notes: input.notes,
        legal_name: input.legalName,
        gstin: input.gstin,
        nature_of_business: input.natureOfBusiness,
        city_tier: input.cityTier,
        mandate_type: input.mandateType,
        mandate_other: input.mandateType === 'Other' ? input.mandateOther : '',
        scope_of_work: input.scopeOfWork,
        created_at: now,
      });

      if (input.contact) {
        db.prepare(
          'INSERT INTO contacts (id, client_id, name, role, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(newId(), id, input.contact.name, input.contact.role, input.contact.email, input.contact.phone);
      }

      if (input.initialCommitment) {
        db.prepare(
          `INSERT INTO deliverables (id, client_id, title, description, owner, due_date, status, created_at)
           VALUES (?, ?, ?, '', ?, ?, 'Not started', ?)`,
        ).run(
          newId(),
          id,
          input.initialCommitment.title,
          input.owner,
          input.initialCommitment.dueDate || todayISO(),
          now,
        );
      }

      logSystemActivity(db, id, 'Client created', req.actor!.name);
    });

    res.status(201).json(snapshotFor(db, req));
  });

  router.patch('/:clientId', requireSection('clients'), requireWrite, (req, res) => {
    const { clientId } = req.params;
    assertClient(db, clientId);
    const input = clientPatchSchema.parse(req.body);
    requireMoneyAccess(req, input);

    const columns: Record<string, unknown> = {};
    const map: Record<string, string> = {
      name: 'name',
      industry: 'industry',
      owner: 'owner',
      health: 'health',
      stage: 'stage',
      currency: 'currency',
      billingCycle: 'billing_cycle',
      startDate: 'start_date',
      onboardingDate: 'onboarding_date',
      contractEndDate: 'contract_end_date',
      paymentTerms: 'payment_terms',
      website: 'website',
      notes: 'notes',
      legalName: 'legal_name',
      gstin: 'gstin',
      natureOfBusiness: 'nature_of_business',
      cityTier: 'city_tier',
      mandateType: 'mandate_type',
      scopeOfWork: 'scope_of_work',
    };
    for (const [key, column] of Object.entries(map)) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) columns[column] = value;
    }
    if (input.mandateType !== undefined) {
      columns.mandate_other = input.mandateType === 'Other' ? (input.mandateOther ?? '') : '';
    }
    if (touchesMoney(input)) {
      Object.assign(columns, contractColumns(input, storedMoney(db, clientId)));
    }
    if (Object.keys(columns).length === 0) throw new HttpError(400, 'Nothing to update.');

    transact(db, () => {
      // First, so a stale write is refused before anything is changed.
      bumpVersion(db, 'clients', clientId, input.version);
      const assignments = Object.keys(columns)
        .map((c) => `${c} = @${c}`)
        .join(', ');
      db.prepare(`UPDATE clients SET ${assignments} WHERE id = @id`).run({ ...columns, id: clientId });
      logSystemActivity(db, clientId, 'Client details updated', req.actor!.name);
    });

    res.json(snapshotFor(db, req));
  });

  /**
   * Deleting a client cascades through its contacts, invoices, payments,
   * deliverables, documents, tasks and its own activity feed. There is nowhere
   * left to log it afterwards, which is exactly why the audit trail exists: the
   * counts go in before the rows are gone.
   */
  router.delete('/:clientId', requireSection('clients'), requireWrite, (req, res) => {
    const { clientId } = req.params;
    assertClient(db, clientId);
    const client = db.prepare('SELECT name FROM clients WHERE id = ?').get(clientId) as {
      name: string;
    };
    const counts = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM invoices WHERE client_id = ?)     AS invoices,
           (SELECT COUNT(*) FROM contacts WHERE client_id = ?)     AS contacts,
           (SELECT COUNT(*) FROM deliverables WHERE client_id = ?) AS deliverables,
           (SELECT COUNT(*) FROM documents WHERE client_id = ?)    AS documents,
           (SELECT COUNT(*) FROM tasks WHERE client_id = ?)        AS tasks`,
      )
      .get(clientId, clientId, clientId, clientId, clientId) as Record<string, number>;

    transact(db, () => {
      db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);
      audit(db, req, {
        action: 'client.delete',
        targetType: 'client',
        targetId: clientId,
        targetLabel: client.name,
        detail: Object.entries(counts)
          .map(([key, n]) => `${n} ${key}`)
          .join(', '),
      });
    });

    res.json(snapshotFor(db, req));
  });

  return router;
}
