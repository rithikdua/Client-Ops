import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../auth/passwordPolicy';
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
import { isSafeUrl, UNSAFE_URL_MESSAGE } from '../../../src/lib/urls';

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as unknown as [T, ...T[]]);

/**
 * A real calendar day, `YYYY-MM-DD`. The shape check alone would accept
 * 2026-99-99 and 2026-02-31, so the parsed date has to round-trip back to the
 * same string.
 */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.')
  .refine(
    (v) => {
      const parsed = new Date(v + 'T00:00:00Z');
      // toISOString() throws on an Invalid Date, which would surface as a 500,
      // so check the timestamp before formatting it.
      if (Number.isNaN(parsed.getTime())) return false;
      return parsed.toISOString().slice(0, 10) === v;
    },
    { message: 'That is not a real date.' },
  );
const optionalDate = z.union([isoDate, z.literal('')]).optional();

/** Money arrives as whole currency units and is converted to minor units. */
const majorAmount = z.number().finite().min(0).max(1_000_000_000);
const text = (max = 500) => z.string().trim().max(max);

/**
 * A link we are willing to store. Refusing `javascript:` and friends here keeps
 * the database clean; the UI refuses to render them too, so an older row cannot
 * become a stored-XSS payload either.
 */
const linkUrl = (max = 2000) =>
  text(max).refine((v) => v === '' || isSafeUrl(v), { message: UNSAFE_URL_MESSAGE });

export const gstMode = z.enum(['excluded', 'included']);
export const currency = z.enum(['USD', 'INR', 'EUR', 'GBP', 'AED']);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

/**
 * The record version the client was editing. Optional: a request that omits it
 * keeps the old last-write-wins behaviour, which is what scripts and the CLI
 * expect. See domain/versions.ts.
 */
const version = z.number().int().min(0).optional();

const clientFields = z.object({
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
  website: linkUrl(300).default(''),
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

/**
 * Cross-field date rules, applied to a whole client record.
 *
 * Each date is a real calendar day on its own (M-01), which is not the same as
 * the set of them making sense: a contract ending before it starts, or an
 * onboarding date before the start date, are both accepted by per-field
 * validation and both wrong. Empty means "not set" and is never compared.
 */
export function checkClientDates(record: {
  startDate?: string;
  onboardingDate?: string;
  contractEndDate?: string;
}): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const { startDate, onboardingDate, contractEndDate } = record;
  if (startDate && contractEndDate && contractEndDate < startDate) {
    issues.push({
      path: 'contractEndDate',
      message: 'The contract cannot end before it starts.',
    });
  }
  if (startDate && onboardingDate && onboardingDate < startDate) {
    issues.push({
      path: 'onboardingDate',
      message: 'Onboarding cannot be dated before the contract starts.',
    });
  }
  return issues;
}

/** Create: every date rule can be checked from the payload alone. */
export const clientSchema = clientFields.superRefine((value, ctx) => {
  for (const issue of checkClientDates(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message });
  }
});

/**
 * Update: a patch may carry only one of the dates, so the rules are checked in
 * the route against the stored record rather than here.
 */
export const clientPatchSchema = clientFields.partial().extend({
  name: text(200).min(1).optional(),
  version,
});

export const contactSchema = z.object({
  name: text(200).min(1, 'A contact name is required.'),
  role: text(200).default(''),
  email: text(200).default(''),
  phone: text(60).default(''),
  /** Used by the global "add contact" flow to create the client too. */
  newClientName: text(200).optional(),
});

export const invoiceSchema = z
  .object({
    number: text(60).min(1, 'An invoice number is required.'),
    baseAmount: majorAmount,
    gstPercent: z.number().min(0).max(100).default(0),
    gstMode: gstMode.default('excluded'),
    issueDate: isoDate,
    dueDate: isoDate,
    fileName: text(300).default(''),
    fileUrl: linkUrl().default(''),
  })
  // Individually valid dates can still be nonsense together: an invoice due
  // before it was issued is overdue the moment it exists, and every ageing
  // report built on it is wrong.
  .refine((v) => v.dueDate >= v.issueDate, {
    path: ['dueDate'],
    message: 'The due date cannot be before the issue date.',
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
  fileUrl: linkUrl().default(''),
});

export const deliverableSchema = z.object({
  title: text(300).min(1, 'A title is required.'),
  description: text(2000).default(''),
  owner: text(120).default(''),
  dueDate: isoDate,
  status: enumOf(DELIVERABLE_STATUS_OPTIONS).default('Not started'),
  fileName: text(300).default(''),
  fileUrl: linkUrl().default(''),
});

export const deliverablePatchSchema = z.object({
  status: enumOf(DELIVERABLE_STATUS_OPTIONS).optional(),
  fileName: text(300).optional(),
  fileUrl: linkUrl().optional(),
  version,
});

export const documentSchema = z.object({
  name: text(300).min(1, 'A document name is required.'),
  type: enumOf(DOCUMENT_TYPE_OPTIONS),
  url: linkUrl().default(''),
  source: z.enum(['us', 'client']).default('us'),
});

export const activitySchema = z.object({
  note: text(4000).min(1, 'A note is required.'),
  // No `author`: the server records whoever is signed in.
});

export const taskSchema = z.object({
  title: text(300).min(1, 'A ticket title is required.'),
  description: text(4000).default(''),
  assignee: text(120).default(''),
  status: enumOf(TASK_STATUS_OPTIONS).default('New'),
  priority: enumOf(PRIORITY_OPTIONS).default('Medium'),
  dueDate: optionalDate,
  attachments: z.array(linkUrl()).max(20).default([]),
});

export const taskPatchSchema = taskSchema.partial().extend({ version });

export const teammateSchema = z.object({
  name: text(200).min(1, 'A name is required.'),
  email: z.string().trim().toLowerCase().email(),
  role: text(200).default(''),
  permission: enumOf(PERMISSION_OPTIONS).default('Editor'),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
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
  version,
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
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
  /** Required when the server sets SETUP_TOKEN. */
  setupToken: z.string().max(200).default(''),
});

export const redeemResetSchema = z.object({
  token: z.string().min(1, 'A reset link is required.').max(500),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
});

export const changePasswordSchema = z.object({
  // Empty is allowed only for a Google-only account that has no password yet;
  // the server checks which case applies.
  currentPassword: z.string().max(200).default(''),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
});
