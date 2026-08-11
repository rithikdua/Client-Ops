import type {
  Access,
  BillingCycle,
  DeliverableStatus,
  DocumentType,
  Health,
  MandateType,
  NavKey,
  PaymentTerms,
  Permission,
  SectionKey,
  Stage,
  TaskPriority,
  TaskStatus,
} from './types';

export const ACCESS_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'clients', label: 'Clients' },
  { key: 'invoices', label: 'Invoices & Payments' },
  { key: 'deliverables', label: 'Deliverables' },
  { key: 'documents', label: 'Documents' },
  { key: 'team', label: 'Team' },
  { key: 'followups', label: 'Follow-up queue' },
  { key: 'phonebook', label: 'Phonebook' },
];

export const ALL_ACCESS: Access = ACCESS_SECTIONS.reduce((o, s) => {
  o[s.key] = true;
  return o;
}, {} as Access);

export const NAV_ORDER: NavKey[] = [
  'overview',
  'clients',
  'invoices',
  'deliverables',
  'documents',
  'team',
  'followups',
];

export const HEALTH_OPTIONS: Health[] = ['Active', 'At Risk', 'Churned'];
export const STAGE_OPTIONS: Stage[] = ['Onboarding', 'Live', 'Renewal', 'Offboarding'];
export const BILLING_OPTIONS: BillingCycle[] = ['Monthly', 'Quarterly', 'Annual', 'One-time'];
export const DELIVERABLE_STATUS_OPTIONS: DeliverableStatus[] = [
  'Not started',
  'In progress',
  'Done',
];
export const TASK_STATUS_OPTIONS: TaskStatus[] = ['New', 'In Dev', 'Pending', 'Blocked', 'Done'];
export const PRIORITY_OPTIONS: TaskPriority[] = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
export const DOCUMENT_TYPE_OPTIONS: DocumentType[] = [
  'Contract',
  'SOW',
  'Legal',
  'Invoice',
  'Other',
];
export const PAYMENT_TERMS_OPTIONS: PaymentTerms[] = [
  'Due on receipt',
  'Net 15',
  'Net 30',
  'Net 60',
];
export const MANDATE_OPTIONS: MandateType[] = [
  'Pilot',
  'Retainer',
  'Project',
  'Annual',
  'Other',
];
export const GST_RATE_OPTIONS = ['0', '5', '12', '18', '28'];
export const PERMISSION_OPTIONS: Permission[] = ['Owner', 'Editor', 'Viewer'];

/** Advancing a deliverable's status cycles through this order. */
export const DELIVERABLE_CYCLE: Record<DeliverableStatus, DeliverableStatus> = {
  'Not started': 'In progress',
  'In progress': 'Done',
  Done: 'Not started',
};
