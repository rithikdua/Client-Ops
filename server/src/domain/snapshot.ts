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
import { WORKSPACE_TIMEZONE } from './activity';
import { loadAttachments, type Attachment } from './attachments';

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
    mustChangePassword: boolean;
    previewAs: { id: string; name: string; role: string; summary: string } | null;
  };
  clients: Client[];
  team: Teammate[];
  followUps: FollowUp[];
  /**
   * Settings that belong to the workspace rather than to the person. The
   * timezone is here so the browser measures a calendar day exactly as the
   * server does, instead of each side asking its own machine.
   */
  workspace: { timezone: string };
  /**
   * Present only when the caller asked for a page of clients.
   *
   * A snapshot without it carries every client the user may see, which is the
   * contract every screen is built on and what mutations still answer with.
   * With it, `clients` is one window onto the list.
   */
  page?: { total: number; returned: number; nextCursor: string | null };
}

/**
 * How to narrow and cut up the client list.
 *
 * The filtering and sorting live here rather than in the browser because a page
 * is only meaningful if the server sorts the same way the screen does —
 * otherwise "the next 50" is the next 50 of a different list.
 */
export interface ClientPage {
  limit: number;
  /** The id after which to continue. Positional, so it survives inserts. */
  cursor?: string;
  search?: string;
  health?: string;
  sort?: 'name' | 'value' | 'health';
}

/** Nobody benefits from a page of 100,000, and it is a cheap way to ask for one. */
export const MAX_PAGE = 500;

/* -- assignments --------------------------------------------------------- */

/**
 * An assignment stores both the account and the name (see `domain/assignees`).
 * When the two disagree — someone married, corrected a typo, or started going by
 * a different name — the account is the one that gets maintained, so it is the
 * one we display. Reading the stored string instead would leave every client,
 * task and deliverable they own showing the name they had on the day it was
 * assigned, which is most of what made the old model unworkable.
 *
 * The stored name still answers for assignments with no account behind them: a
 * contractor, someone who left, a name typed before they had a login.
 */
const ASSIGNEE_JOIN = (alias: string, idColumn: string) =>
  `LEFT JOIN users assignee_user ON assignee_user.id = ${alias}.${idColumn}`;

const CURRENT_NAME = (alias: string, nameColumn: string) =>
  `COALESCE(assignee_user.name, ${alias}.${nameColumn}) AS ${nameColumn}`;

/* -- row shapes ---------------------------------------------------------- */

interface ClientRow {
  id: string;
  name: string;
  version: number;
  industry: string;
  health: Client['health'];
  owner: string;
  owner_user_id: string | null;
  /** The linked account's current name, when there is one. Overrides `owner`. */
  owner_account_name: string | null;
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
/*
 * Each of these loads one collection for *every* client in one query, and
 * returns it grouped by client.
 *
 * They used to take a client id and be called once per client, which is the
 * fan-out F-08 is about: with 206 accounts a single snapshot ran 2,274 prepared
 * statements and took 126ms; at 606 accounts, 6,674 statements and 413ms. Every
 * mutation pays that, because every mutation answers with a snapshot.
 *
 * Nothing about the result changes — same rows, same order, same shape — so the
 * cost of the old version was pure.
 */

/**
 * Attachments for every row of one kind, keyed by the row they hang off.
 *
 * The owning table is named rather than passed through from a request: it
 * becomes part of a SQL string.
 */
function attachmentsByOwner(
  db: Db,
  ownerColumn: 'invoice_id' | 'deliverable_id' | 'document_id' | 'task_id',
): Map<string, Attachment[]> {
  return loadAttachments(db, `a.${ownerColumn} IS NOT NULL`, []);
}

/**
 * The single file an invoice, deliverable or document carries.
 *
 * The table permits more than one — it is shared with tasks, which hold a list
 * — so this is where "at most one" is enforced for the three that only ever
 * show one. Extra rows would be a bug elsewhere; showing the first beats
 * showing nothing.
 */
const firstFile = (list: Attachment[] | undefined) =>
  list?.length ? { name: list[0].name, url: list[0].url } : null;

/**
 * Restricts a collection query to the clients actually being returned.
 *
 * Without this, asking for a page of 50 still loads every invoice in the
 * workspace — the query count would be fixed but the work would not be.
 */
function scope(alias: string, ids: string[] | undefined): string {
  return ids ? ` AND ${alias}client_id IN (${ids.map(() => '?').join(',')})` : '';
}

function loadContacts(db: Db, ids?: string[]): Map<string, Contact[]> {
  const rows = db
    .prepare(
      `SELECT id, client_id, name, role, email, phone FROM contacts
        WHERE archived_at IS NULL${scope('', ids)} ORDER BY client_id, rowid`,
    )
    .all(...((ids ?? []) as never[])) as (Contact & { client_id: string })[];
  const map = new Map<string, Contact[]>();
  for (const { client_id, ...contact } of rows) {
    const list = map.get(client_id);
    if (list) list.push(contact);
    else map.set(client_id, [contact]);
  }
  return map;
}

function loadInvoices(db: Db, ids?: string[]): Map<string, Invoice[]> {
  const rows = db
    .prepare(
      `SELECT id, client_id, number, amount_minor, base_amount_minor, gst_percent,
              gst_amount_minor, gst_mode, issue_date, due_date
         FROM invoices WHERE archived_at IS NULL${scope('', ids)} ORDER BY client_id, rowid`,
    )
    .all(...((ids ?? []) as never[])) as {
    id: string;
    client_id: string;
    number: string;
    amount_minor: number;
    base_amount_minor: number;
    gst_percent: number;
    gst_amount_minor: number;
    gst_mode: Invoice['gstMode'];
    issue_date: string;
    due_date: string;
  }[];

  // Payments for every invoice at once, then handed out by invoice id.
  const payments = new Map<string, Invoice['payments']>();
  for (const p of db
    .prepare(
      `SELECT p.id, p.invoice_id, p.bank_amount_minor, p.tds_minor, p.date
         FROM payments p JOIN invoices i ON i.id = p.invoice_id
        WHERE 1 = 1${scope('i.', ids)}
        ORDER BY p.invoice_id, p.date, p.rowid`,
    )
    .all(...((ids ?? []) as never[])) as {
    id: string;
    invoice_id: string;
    bank_amount_minor: number;
    tds_minor: number;
    date: string;
  }[]) {
    const entry = { id: p.id, bankAmount: p.bank_amount_minor, tds: p.tds_minor, date: p.date };
    const list = payments.get(p.invoice_id);
    if (list) list.push(entry);
    else payments.set(p.invoice_id, [entry]);
  }

  const files = attachmentsByOwner(db, 'invoice_id');
  const map = new Map<string, Invoice[]>();
  for (const r of rows) {
    const invoice: Invoice = {
      id: r.id,
      number: r.number,
      amount: r.amount_minor,
      baseAmount: r.base_amount_minor,
      gstPercent: r.gst_percent,
      gstAmount: r.gst_amount_minor,
      gstMode: r.gst_mode,
      issueDate: r.issue_date,
      dueDate: r.due_date,
      file: firstFile(files.get(r.id)),
      payments: payments.get(r.id) ?? [],
    };
    const list = map.get(r.client_id);
    if (list) list.push(invoice);
    else map.set(r.client_id, [invoice]);
  }
  return map;
}

function loadDeliverables(db: Db, ids?: string[]): Map<string, Deliverable[]> {
  const rows = db
    .prepare(
      `SELECT d.id, d.client_id, d.title, d.description, ${CURRENT_NAME('d', 'owner')},
              d.owner_user_id, d.due_date, d.status, d.version
         FROM deliverables d ${ASSIGNEE_JOIN('d', 'owner_user_id')}
        WHERE d.archived_at IS NULL${scope('d.', ids)} ORDER BY d.client_id, d.rowid`,
    )
    .all(...((ids ?? []) as never[])) as {
    id: string;
    client_id: string;
    title: string;
    description: string;
    owner: string;
    owner_user_id: string | null;
    due_date: string;
    status: Deliverable['status'];
    version: number;
  }[];
  const files = attachmentsByOwner(db, 'deliverable_id');
  const map = new Map<string, Deliverable[]>();
  for (const r of rows) {
    const list = map.get(r.client_id) ?? [];
    list.push({
      id: r.id,
      title: r.title,
      description: r.description,
      owner: r.owner,
      ownerUserId: r.owner_user_id ?? undefined,
      dueDate: r.due_date,
      status: r.status,
      version: r.version,
      file: firstFile(files.get(r.id)),
    });
    map.set(r.client_id, list);
  }
  return map;
}

function loadDocuments(db: Db, ids?: string[]): Map<string, ClientDocument[]> {
  const rows = db
    .prepare(
      `SELECT id, client_id, name, type, date, source FROM documents
        WHERE archived_at IS NULL${scope('', ids)} ORDER BY client_id, rowid`,
    )
    .all(...((ids ?? []) as never[])) as {
    id: string;
    client_id: string;
    name: string;
    type: ClientDocument['type'];
    date: string;
    source: 'us' | 'client';
  }[];
  const files = attachmentsByOwner(db, 'document_id');
  const map = new Map<string, ClientDocument[]>();
  for (const r of rows) {
    const list = map.get(r.client_id) ?? [];
    list.push({
      id: r.id,
      name: r.name,
      type: r.type,
      date: r.date,
      url: firstFile(files.get(r.id))?.url ?? '',
      source: r.source,
    });
    map.set(r.client_id, list);
  }
  return map;
}

function loadActivity(db: Db, ids?: string[]): Map<string, ActivityEntry[]> {
  const rows = db
    .prepare(
      `SELECT id, client_id, date, author, note, kind FROM activity
        WHERE 1 = 1${scope('', ids)}
        ORDER BY client_id, date DESC, created_at DESC, rowid DESC`,
    )
    .all(...((ids ?? []) as never[])) as (ActivityEntry & { client_id: string })[];
  const map = new Map<string, ActivityEntry[]>();
  for (const { client_id, ...entry } of rows) {
    const list = map.get(client_id);
    if (list) list.push(entry);
    else map.set(client_id, [entry]);
  }
  return map;
}

function loadTasks(db: Db, ids?: string[]): Map<string, Task[]> {
  const rows = db
    .prepare(
      `SELECT t.id, t.client_id, t.title, t.description, ${CURRENT_NAME('t', 'assignee')},
              t.assignee_user_id, t.status, t.priority, t.due_date, t.version
         FROM tasks t ${ASSIGNEE_JOIN('t', 'assignee_user_id')}
        WHERE t.archived_at IS NULL${scope('t.', ids)} ORDER BY t.client_id, t.rowid`,
    )
    .all(...((ids ?? []) as never[])) as {
    id: string;
    client_id: string;
    title: string;
    description: string;
    assignee: string;
    assignee_user_id: string | null;
    status: Task['status'];
    priority: Task['priority'];
    due_date: string;
    version: number;
  }[];
  const files = attachmentsByOwner(db, 'task_id');
  const map = new Map<string, Task[]>();
  for (const r of rows) {
    const list = map.get(r.client_id) ?? [];
    list.push({
      id: r.id,
      title: r.title,
      description: r.description,
      assignee: r.assignee,
      assigneeUserId: r.assignee_user_id ?? undefined,
      status: r.status,
      priority: r.priority,
      dueDate: r.due_date,
      version: r.version,
      attachments: (files.get(r.id) ?? []).map((a) => a.url),
    });
    map.set(r.client_id, list);
  }
  return map;
}

/** Everything the client projection needs, loaded once for the whole snapshot. */
interface Collections {
  contacts: Map<string, Contact[]>;
  invoices: Map<string, Invoice[]>;
  deliverables: Map<string, Deliverable[]>;
  documents: Map<string, ClientDocument[]>;
  activity: Map<string, ActivityEntry[]>;
  tasks: Map<string, Task[]>;
}

/**
 * Loads only what this user is allowed to receive.
 *
 * The access check is here rather than after loading, so a teammate without
 * invoice access does not cause the invoices query to run at all. That is both
 * the permission and, at scale, most of the work.
 */
function loadCollections(db: Db, access: Access, ids?: string[]): Collections {
  const empty = new Map<string, never[]>();
  return {
    contacts: access.clients ? loadContacts(db, ids) : empty,
    tasks: access.clients ? loadTasks(db, ids) : empty,
    activity: access.clients ? loadActivity(db, ids) : empty,
    invoices: access.invoices ? loadInvoices(db, ids) : empty,
    deliverables: access.deliverables ? loadDeliverables(db, ids) : empty,
    documents: access.documents ? loadDocuments(db, ids) : empty,
  };
}

/* -- assembly ------------------------------------------------------------ */

/**
 * Sections whose screens list rows belonging to a client, and therefore need the
 * client's identity to label them. Follow-ups is here because a follow-up row
 * names the account it relates to.
 */
const CLIENT_FACING_SECTIONS = [
  'overview',
  'clients',
  'invoices',
  'deliverables',
  'documents',
  'followups',
] as const;

function needsClientRoster(access: Access): boolean {
  return CLIENT_FACING_SECTIONS.some((section) => access[section]);
}

/**
 * Turns a row into the client object this user is allowed to see, in three
 * widening levels: identity, roster, then the full record.
 *
 * Two failures this replaces, both of which made the section switches a lie:
 *
 * Building the whole client object and letting the UI ignore fields is not
 * authorization. An Overview-only teammate was receiving every account's GSTIN,
 * legal name, internal notes and scope of work, one devtools tab away — while the
 * documentation promised Overview was "a dashboard, not a master key".
 *
 * And gating the *container* on Clients access made the other sections useless on
 * their own: an invoices-only teammate got an empty client list, so the Invoices
 * screen — whose data hangs off those clients — showed "no invoices yet" while
 * invoices existed. Each section now brings its own rows, and asks only for the
 * client identity needed to label them.
 */
function toClient(row: ClientRow, access: Access, all: Collections): Client {
  // Identity: what it takes to say which account a row belongs to, and to format
  // its amounts in the right currency. Never confidential.
  const base: Client = {
    id: row.id,
    name: row.name,
    currency: row.currency,
    // Sent back on edit, so a save made from a stale screen can be refused.
    version: row.version,
    // Every collection below is filled in only if its own section allows it.
    contacts: [],
    invoices: [],
    deliverables: [],
    documents: [],
    activity: [],
    tasks: [],
  };

  // Roster: the dashboard's statistics and the account list. Health and stage
  // drive the portfolio counts; the dates drive "new this month" and renewals.
  if (access.overview || access.clients) {
    base.industry = row.industry;
    base.health = row.health;
    base.owner = row.owner_account_name ?? row.owner;
    base.ownerUserId = row.owner_user_id ?? undefined;
    base.stage = row.stage;
    base.billingCycle = row.billing_cycle;
    base.startDate = row.start_date;
    base.contractEndDate = orEmpty(row.contract_end_date);
  }

  // The confidential record, and the contacts, tasks and activity that live
  // inside it. This is the client detail screen, and it needs Clients access.
  if (access.clients) {
    base.onboardingDate = orEmpty(row.onboarding_date);
    base.paymentTerms = row.payment_terms ?? 'Net 30';
    base.website = orEmpty(row.website);
    base.notes = orEmpty(row.notes);
    base.legalName = orEmpty(row.legal_name);
    base.gstin = orEmpty(row.gstin);
    base.natureOfBusiness = orEmpty(row.nature_of_business);
    base.cityTier = orEmpty(row.city_tier);
    base.mandateType = row.mandate_type ?? 'Pilot';
    base.mandateOther = orEmpty(row.mandate_other);
    base.scopeOfWork = orEmpty(row.scope_of_work);
    base.contacts = all.contacts.get(row.id) ?? [];
    base.tasks = all.tasks.get(row.id) ?? [];
    base.activity = all.activity.get(row.id) ?? [];
  }

  // Money is withheld entirely from anyone without invoice access.
  if (access.invoices) {
    base.contractValue = row.contract_value_minor;
    base.baseAmount = row.base_amount_minor ?? undefined;
    base.gstPercent = row.gst_percent ?? undefined;
    base.gstAmount = row.gst_amount_minor ?? undefined;
    base.gstMode = row.gst_mode ?? undefined;
    base.invoices = all.invoices.get(row.id) ?? [];
  }
  if (access.deliverables) {
    base.deliverables = all.deliverables.get(row.id) ?? [];
  }
  if (access.documents) {
    base.documents = all.documents.get(row.id) ?? [];
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
      `SELECT f.id, f.name, f.company_name, f.email, f.phone, f.related_client_id, f.reason,
              ${CURRENT_NAME('f', 'owner')}, f.owner_user_id, f.due_date, f.status, f.version
         FROM follow_ups f ${ASSIGNEE_JOIN('f', 'owner_user_id')}
        WHERE f.archived_at IS NULL
        ORDER BY f.due_date, f.rowid`,
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
    owner_user_id: string | null;
    due_date: string;
    status: FollowUp['status'];
    version: number;
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
    ownerUserId: r.owner_user_id ?? undefined,
    dueDate: r.due_date,
    status: r.status,
    version: r.version,
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

/**
 * The ORDER BY for each sort the Clients screen offers.
 *
 * Written out rather than built from the request: it is interpolated into SQL,
 * and a page is only coherent if the server orders exactly as the screen does.
 */
const CLIENT_ORDER = {
  name: 'c.name COLLATE NOCASE, c.id',
  value: 'c.contract_value_minor DESC, c.id',
  // The same precedence the screen uses: at-risk first, then active, churned.
  health: `CASE c.health WHEN 'At Risk' THEN 0 WHEN 'Active' THEN 1 ELSE 2 END, c.id`,
  created: 'c.created_at, c.rowid',
} as const;

export function buildSnapshot(db: Db, actor: Actor, page?: ClientPage): Snapshot {
  const where: string[] = ['c.archived_at IS NULL'];
  const params: unknown[] = [];
  if (page?.search?.trim()) {
    where.push('(c.name LIKE ? OR c.industry LIKE ?)');
    const like = `%${page.search.trim()}%`;
    params.push(like, like);
  }
  if (page?.health && page.health !== 'all') {
    where.push('c.health = ?');
    params.push(page.health);
  }

  const order = CLIENT_ORDER[page?.sort ?? 'created'];
  // Everything the filters match, before the window is applied — so the screen
  // can say "50 of 606" rather than only how many it happens to be holding.
  const total = page
    ? (
        db
          .prepare(`SELECT COUNT(*) AS n FROM clients c WHERE ${where.join(' AND ')}`)
          .get(...(params as never[])) as { n: number }
      ).n
    : 0;

  // A cursor is the id of the last row of the previous page. Its position in
  // this ordering is found rather than assumed, so it keeps working when the
  // sort changes underneath — and a stale one starts from the beginning rather
  // than erroring, because a person's bookmark should not be a failure.
  let offset = 0;
  if (page?.cursor) {
    const ids = db
      .prepare(
        `SELECT c.id FROM clients c ${ASSIGNEE_JOIN('c', 'owner_user_id')}
          WHERE ${where.join(' AND ')} ORDER BY ${order}`,
      )
      .all(...(params as never[])) as { id: string }[];
    const at = ids.findIndex((r) => r.id === page.cursor);
    offset = at === -1 ? 0 : at + 1;
  }

  const clientRows = db
    .prepare(
      // `c.*` already carries `owner`, so the account's name arrives under its
      // own column rather than as a second `owner` whose precedence would be a
      // matter of driver behaviour.
      `SELECT c.*, assignee_user.name AS owner_account_name
         FROM clients c ${ASSIGNEE_JOIN('c', 'owner_user_id')}
        WHERE ${where.join(' AND ')}
        ORDER BY ${order}
        ${page ? 'LIMIT ? OFFSET ?' : ''}`,
    )
    .all(...([...params, ...(page ? [Math.min(page.limit, MAX_PAGE), offset] : [])] as never[])) as ClientRow[];

  // One query per collection rather than one per collection per client, and
  // scoped to the page when there is one — so asking for 50 accounts does 50
  // accounts' worth of work, not the whole workspace's.
  const collections = loadCollections(
    db,
    actor.access,
    page ? clientRows.map((row) => row.id) : undefined,
  );

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
      mustChangePassword: actor.mustChangePassword,
      previewAs: actor.previewAsId
        ? {
            id: actor.previewAsId,
            name: actor.previewAsName ?? '',
            role: actor.previewAsRole ?? '',
            summary: accessSummary(actor.access),
          }
        : null,
    },
    // Any section that shows client-labelled rows gets the list; what each row
    // *contains* is decided by toClient() above. Gating the container on Clients
    // access is what made every other section unusable on its own.
    clients: needsClientRoster(actor.access)
      ? clientRows.map((row) => toClient(row, actor.access, collections))
      : [],
    team: actor.access.team ? loadTeam(db) : [],
    followUps: actor.access.followups ? loadFollowUps(db) : [],
    workspace: { timezone: WORKSPACE_TIMEZONE },
    ...(page
      ? {
          page: {
            total,
            returned: clientRows.length,
            nextCursor:
              offset + clientRows.length < total
                ? (clientRows[clientRows.length - 1]?.id ?? null)
                : null,
          },
        }
      : {}),
  };
}
