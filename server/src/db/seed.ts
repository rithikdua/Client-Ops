import { ACCESS_SECTIONS } from '../../../src/data/options';
import { countUsers } from '../auth/accounts';
import { hashPassword } from '../auth/passwords';
import { toMinor } from '../money';
import { envString } from '../config';
import { newId, transact, type Db } from './index';
import { TEAM_SEED, seedClients, seedFollowUps } from './seedData';

/**
 * Password given to every demo account. Development convenience only — seeding
 * refuses to run in production unless SEED_PASSWORD is set explicitly.
 */
const DEFAULT_SEED_PASSWORD = 'demo1234';

export function isSeeded(db: Db): boolean {
  return countUsers(db) > 0;
}

/**
 * Loads the sample workspace: four demo teammates, six client accounts and the
 * follow-up queue. This is *opt-in* (SEED_DEMO_DATA=1 or `npm run db:demo`) — a
 * real deployment starts empty and creates its first account through first-run
 * setup instead. No-op if any user already exists.
 */
export function seedDemoWorkspace(db: Db, opts: { password?: string } = {}): void {
  if (isSeeded(db)) return;

  const password = opts.password ?? envString('SEED_PASSWORD', DEFAULT_SEED_PASSWORD);
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_PASSWORD) {
    throw new Error(
      'Refusing to seed demo data in production with the default password. Set SEED_PASSWORD.',
    );
  }

  const now = new Date().toISOString();

  transact(db, () => {
    const insertUser = db.prepare(
      `INSERT INTO users (id, name, email, role, permission, password_hash, password_salt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAccess = db.prepare(
      'INSERT INTO user_access (user_id, section, allowed) VALUES (?, ?, ?)',
    );

    for (const member of TEAM_SEED) {
      const { hash, salt } = hashPassword(password);
      insertUser.run(
        member.id,
        member.name,
        member.email.toLowerCase(),
        member.role,
        member.permission,
        hash,
        salt,
        now,
      );
      for (const section of ACCESS_SECTIONS) {
        insertAccess.run(member.id, section.key, member.access[section.key] ? 1 : 0);
      }
    }

    const insertClient = db.prepare(
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
    );
    const insertContact = db.prepare(
      'INSERT INTO contacts (id, client_id, name, role, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertInvoice = db.prepare(
      `INSERT INTO invoices (
         id, client_id, number, amount_minor, base_amount_minor, gst_percent, gst_amount_minor,
         gst_mode, issue_date, due_date, file_name, file_url, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    );
    const insertPayment = db.prepare(
      `INSERT INTO payments (id, invoice_id, bank_amount_minor, tds_minor, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertDeliverable = db.prepare(
      `INSERT INTO deliverables (
         id, client_id, title, description, owner, due_date, status, file_name, file_url, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    );
    const insertDocument = db.prepare(
      `INSERT INTO documents (id, client_id, name, type, date, url, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertActivity = db.prepare(
      `INSERT INTO activity (id, client_id, date, author, note, kind, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertTask = db.prepare(
      `INSERT INTO tasks (id, client_id, title, description, assignee, status, priority, due_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const c of seedClients()) {
      insertClient.run({
        id: c.id,
        name: c.name,
        industry: c.industry,
        health: c.health,
        owner: c.owner,
        stage: c.stage,
        currency: c.currency,
        billing_cycle: c.billingCycle,
        contract_value_minor: toMinor(c.contractValue ?? 0),
        base_amount_minor: c.baseAmount == null ? null : toMinor(c.baseAmount),
        gst_percent: c.gstPercent ?? null,
        gst_amount_minor: c.gstAmount == null ? null : toMinor(c.gstAmount),
        gst_mode: c.gstMode ?? null,
        start_date: c.startDate,
        onboarding_date: c.onboardingDate ?? null,
        contract_end_date: c.contractEndDate ?? null,
        payment_terms: c.paymentTerms ?? 'Net 30',
        website: c.website ?? null,
        notes: c.notes ?? null,
        legal_name: c.legalName ?? null,
        gstin: c.gstin ?? null,
        nature_of_business: c.natureOfBusiness ?? null,
        city_tier: c.cityTier ?? null,
        mandate_type: c.mandateType ?? null,
        mandate_other: c.mandateOther ?? null,
        scope_of_work: c.scopeOfWork ?? null,
        created_at: now,
      });

      for (const ct of c.contacts) {
        insertContact.run(ct.id, c.id, ct.name, ct.role, ct.email, ct.phone);
      }

      for (const inv of c.invoices) {
        insertInvoice.run(
          inv.id,
          c.id,
          inv.number,
          toMinor(inv.amount),
          toMinor(inv.baseAmount),
          inv.gstPercent,
          toMinor(inv.gstAmount),
          inv.gstMode,
          inv.issueDate,
          inv.dueDate,
          now,
        );
        for (const p of inv.payments) {
          insertPayment.run(p.id, inv.id, toMinor(p.bankAmount), toMinor(p.tds), p.date, now);
        }
      }

      for (const d of c.deliverables) {
        insertDeliverable.run(d.id, c.id, d.title, d.description, d.owner, d.dueDate, d.status, now);
      }
      for (const doc of c.documents) {
        insertDocument.run(doc.id, c.id, doc.name, doc.type, doc.date, doc.url ?? null, doc.source ?? 'us', now);
      }
      // Seeded activity is hand-written history, so it keeps kind 'note'.
      for (const a of [...c.activity].reverse()) {
        insertActivity.run(a.id, c.id, a.date, a.author, a.note, a.kind ?? 'note', now);
      }
      for (const t of c.tasks) {
        insertTask.run(t.id, c.id, t.title, t.description, t.assignee, t.status, t.priority, t.dueDate, now);
      }
    }

    const insertFollowUp = db.prepare(
      `INSERT INTO follow_ups (
         id, name, company_name, email, phone, related_client_id, reason, owner, due_date, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const f of seedFollowUps()) {
      insertFollowUp.run(
        f.id,
        f.name,
        f.companyName,
        f.email,
        f.phone,
        f.relatedClientId || null,
        f.reason,
        f.owner,
        f.dueDate,
        f.status,
        now,
      );
    }
  });
}

/** Wipes every row. Used by tests and `npm run db:reset`. */
export function resetDatabase(db: Db): void {
  transact(db, () => {
    for (const table of [
      'follow_up_log',
      'follow_ups',
      'task_attachments',
      'tasks',
      'activity',
      'documents',
      'deliverables',
      'payments',
      'invoices',
      'contacts',
      'clients',
      'sessions',
      'user_access',
      'users',
    ]) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  });
}

export { newId, DEFAULT_SEED_PASSWORD };
