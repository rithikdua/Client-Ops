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
  | 'activity';

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
  title: string;
  description: string;
  assignee: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  /** Data URLs (uploads) and/or pasted links. */
  attachments?: string[];
}

export interface Client {
  id: string;
  name: string;
  industry: string;
  health: Health;
  owner: string;
  stage: Stage;
  /**
   * Gross contract value in minor units, derived from base + GST on save.
   * Absent when the signed-in user has no invoice access — the server omits
   * every money field rather than sending values the UI merely hides.
   */
  contractValue?: number;
  billingCycle: BillingCycle;
  startDate: string;
  currency: CurrencyCode;
  contacts: Contact[];
  invoices: Invoice[];
  deliverables: Deliverable[];
  documents: ClientDocument[];
  activity: ActivityEntry[];
  tasks: Task[];
  baseAmount?: number;
  gstPercent?: number;
  gstAmount?: number;
  gstMode?: GstMode;
  onboardingDate?: string;
  contractEndDate?: string;
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
