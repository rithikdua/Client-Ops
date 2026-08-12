import { z } from 'zod';
import {
  BILLING_OPTIONS,
  DELIVERABLE_STATUS_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  HEALTH_OPTIONS,
  MANDATE_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
  PERMISSION_OPTIONS,
  PRIORITY_OPTIONS,
  STAGE_OPTIONS,
  TASK_STATUS_OPTIONS,
} from '../../../src/data/options';

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as unknown as [T, ...T[]]);

/** Calendar day, `YYYY-MM-DD`. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.');
const optionalDate = z.union([isoDate, z.literal('')]).optional();

/** Money arrives as whole currency units and is converted to minor units. */
const majorAmount = z.number().finite().min(0).max(1_000_000_000);
const text = (max = 500) => z.string().trim().max(max);

export const gstMode = z.enum(['excluded', 'included']);
export const currency = z.enum(['USD', 'INR', 'EUR', 'GBP', 'AED']);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const clientSchema = z.object({
  name: text(200).min(1, 'A client name is required.'),
  industry: text(200).default(''),
  owner: text(120).default(''),
  health: enumOf(HEALTH_OPTIONS),
  stage: enumOf(STAGE_OPTIONS),
  currency: currency.default('INR'),
  billingCycle: enumOf(BILLING_OPTIONS),
  baseAmount: majorAmount.default(0),
  gstPercent: z.number().min(0).max(100).default(0),
  gstMode: gstMode.default('excluded'),
  startDate: isoDate,
  onboardingDate: optionalDate,
  contractEndDate: optionalDate,
  paymentTerms: enumOf(PAYMENT_TERMS_OPTIONS).default('Net 30'),
  website: text(300).default(''),
  notes: text(4000).default(''),
  legalName: text(300).default(''),
  gstin: text(30).default(''),
  natureOfBusiness: text(200).default(''),
  cityTier: text(120).default(''),
  mandateType: enumOf(MANDATE_OPTIONS).default('Pilot'),
  mandateOther: text(200).default(''),
  scopeOfWork: text(4000).default(''),
  // Only honoured on create.
  contact: z
    .object({
      name: text(200).min(1),
      role: text(200).default(''),
      email: text(200).default(''),
      phone: text(60).default(''),
    })
    .optional(),
  initialCommitment: z
    .object({ title: text(300).min(1), dueDate: optionalDate })
    .optional(),
});

export const clientPatchSchema = clientSchema.partial().extend({
  name: text(200).min(1).optional(),
});

export const contactSchema = z.object({
  name: text(200).min(1, 'A contact name is required.'),
  role: text(200).default(''),
  email: text(200).default(''),
  phone: text(60).default(''),
  /** Used by the global "add contact" flow to create the client too. */
  newClientName: text(200).optional(),
});

export const invoiceSchema = z.object({
  number: text(60).min(1, 'An invoice number is required.'),
  baseAmount: majorAmount,
  gstPercent: z.number().min(0).max(100).default(0),
  gstMode: gstMode.default('excluded'),
  issueDate: isoDate,
  dueDate: isoDate,
  fileName: text(300).default(''),
  fileUrl: text(2000).default(''),
});

export const paymentSchema = z
  .object({
    bankAmount: majorAmount.default(0),
    tds: majorAmount.default(0),
    date: isoDate,
  })
  .refine((v) => v.bankAmount + v.tds > 0, {
    message: 'A payment needs a bank amount or a TDS amount.',
  });

export const fileSchema = z.object({
  fileName: text(300).default(''),
  fileUrl: text(2000).default(''),
});

export const deliverableSchema = z.object({
  title: text(300).min(1, 'A title is required.'),
  description: text(2000).default(''),
  owner: text(120).default(''),
  dueDate: isoDate,
  status: enumOf(DELIVERABLE_STATUS_OPTIONS).default('Not started'),
  fileName: text(300).default(''),
  fileUrl: text(2000).default(''),
});

export const deliverablePatchSchema = z.object({
  status: enumOf(DELIVERABLE_STATUS_OPTIONS).optional(),
  fileName: text(300).optional(),
  fileUrl: text(2000).optional(),
});

export const documentSchema = z.object({
  name: text(300).min(1, 'A document name is required.'),
  type: enumOf(DOCUMENT_TYPE_OPTIONS),
  url: text(2000).default(''),
  source: z.enum(['us', 'client']).default('us'),
});

export const activitySchema = z.object({
  note: text(4000).min(1, 'A note is required.'),
  author: text(120).default(''),
});

export const taskSchema = z.object({
  title: text(300).min(1, 'A ticket title is required.'),
  description: text(4000).default(''),
  assignee: text(120).default(''),
  status: enumOf(TASK_STATUS_OPTIONS).default('New'),
  priority: enumOf(PRIORITY_OPTIONS).default('Medium'),
  dueDate: optionalDate,
  attachments: z.array(text(2000)).max(20).default([]),
});

export const taskPatchSchema = taskSchema.partial();

export const teammateSchema = z.object({
  name: text(200).min(1, 'A name is required.'),
  email: z.string().trim().toLowerCase().email(),
  role: text(200).default(''),
  permission: enumOf(PERMISSION_OPTIONS).default('Editor'),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  access: z.record(z.boolean()).optional(),
});

export const accessSchema = z.object({ access: z.record(z.boolean()) });

export const followUpSchema = z.object({
  name: text(200).min(1, 'A contact name is required.'),
  companyName: text(200).default(''),
  email: text(200).default(''),
  phone: text(60).default(''),
  relatedClientId: text(60).default(''),
  reason: text(2000).default(''),
  owner: text(120).default(''),
  dueDate: isoDate,
});

export const completeFollowUpSchema = z.object({
  note: text(2000).default(''),
  action: z.enum(['snooze', 'done']),
  nextDate: optionalDate,
});

export const previewSchema = z.object({ teammateId: text(60).min(1) });

/** First-run setup: creates the workspace's first Owner. */
export const setupSchema = z.object({
  name: text(200).min(1, 'Your name is required.'),
  email: z.string().trim().toLowerCase().email(),
  role: text(200).default(''),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
});

export const changePasswordSchema = z.object({
  // Empty is allowed only for a Google-only account that has no password yet;
  // the server checks which case applies.
  currentPassword: z.string().max(200).default(''),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(200),
});
