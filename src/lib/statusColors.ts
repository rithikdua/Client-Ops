import type {
  DeliverableStatus,
  Health,
  Invoice,
  Permission,
  Stage,
  TaskPriority,
  TaskStatus,
} from '../data/types';
import type { ChipColor } from '../ds/Chip';
import { invoiceStatus, isInvoiceOverdue } from './invoices';

// Health and stage are roster fields: a user with only Invoices or Documents
// access is not sent them, so these accept undefined and stay neutral rather than
// forcing every caller to assert a value it may not have been given.
export function healthColor(h: Health | undefined): ChipColor {
  return h === 'Active' ? 'green' : h === 'At Risk' ? 'amber' : 'grey';
}

export function stageColor(s: Stage | undefined): ChipColor {
  return s === 'Onboarding' ? 'purple' : s === 'Live' ? 'green' : s === 'Renewal' ? 'amber' : 'grey';
}

export function deliverableStatusColor(s: DeliverableStatus): ChipColor {
  return s === 'Done' ? 'green' : s === 'In progress' ? 'amber' : 'grey';
}

export function taskStatusColor(s: TaskStatus): ChipColor {
  return s === 'Done'
    ? 'green'
    : s === 'Blocked'
      ? 'red'
      : s === 'In Dev'
        ? 'purple'
        : s === 'Pending'
          ? 'amber'
          : 'grey';
}

export function permissionColor(p: Permission): ChipColor {
  return p === 'Owner' ? 'purple' : p === 'Viewer' ? 'grey' : 'green';
}

export function invoiceStatusColor(inv: Invoice): ChipColor {
  const st = invoiceStatus(inv);
  return isInvoiceOverdue(inv)
    ? 'red'
    : st === 'Paid'
      ? 'green'
      : st === 'Partially Paid'
        ? 'purple'
        : 'grey';
}

export function priorityColor(p: TaskPriority): string {
  return p === 'Highest' || p === 'High'
    ? 'var(--danger)'
    : p === 'Medium'
      ? 'var(--warning)'
      : 'var(--info)';
}

/** Solid dot equivalent of a chip colour, for compact status indicators. */
export function chipDotColor(name: ChipColor): string {
  return name === 'green'
    ? 'var(--success)'
    : name === 'red'
      ? 'var(--danger)'
      : name === 'purple'
        ? 'var(--phot-purple)'
        : name === 'amber'
          ? '#E9A23B'
          : 'var(--ink-3)';
}
