import type { Access, Task } from '../data/types';

export type ModalType =
  | 'client'
  | 'contact'
  | 'invoice'
  | 'logPayment'
  | 'attachInvoiceFile'
  | 'deliverable'
  | 'attachFile'
  | 'document'
  | 'activity'
  | 'teammate'
  | 'permissions'
  | 'followup'
  | 'completeFollowUp'
  | 'task'
  | 'taskPreview';

/**
 * Every text/select/date field across every modal. Values are held as strings
 * (as the DOM gives them) and coerced when the modal is submitted.
 */
export type FormKey =
  | 'name'
  | 'industry'
  | 'owner'
  | 'health'
  | 'stage'
  | 'billingCycle'
  | 'startDate'
  | 'number'
  | 'issueDate'
  | 'dueDate'
  | 'status'
  | 'role'
  | 'email'
  | 'phone'
  | 'type'
  | 'note'
  | 'author'
  | 'description'
  | 'title'
  | 'fileName'
  | 'fileUrl'
  | 'source'
  | 'contactName'
  | 'contactRole'
  | 'contactEmail'
  | 'contactPhone'
  | 'initialCommitment'
  | 'initialCommitmentDue'
  | 'contractEndDate'
  | 'paymentTerms'
  | 'website'
  | 'notes'
  | 'legalName'
  | 'onboardingDate'
  | 'gstin'
  | 'natureOfBusiness'
  | 'cityTier'
  | 'mandateType'
  | 'mandateOther'
  | 'scopeOfWork'
  | 'baseAmount'
  | 'gstPercent'
  | 'gstMode'
  | 'permission'
  | 'reason'
  | 'relatedClientId'
  | 'companyName'
  | 'assignee'
  | 'bankAmount'
  | 'tds'
  | 'date'
  | 'clientId'
  | 'newClientName'
  | 'currency'
  | 'nextDate'
  | 'priority'
  | 'linkInput'
  | 'action';

export type ModalForm = Partial<Record<FormKey, string>> & {
  /** Permissions modal only. */
  access?: Access;
  /** Task modal only — data URLs and/or pasted links. */
  attachments?: string[];
};

export interface ModalState {
  type: ModalType;
  form: ModalForm;
  editing?: boolean;
  clientId?: string;
  invId?: string;
  delId?: string;
  taskId?: string;
  followUpId?: string;
  teammateId?: string;
  /** Attach-file modals: whether a file is already attached (enables Remove). */
  hasExistingFile?: boolean;
  /** Ticket preview modal only. */
  task?: Task;
}
