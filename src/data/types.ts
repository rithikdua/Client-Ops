export type Health = 'Active' | 'At Risk' | 'Churned';
export type Stage = 'Onboarding' | 'Live' | 'Renewal' | 'Offboarding';
export type BillingCycle = 'Monthly' | 'Quarterly' | 'Annual' | 'One-time';
export type DeliverableStatus = 'Not started' | 'In progress' | 'Done';
export type TaskStatus = 'New' | 'In Dev' | 'Pending' | 'Blocked' | 'Done';
export type TaskPriority = 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
export type DocumentType = 'Contract' | 'SOW' | 'Legal' | 'Invoice' | 'Other';
export type PaymentTerms = 'Due on receipt' | 'Net 15' | 'Net 30' | 'Net 60';
export type MandateType = 'Pilot' | 'Retainer' | 'Project' | 'Annual' | 'Other';
export type Permission = 'Owner' | 'Editor' | 'Viewer';
export type CurrencyCode = 'USD' | 'INR' | 'EUR' | 'GBP' | 'AED';
export type GstMode = 'excluded' | 'included';

/** Sections a teammate's access can be granted or revoked per-section. */
export type SectionKey =
  | 'overview'
  | 'clients'
  | 'invoices'
  | 'deliverables'
  | 'documents'
  | 'team'
  | 'followups'
  | 'phonebook';

export type Access = Record<SectionKey, boolean>;

/** Sidebar destinations — `phonebook` lives as a sub-tab of Follow-ups. */
export type NavKey = Exclude<SectionKey, 'phonebook'>;

export type View = NavKey | 'client';

export type ClientTabId =
  | 'overview'
  | 'contacts'
  | 'invoices'
  | 'deliverables'
  | 'documents'
  | 'tasks'
  | 'activity'
  | 'archived';

/**
 * A record that was deleted, which here means hidden rather than destroyed.
 *
 * Enough to recognise it and put it back — not the record itself. Restoring
 * returns a fresh snapshot, which is where the real data comes from.
 */
export interface ArchivedRecord {
  id: string;
  /** The table it lives in: `clients`, `invoices`, `follow_ups`… */
  type: string;
  /** Its name, number or title — whatever a person would know it by. */
  label: string;
  archivedAt: string;
  clientId?: string;
  clientName?: string;
}

export interface AttachedFile {
  name: string;
  url: string;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

/** A part-payment against an invoice. Settled amount = bank + TDS withheld. */
export interface Payment {
  id: string;
  bankAmount: number;
  tds: number;
  date: string;
}

/**
 * NOTE: every monetary field in this file is an integer count of **minor
 * units** (paise/cents), matching the API and the database. Format with
 * `fmtMoney`, never by hand.
 */
export interface Invoice {
  id: string;
  number: string;
  /** Gross total, i.e. base + GST when GST is excluded from the base. */
  amount: number;
  baseAmount: number;
  gstPercent: number;
  gstAmount: number;
  gstMode: GstMode;
  issueDate: string;
  dueDate: string;
  payments: Payment[];
  file?: AttachedFile | null;
}

export interface Deliverable {
  id: string;
  /** Bumped on every edit; sent back on save so a stale write is refused. */
  version?: number;
  /** The account responsible, when they are a workspace member. */
  ownerUserId?: string;
  title: string;
  description: string;
  owner: string;
  dueDate: string;
  status: DeliverableStatus;
  file?: AttachedFile | null;
}

export interface ClientDocument {
  id: string;
  name: string;
  type: DocumentType;
  date: string;
  url?: string;
  /** Who supplied the document — us, or the client. */
  source?: 'us' | 'client';
}

export interface ActivityEntry {
  id: string;
  date: string;
  author: string;
  note: string;
  /** `system` entries are auto-logged; `note` entries are typed by a person. */
  kind?: 'system' | 'note';
}

export interface Task {
  id: string;
  /** Bumped on every edit; sent back on save so a stale write is refused. */
  version?: number;
  /** The account responsible, when they are a workspace member. */
  assigneeUserId?: string;
  title: string;
  description: string;
  assignee: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  /** Data URLs (uploads) and/or pasted links. */
  attachments?: string[];
}

/**
 * A client account, **as projected for the signed-in user**.
 *
 * The server sends three widening levels, and the optionality below is the
 * contract, not laziness (see `server/src/domain/snapshot.ts`):
 *
 *  - *identity* — `id`, `name`, `currency` and the empty collections. Enough to
 *    label a row. Anyone holding any client-facing section gets this, which is
 *    what lets Invoices, Deliverables and Documents work on their own.
 *  - *roster* — adds `industry`, `health`, `owner`, `stage`, `billingCycle`,
 *    `startDate`, `contractEndDate`. This is the dashboard and the account list:
 *    Overview or Clients access.
 *  - *detail* — adds the confidential record: GSTIN, legal name, notes, scope of
 *    work, website, payment terms. Clients access only, because that is the
 *    screen it belongs to.
 *
 * Money fields are separate again and require Invoices access at every level.
 * A field the user may not see is **absent**, never blanked or zeroed: the UI
 * cannot be trusted to hide what the payload contains.
 */
export interface Client {
  id: string;
  name: string;
  currency: CurrencyCode;
  /** Bumped on every edit; sent back on save so a stale write is refused. */
  version?: number;
  contacts: Contact[];
  invoices: Invoice[];
  deliverables: Deliverable[];
  documents: ClientDocument[];
  activity: ActivityEntry[];
  tasks: Task[];

  /* roster — Overview or Clients access */
  industry?: string;
  /**
   * The account that owns this client, when the owner is a workspace member.
   * `owner` remains their name: it stays readable after the account is removed,
   * and covers people who never had one.
   */
  ownerUserId?: string;
  health?: Health;
  owner?: string;
  stage?: Stage;
  billingCycle?: BillingCycle;
  startDate?: string;
  contractEndDate?: string;

  /* money — Invoices access */
  /** Gross contract value in minor units, derived from base + GST on save. */
  contractValue?: number;
  baseAmount?: number;
  gstPercent?: number;
  gstAmount?: number;
  gstMode?: GstMode;

  /* detail — Clients access */
  onboardingDate?: string;
  paymentTerms?: PaymentTerms;
  website?: string;
  notes?: string;
  legalName?: string;
  gstin?: string;
  natureOfBusiness?: string;
  cityTier?: string;
  mandateType?: MandateType;
  mandateOther?: string;
  scopeOfWork?: string;
}

export interface Teammate {
  id: string;
  name: string;
  role: string;
  permission: Permission;
  access: Access;
}

export interface FollowUpLogEntry {
  id: string;
  date: string;
  note: string;
}

export interface FollowUp {
  id: string;
  /** Bumped on every edit; sent back on save so a stale write is refused. */
  version?: number;
  /** The account responsible, when they are a workspace member. */
  ownerUserId?: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  /** Empty when the contact isn't an existing client yet. */
  relatedClientId: string;
  reason: string;
  owner: string;
  dueDate: string;
  status: 'Pending' | 'Done';
  log?: FollowUpLogEntry[];
}
