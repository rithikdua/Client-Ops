import { ACCESS_SECTIONS } from '../../../src/data/options';
import type {
  Access,
  ActivityEntry,
  Client,
  ClientDocument,
  Contact,
  Deliverable,
  FollowUp,
  Invoice,
  Task,
  Teammate,
} from '../../../src/data/types';
import type { Actor } from '../auth/permissions';
import { loadAccess } from '../auth/permissions';
import type { Db } from '../db/index';

/**
 * The whole workspace as the current actor is allowed to see it.
 *
 * Mutations return a fresh snapshot rather than a patch: the dataset is small,
 * and it means the client can never drift out of sync with the server's view of
 * permissions. Revisit with per-resource responses if the data grows.
 */
export interface Snapshot {
  me: {
    id: string;
    name: string;
    email: string;
    role: string;
    permission: string;
    access: Access;
    canWrite: boolean;
    canManageTeam: boolean;
    hasPassword: boolean;
    previewAs: { id: string; name: string; role: string; summary: string } | null;
  };
  clients: Client[];
  team: Teammate[];
  followUps: FollowUp[];
}

/* -- row shapes ---------------------------------------------------------- */

interface ClientRow {
  id: string;
  name: string;
  industry: string;
  health: Client['health'];
  owner: string;
  stage: Client['stage'];
  currency: Client['currency'];
  billing_cycle: Client['billingCycle'];
  contract_value_minor: number;
  base_amount_minor: number | null;
  gst_percent: number | null;
  gst_amount_minor: number | null;
  gst_mode: Client['gstMode'] | null;
  start_date: string;
  onboarding_date: string | null;
  contract_end_date: string | null;
  payment_terms: Client['paymentTerms'] | null;
  website: string | null;
  notes: string | null;
  legal_name: string | null;
  gstin: string | null;
  nature_of_business: string | null;
  city_tier: string | null;
  mandate_type: Client['mandateType'] | null;
  mandate_other: string | null;
  scope_of_work: string | null;
}

const orEmpty = (v: string | null | undefined) => v ?? '';

/* -- per-resource loaders ------------------------------------------------ */

function loadContacts(db: Db, clientId: string): Contact[] {
  return db
    .prepare('SELECT id, name, role, email, phone FROM contacts WHERE client_id = ? ORDER BY rowid')
    .all(clientId) as Contact[];
}

function loadInvoices(db: Db, clientId: string): Invoice[] {
  const rows = db
    .prepare(
      `SELECT id, number, amount_minor, base_amount_minor, gst_percent, gst_amount_minor,
              gst_mode, issue_date, due_date, file_name, file_url
         FROM invoices WHERE client_id = ? ORDER BY rowid`,
    )
    .all(clientId) as {
    id: string;
    number: string;
    amount_minor: number;
    base_amount_minor: number;
    gst_percent: number;
    gst_amount_minor: number;
    gst_mode: Invoice['gstMode'];
    issue_date: string;
    due_date: string;
    file_name: string | null;
    file_url: string | null;
  }[];

  const paymentStmt = db.prepare(
    'SELECT id, bank_amount_minor, tds_minor, date FROM payments WHERE invoice_id = ? ORDER BY date, rowid',
  );

  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    amount: r.amount_minor,
    baseAmount: r.base_amount_minor,
    gstPercent: r.gst_percent,
    gstAmount: r.gst_amount_minor,
    gstMode: r.gst_mode,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    file: r.file_url || r.file_name ? { name: orEmpty(r.file_name), url: orEmpty(r.file_url) } : null,
    payments: (
      paymentStmt.all(r.id) as { id: string; bank_amount_minor: number; tds_minor: number; date: string }[]
    ).map((p) => ({ id: p.id, bankAmount: p.bank_amount_minor, tds: p.tds_minor, date: p.date })),
  }));
}

function loadDeliverables(db: Db, clientId: string): Deliverable[] {
  const rows = db
    .prepare(
      `SELECT id, title, description, owner, due_date, status, file_name, file_url
         FROM deliverables WHERE client_id = ? ORDER BY rowid`,
    )
    .all(clientId) as {
    id: string;
    title: string;
    description: string;
    owner: string;
    due_date: string;
    status: Deliverable['status'];
    file_name: string | null;
    file_url: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    owner: r.owner,
    dueDate: r.due_date,
    status: r.status,
    file: r.file_url || r.file_name ? { name: orEmpty(r.file_name), url: orEmpty(r.file_url) } : null,
  }));
}

function loadDocuments(db: Db, clientId: string): ClientDocument[] {
  const rows = db
    .prepare('SELECT id, name, type, date, url, source FROM documents WHERE client_id = ? ORDER BY rowid')
    .all(clientId) as {
    id: string;
    name: string;
    type: ClientDocument['type'];
    date: string;
    url: string | null;
    source: 'us' | 'client';
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    date: r.date,
    url: orEmpty(r.url),
    source: r.source,
  }));
}

function loadActivity(db: Db, clientId: string): ActivityEntry[] {
  return db
    .prepare(
      `SELECT id, date, author, note, kind FROM activity
        WHERE client_id = ? ORDER BY date DESC, created_at DESC, rowid DESC`,
    )
    .all(clientId) as ActivityEntry[];
}

function loadTasks(db: Db, clientId: string): Task[] {
  const rows = db
    .prepare(
      `SELECT id, title, description, assignee, status, priority, due_date
         FROM tasks WHERE client_id = ? ORDER BY rowid`,
    )
    .all(clientId) as {
    id: string;
    title: string;
    description: string;
    assignee: string;
    status: Task['status'];
    priority: Task['priority'];
    due_date: string;
  }[];
  const attachStmt = db.prepare(
    'SELECT url FROM task_attachments WHERE task_id = ? ORDER BY rowid',
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    assignee: r.assignee,
    status: r.status,
    priority: r.priority,
    dueDate: r.due_date,
    attachments: (attachStmt.all(r.id) as { url: string }[]).map((a) => a.url),
  }));
}

/* -- assembly ------------------------------------------------------------ */

function toClient(db: Db, row: ClientRow, access: Access): Client {
  const base: Client = {
    id: row.id,
    name: row.name,
    industry: row.industry,
    health: row.health,
    owner: row.owner,
    stage: row.stage,
    currency: row.currency,
    billingCycle: row.billing_cycle,
    startDate: row.start_date,
    onboardingDate: orEmpty(row.onboarding_date),
    contractEndDate: orEmpty(row.contract_end_date),
    paymentTerms: row.payment_terms ?? 'Net 30',
    website: orEmpty(row.website),
    notes: orEmpty(row.notes),
    legalName: orEmpty(row.legal_name),
    gstin: orEmpty(row.gstin),
    natureOfBusiness: orEmpty(row.nature_of_business),
    cityTier: orEmpty(row.city_tier),
    mandateType: row.mandate_type ?? 'Pilot',
    mandateOther: orEmpty(row.mandate_other),
    scopeOfWork: orEmpty(row.scope_of_work),
    contacts: loadContacts(db, row.id),
    deliverables: loadDeliverables(db, row.id),
    activity: loadActivity(db, row.id),
    tasks: loadTasks(db, row.id),
    // Filled in below, subject to access.
    invoices: [],
    documents: [],
  };

  // Money is withheld entirely from anyone without invoice access — this is the
  // server-side half of what the UI hides.
  if (access.invoices) {
    base.contractValue = row.contract_value_minor;
    base.baseAmount = row.base_amount_minor ?? undefined;
    base.gstPercent = row.gst_percent ?? undefined;
    base.gstAmount = row.gst_amount_minor ?? undefined;
    base.gstMode = row.gst_mode ?? undefined;
    base.invoices = loadInvoices(db, row.id);
  }
  if (access.documents) {
    base.documents = loadDocuments(db, row.id);
  }
  return base;
}

function loadTeam(db: Db): Teammate[] {
  const rows = db
    .prepare('SELECT id, name, role, permission FROM users ORDER BY created_at, rowid')
    .all() as { id: string; name: string; role: string; permission: Teammate['permission'] }[];
  return rows.map((r) => ({ ...r, access: loadAccess(db, r.id) }));
}

function loadFollowUps(db: Db): FollowUp[] {
  const rows = db
    .prepare(
      `SELECT id, name, company_name, email, phone, related_client_id, reason, owner, due_date, status
         FROM follow_ups ORDER BY due_date, rowid`,
    )
    .all() as {
    id: string;
    name: string;
    company_name: string;
    email: string;
    phone: string;
    related_client_id: string | null;
    reason: string;
    owner: string;
    due_date: string;
    status: FollowUp['status'];
  }[];
  const logStmt = db.prepare(
    'SELECT id, date, note FROM follow_up_log WHERE follow_up_id = ? ORDER BY created_at, rowid',
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    companyName: r.company_name,
    email: r.email,
    phone: r.phone,
    relatedClientId: orEmpty(r.related_client_id),
    reason: r.reason,
    owner: r.owner,
    dueDate: r.due_date,
    status: r.status,
    log: logStmt.all(r.id) as FollowUp['log'],
  }));
}

/** Human-readable summary of what a previewed teammate can see. */
function accessSummary(access: Access): string {
  const granted = ACCESS_SECTIONS.filter((s) => access[s.key]);
  if (granted.length === ACCESS_SECTIONS.length) return 'everything';
  if (granted.length === 0) return 'nothing yet';
  return granted.map((s) => s.label).join(', ');
}

export function buildSnapshot(db: Db, actor: Actor): Snapshot {
  const clientRows = db
    .prepare('SELECT * FROM clients ORDER BY created_at, rowid')
    .all() as ClientRow[];

  return {
    me: {
      id: actor.userId,
      name: actor.name,
      email: actor.email,
      role: actor.role,
      permission: actor.permission,
      access: actor.access,
      canWrite: actor.canWrite,
      canManageTeam: actor.canManageTeam,
      hasPassword: actor.hasPassword,
      previewAs: actor.previewAsId
        ? {
            id: actor.previewAsId,
            name: actor.previewAsName ?? '',
            role: actor.previewAsRole ?? '',
            summary: accessSummary(actor.access),
          }
        : null,
    },
    clients: actor.access.clients || actor.access.overview
      ? clientRows.map((row) => toClient(db, row, actor.access))
      : [],
    team: actor.access.team ? loadTeam(db) : [],
    followUps: actor.access.followups ? loadFollowUps(db) : [],
  };
}
