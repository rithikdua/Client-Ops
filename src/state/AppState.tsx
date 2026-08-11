import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { ALL_ACCESS, DELIVERABLE_CYCLE } from '../data/options';
import { seedClients, seedFollowUps, TEAM_SEED } from '../data/seed';
import type {
  Access,
  AttachedFile,
  BillingCycle,
  Client,
  ClientTabId,
  CurrencyCode,
  DeliverableStatus,
  DocumentType,
  FollowUp,
  Health,
  MandateType,
  PaymentTerms,
  Permission,
  SectionKey,
  Stage,
  Task,
  TaskPriority,
  TaskStatus,
  Teammate,
  View,
} from '../data/types';
import { addDays, parseISO, toISO, todayISO, uid, type InvoicePeriod } from '../lib/dates';
import { invoiceBalance } from '../lib/invoices';
import { gstBreakdown } from '../lib/money';
import type { FormKey, ModalForm, ModalState } from './modal';

export type SortBy = 'name' | 'value' | 'health';
export type DeliverableSortBy = 'due' | 'status' | 'client' | 'owner';
export type InvoiceStatusFilter = 'all' | 'Paid' | 'Partially Paid' | 'Pending' | 'Overdue';
export type FollowUpStatusFilter = 'pending' | 'done' | 'all';
export type FollowUpSubTab = 'queue' | 'phonebook';

export interface AppStateShape {
  clients: Client[];
  team: Teammate[];
  followUps: FollowUp[];
  view: View;
  selectedId: string | null;
  clientTabId: ClientTabId;
  /** Teammate whose access is being previewed, or null for full access. */
  previewAsId: string | null;
  search: string;
  healthFilter: Health | 'all';
  sortBy: SortBy;
  invoiceSearch: string;
  invoiceStatusFilter: InvoiceStatusFilter;
  invoicePeriod: InvoicePeriod;
  invoiceCustomFrom: string;
  invoiceCustomTo: string;
  expandedInvoices: Record<string, boolean>;
  invoiceMenuOpenId: string | null;
  deliverableSortBy: DeliverableSortBy;
  followUpStatusFilter: FollowUpStatusFilter;
  followUpSubTab: FollowUpSubTab;
  followUpMenuOpenId: string | null;
  expandedFollowUps: Record<string, boolean>;
  phonebookSearch: string;
  modal: ModalState | null;
}

const initialState = (): AppStateShape => ({
  clients: seedClients(),
  team: TEAM_SEED,
  followUps: seedFollowUps(),
  view: 'overview',
  selectedId: null,
  clientTabId: 'overview',
  previewAsId: null,
  search: '',
  healthFilter: 'all',
  sortBy: 'name',
  invoiceSearch: '',
  invoiceStatusFilter: 'all',
  invoicePeriod: 'all',
  invoiceCustomFrom: '',
  invoiceCustomTo: '',
  expandedInvoices: {},
  invoiceMenuOpenId: null,
  deliverableSortBy: 'due',
  followUpStatusFilter: 'pending',
  followUpSubTab: 'queue',
  followUpMenuOpenId: null,
  expandedFollowUps: {},
  phonebookSearch: '',
  modal: null,
});

type ListName = 'contacts' | 'invoices' | 'deliverables' | 'documents';

export interface AppActions {
  goTo: (view: View) => void;
  goClients: () => void;
  openClient: (id: string) => void;
  openClientTab: (id: string, tabId: ClientTabId) => void;
  setClientTab: (id: ClientTabId) => void;

  setSearch: (v: string) => void;
  setHealthFilter: (v: Health | 'all') => void;
  setSortBy: (v: SortBy) => void;
  setInvoiceSearch: (v: string) => void;
  setInvoiceStatusFilter: (v: InvoiceStatusFilter) => void;
  setInvoicePeriod: (v: InvoicePeriod) => void;
  setInvoiceCustomFrom: (v: string) => void;
  setInvoiceCustomTo: (v: string) => void;
  setDeliverableSortBy: (v: DeliverableSortBy) => void;
  setFollowUpStatusFilter: (v: FollowUpStatusFilter) => void;
  setFollowUpSubTab: (v: FollowUpSubTab) => void;
  setPhonebookSearch: (v: string) => void;

  toggleInvoiceExpand: (invId: string) => void;
  toggleInvoiceMenu: (invId: string) => void;
  toggleFollowUpExpand: (id: string) => void;
  toggleFollowUpMenu: (id: string) => void;

  startPreview: (teammateId: string) => void;
  exitPreview: () => void;

  openAddClient: () => void;
  openEditClient: (client: Client) => void;
  openAddContact: (clientId: string) => void;
  openAddContactGlobal: () => void;
  openAddInvoice: (clientId: string) => void;
  openLogPayment: (clientId: string, invId: string, balance: number) => void;
  openAttachInvoiceFile: (clientId: string, invId: string, existing?: AttachedFile | null) => void;
  openAddDeliverable: (clientId: string) => void;
  openAttachFile: (clientId: string, delId: string, existing?: AttachedFile | null) => void;
  openAddDocument: (clientId: string) => void;
  openAddActivity: (clientId: string) => void;
  openAddTeammate: () => void;
  openManagePermissions: (member: Teammate) => void;
  openAddFollowUp: () => void;
  openEditFollowUp: (f: FollowUp) => void;
  openCompleteFollowUp: (id: string) => void;
  openAddTask: (clientId: string) => void;
  openEditTask: (clientId: string, task: Task) => void;
  openTaskPreview: (clientId: string, task: Task) => void;

  closeModal: () => void;
  updateForm: (field: FormKey, value: string) => void;
  patchForm: (patch: ModalForm) => void;
  selectContactSuggestion: (ct: { name: string; role?: string; email?: string; phone?: string }) => void;
  toggleAccessSection: (key: SectionKey) => void;
  handleTaskFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  addTaskLink: () => void;
  removeTaskAttachment: (idx: number) => void;
  submitModal: () => void;

  removeItem: (listName: ListName, clientId: string, itemId: string) => void;
  removeTeammate: (id: string) => void;
  removeFollowUp: (id: string) => void;
  reopenFollowUp: (id: string) => void;
  markInvoicePaid: (clientId: string, invId: string) => void;
  removePayment: (clientId: string, invId: string, paymentId: string) => void;
  removeInvoiceFile: (clientId: string, invId: string) => void;
  removeDeliverableFile: (clientId: string, delId: string) => void;
  cycleDeliverable: (clientId: string, delId: string) => void;
  setTaskStatus: (clientId: string, taskId: string, status: TaskStatus) => void;
  removeTask: (clientId: string, taskId: string) => void;
}

const AppStateContext = createContext<{ state: AppStateShape; actions: AppActions } | null>(null);

/** Builds `{ name, url }` from the link + display-name pair, or null if empty. */
function fileFromForm(f: ModalForm): AttachedFile | null {
  return f.fileUrl || f.fileName ? { name: f.fileName || f.fileUrl || '', url: f.fileUrl || '' } : null;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppStateShape>(initialState);

  const patch = useCallback(
    (updater: Partial<AppStateShape> | ((s: AppStateShape) => Partial<AppStateShape>)) => {
      setState((s) => ({ ...s, ...(typeof updater === 'function' ? updater(s) : updater) }));
    },
    [],
  );

  const actions = useMemo<AppActions>(() => {
    const firstTeamName = (s: AppStateShape) => (s.team[0] ? s.team[0].name : '');

    /** Prepends a read-only system entry to a client's activity feed. */
    const logActivity = (clients: Client[], clientId: string, note: string, author: string): Client[] =>
      clients.map((c) =>
        c.id === clientId
          ? {
              ...c,
              activity: [
                { id: uid('act'), date: todayISO(), author, note, kind: 'system' as const },
                ...c.activity,
              ],
            }
          : c,
      );

    const mapClient = (s: AppStateShape, clientId: string, fn: (c: Client) => Client): Client[] =>
      s.clients.map((c) => (c.id === clientId ? fn(c) : c));

    const openModal = (modal: ModalState, extra?: Partial<AppStateShape>) =>
      patch({ modal, ...extra });

    return {
      goTo: (view) => patch({ view, selectedId: null }),
      goClients: () => patch({ view: 'clients' }),
      openClient: (id) => patch({ view: 'client', selectedId: id, clientTabId: 'overview' }),
      openClientTab: (id, tabId) => patch({ view: 'client', selectedId: id, clientTabId: tabId }),
      setClientTab: (id) => patch({ clientTabId: id }),

      setSearch: (search) => patch({ search }),
      setHealthFilter: (healthFilter) => patch({ healthFilter }),
      setSortBy: (sortBy) => patch({ sortBy }),
      setInvoiceSearch: (invoiceSearch) => patch({ invoiceSearch }),
      setInvoiceStatusFilter: (invoiceStatusFilter) => patch({ invoiceStatusFilter }),
      setInvoicePeriod: (invoicePeriod) => patch({ invoicePeriod }),
      setInvoiceCustomFrom: (invoiceCustomFrom) => patch({ invoiceCustomFrom }),
      setInvoiceCustomTo: (invoiceCustomTo) => patch({ invoiceCustomTo }),
      setDeliverableSortBy: (deliverableSortBy) => patch({ deliverableSortBy }),
      setFollowUpStatusFilter: (followUpStatusFilter) => patch({ followUpStatusFilter }),
      setFollowUpSubTab: (followUpSubTab) => patch({ followUpSubTab }),
      setPhonebookSearch: (phonebookSearch) => patch({ phonebookSearch }),

      toggleInvoiceExpand: (invId) =>
        patch((s) => ({
          expandedInvoices: { ...s.expandedInvoices, [invId]: !s.expandedInvoices[invId] },
        })),
      toggleInvoiceMenu: (invId) =>
        patch((s) => ({ invoiceMenuOpenId: s.invoiceMenuOpenId === invId ? null : invId })),
      toggleFollowUpExpand: (id) =>
        patch((s) => ({ expandedFollowUps: { ...s.expandedFollowUps, [id]: !s.expandedFollowUps[id] } })),
      toggleFollowUpMenu: (id) =>
        patch((s) => ({ followUpMenuOpenId: s.followUpMenuOpenId === id ? null : id })),

      // Previewing lands on the first section the teammate can actually open.
      startPreview: (teammateId) =>
        patch((s) => {
          const member = s.team.find((t) => t.id === teammateId);
          const access: Access = { ...ALL_ACCESS, ...(member?.access ?? {}) };
          const nextView = (['overview', 'clients', 'invoices', 'deliverables', 'documents', 'team', 'followups'] as const).find(
            (v) => access[v],
          );
          return { previewAsId: teammateId, modal: null, view: nextView ?? 'overview', selectedId: null };
        }),
      exitPreview: () => patch({ previewAsId: null }),

      openAddClient: () =>
        patch((s) =>
          ({
            modal: {
              type: 'client',
              editing: false,
              form: {
                name: '',
                industry: '',
                owner: firstTeamName(s),
                health: 'Active',
                stage: 'Onboarding',
                billingCycle: 'Monthly',
                startDate: todayISO(),
                onboardingDate: todayISO(),
                currency: 'INR',
                contractEndDate: '',
                paymentTerms: 'Net 30',
                website: '',
                notes: '',
                legalName: '',
                gstin: '',
                natureOfBusiness: '',
                cityTier: '',
                mandateType: 'Pilot',
                mandateOther: '',
                scopeOfWork: '',
                baseAmount: '',
                gstPercent: '18',
                gstMode: 'excluded',
                contactName: '',
                contactRole: '',
                contactEmail: '',
                contactPhone: '',
                initialCommitment: '',
                initialCommitmentDue: '',
              },
            },
          }) as Partial<AppStateShape>,
        ),

      openEditClient: (client) =>
        openModal({
          type: 'client',
          editing: true,
          clientId: client.id,
          form: {
            name: client.name,
            industry: client.industry,
            owner: client.owner,
            health: client.health,
            stage: client.stage,
            billingCycle: client.billingCycle,
            startDate: client.startDate,
            onboardingDate: client.onboardingDate || client.startDate,
            currency: client.currency,
            contractEndDate: client.contractEndDate || '',
            paymentTerms: client.paymentTerms || 'Net 30',
            website: client.website || '',
            notes: client.notes || '',
            legalName: client.legalName || '',
            gstin: client.gstin || '',
            natureOfBusiness: client.natureOfBusiness || '',
            cityTier: client.cityTier || '',
            mandateType: client.mandateType || 'Pilot',
            mandateOther: client.mandateOther || '',
            scopeOfWork: client.scopeOfWork || '',
            baseAmount: String(client.baseAmount ?? client.contractValue ?? ''),
            gstPercent: String(client.gstPercent ?? '18'),
            gstMode: client.gstMode || 'excluded',
          },
        }),

      openAddContact: (clientId) =>
        openModal({ type: 'contact', clientId, form: { clientId, name: '', role: '', email: '', phone: '' } }),
      openAddContactGlobal: () =>
        openModal({ type: 'contact', clientId: '', form: { clientId: '', name: '', role: '', email: '', phone: '' } }),

      openAddInvoice: (clientId) =>
        patch((s) => {
          const c = s.clients.find((x) => x.id === clientId);
          const n = (c ? c.invoices.length : 0) + 1;
          return {
            modal: {
              type: 'invoice',
              clientId,
              form: {
                number: 'INV-2026-' + String(500 + n).padStart(4, '0'),
                baseAmount: '',
                gstPercent: String(c?.gstPercent ?? '18'),
                gstMode: 'excluded',
                issueDate: todayISO(),
                dueDate: '',
                fileName: '',
                fileUrl: '',
              },
            },
          };
        }),

      openLogPayment: (clientId, invId, balance) =>
        openModal(
          {
            type: 'logPayment',
            clientId,
            invId,
            form: { bankAmount: balance > 0 ? String(balance) : '', tds: '', date: todayISO() },
          },
          { invoiceMenuOpenId: null },
        ),

      openAttachInvoiceFile: (clientId, invId, existing) =>
        openModal(
          {
            type: 'attachInvoiceFile',
            clientId,
            invId,
            hasExistingFile: !!existing,
            form: { fileName: existing?.name ?? '', fileUrl: existing?.url ?? '' },
          },
          { invoiceMenuOpenId: null },
        ),

      openAddDeliverable: (clientId) =>
        patch((s) => ({
          modal: {
            type: 'deliverable',
            clientId,
            form: {
              title: '',
              description: '',
              owner: firstTeamName(s),
              dueDate: '',
              status: 'Not started',
              fileName: '',
              fileUrl: '',
            },
          },
        })),

      openAttachFile: (clientId, delId, existing) =>
        openModal({
          type: 'attachFile',
          clientId,
          delId,
          hasExistingFile: !!existing,
          form: { fileName: existing?.name ?? '', fileUrl: existing?.url ?? '' },
        }),

      openAddDocument: (clientId) =>
        openModal({
          type: 'document',
          clientId,
          form: { name: '', type: 'Contract', fileUrl: '', source: 'us' },
        }),

      openAddActivity: (clientId) =>
        patch((s) => ({
          modal: { type: 'activity', clientId, form: { note: '', author: firstTeamName(s) } },
        })),

      openAddTeammate: () =>
        openModal({
          type: 'teammate',
          form: { name: '', role: '', permission: 'Editor', access: { ...ALL_ACCESS } },
        }),

      openManagePermissions: (member) =>
        openModal({
          type: 'permissions',
          teammateId: member.id,
          form: { access: { ...ALL_ACCESS, ...(member.access ?? {}) } },
        }),

      openAddFollowUp: () =>
        patch((s) => ({
          modal: {
            type: 'followup',
            editing: false,
            form: {
              name: '',
              companyName: '',
              email: '',
              phone: '',
              relatedClientId: '',
              reason: '',
              owner: firstTeamName(s),
              dueDate: todayISO(),
            },
          },
        })),

      openEditFollowUp: (f) =>
        openModal(
          {
            type: 'followup',
            editing: true,
            followUpId: f.id,
            form: {
              name: f.name,
              companyName: f.companyName || '',
              email: f.email || '',
              phone: f.phone || '',
              relatedClientId: f.relatedClientId || '',
              reason: f.reason,
              owner: f.owner,
              dueDate: f.dueDate,
            },
          },
          { followUpMenuOpenId: null },
        ),

      // Defaults to "call back in 2 days" — the common outcome of a live call.
      openCompleteFollowUp: (id) =>
        openModal({
          type: 'completeFollowUp',
          followUpId: id,
          form: { note: '', action: 'snooze', nextDate: toISO(addDays(parseISO(todayISO()), 2)) },
        }),

      openAddTask: (clientId) =>
        patch((s) => ({
          modal: {
            type: 'task',
            clientId,
            form: {
              title: '',
              assignee: firstTeamName(s),
              description: '',
              status: 'New',
              priority: 'Medium',
              dueDate: '',
              attachments: [],
              linkInput: '',
            },
          },
        })),

      openEditTask: (clientId, task) =>
        patch((s) => ({
          modal: {
            type: 'task',
            clientId,
            editing: true,
            taskId: task.id,
            form: {
              title: task.title,
              assignee: task.assignee || firstTeamName(s),
              description: task.description || '',
              status: task.status || 'New',
              priority: task.priority || 'Medium',
              dueDate: task.dueDate || '',
              attachments: task.attachments || [],
              linkInput: '',
            },
          },
        })),

      openTaskPreview: (clientId, task) =>
        openModal({ type: 'taskPreview', clientId, task, form: {} }),

      closeModal: () => patch({ modal: null }),

      updateForm: (field, value) =>
        patch((s) => (s.modal ? { modal: { ...s.modal, form: { ...s.modal.form, [field]: value } } } : {})),

      patchForm: (p) =>
        patch((s) => (s.modal ? { modal: { ...s.modal, form: { ...s.modal.form, ...p } } } : {})),

      selectContactSuggestion: (ct) =>
        patch((s) =>
          s.modal
            ? {
                modal: {
                  ...s.modal,
                  form: {
                    ...s.modal.form,
                    contactName: ct.name,
                    contactRole: ct.role || '',
                    contactEmail: ct.email || '',
                    contactPhone: ct.phone || '',
                  },
                },
              }
            : {},
        ),

      toggleAccessSection: (key) =>
        patch((s) => {
          if (!s.modal) return {};
          const access = { ...ALL_ACCESS, ...(s.modal.form.access ?? {}) };
          return {
            modal: { ...s.modal, form: { ...s.modal.form, access: { ...access, [key]: !access[key] } } },
          };
        }),

      // Uploads are inlined as data URLs — there's no file storage behind this.
      handleTaskFileChange: (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () =>
          patch((s) =>
            s.modal
              ? {
                  modal: {
                    ...s.modal,
                    form: {
                      ...s.modal.form,
                      attachments: [...(s.modal.form.attachments ?? []), String(reader.result)],
                    },
                  },
                }
              : {},
          );
        reader.readAsDataURL(file);
        e.target.value = '';
      },

      addTaskLink: () =>
        patch((s) => {
          if (!s.modal) return {};
          const url = (s.modal.form.linkInput ?? '').trim();
          if (!url) return {};
          return {
            modal: {
              ...s.modal,
              form: { ...s.modal.form, attachments: [...(s.modal.form.attachments ?? []), url], linkInput: '' },
            },
          };
        }),

      removeTaskAttachment: (idx) =>
        patch((s) =>
          s.modal
            ? {
                modal: {
                  ...s.modal,
                  form: {
                    ...s.modal.form,
                    attachments: (s.modal.form.attachments ?? []).filter((_, i) => i !== idx),
                  },
                },
              }
            : {},
        ),

      submitModal: () =>
        patch((s) => {
          const modal = s.modal;
          if (!modal) return {};
          const f = modal.form;
          const author = firstTeamName(s);

          if (modal.type === 'teammate') {
            return {
              team: [
                ...s.team,
                {
                  id: uid('tm'),
                  name: f.name ?? '',
                  role: f.role ?? '',
                  permission: (f.permission as Permission) || 'Editor',
                  access: f.access ?? { ...ALL_ACCESS },
                },
              ],
              modal: null,
            };
          }

          if (modal.type === 'permissions') {
            return {
              team: s.team.map((t) =>
                t.id === modal.teammateId ? { ...t, access: f.access ?? { ...ALL_ACCESS } } : t,
              ),
              modal: null,
            };
          }

          if (modal.type === 'task') {
            const fields = {
              title: f.title ?? '',
              assignee: f.assignee || author,
              description: f.description ?? '',
              status: (f.status as TaskStatus) || 'New',
              priority: (f.priority as TaskPriority) || 'Medium',
              dueDate: f.dueDate ?? '',
              attachments: f.attachments ?? [],
            };
            if (modal.editing) {
              return {
                clients: mapClient(s, modal.clientId!, (c) => ({
                  ...c,
                  tasks: c.tasks.map((t) => (t.id === modal.taskId ? { ...t, ...fields } : t)),
                })),
                modal: null,
              };
            }
            return {
              clients: mapClient(s, modal.clientId!, (c) => ({
                ...c,
                tasks: [...(c.tasks ?? []), { id: uid('tsk'), ...fields }],
              })),
              modal: null,
            };
          }

          if (modal.type === 'logPayment') {
            const bank = Number(f.bankAmount) || 0;
            const tds = Number(f.tds) || 0;
            if (bank <= 0 && tds <= 0) return { modal: null };
            let clients = mapClient(s, modal.clientId!, (c) => ({
              ...c,
              invoices: c.invoices.map((i) =>
                i.id === modal.invId
                  ? {
                      ...i,
                      payments: [
                        ...(i.payments ?? []),
                        { id: uid('pay'), bankAmount: bank, tds, date: f.date || todayISO() },
                      ],
                    }
                  : i,
              ),
            }));
            const inv = s.clients.find((c) => c.id === modal.clientId)?.invoices.find((i) => i.id === modal.invId);
            if (inv) clients = logActivity(clients, modal.clientId!, 'Payment logged for invoice ' + inv.number, author);
            return { clients, modal: null };
          }

          if (modal.type === 'completeFollowUp') {
            const entry = f.note ? [{ id: uid('cl'), date: todayISO(), note: f.note }] : [];
            const done = f.action === 'done';
            return {
              followUps: s.followUps.map((fu) =>
                fu.id === modal.followUpId
                  ? done
                    ? { ...fu, status: 'Done' as const, log: [...(fu.log ?? []), ...entry] }
                    : {
                        ...fu,
                        status: 'Pending' as const,
                        dueDate: f.nextDate || fu.dueDate,
                        log: [...(fu.log ?? []), ...entry],
                      }
                  : fu,
              ),
              modal: null,
            };
          }

          if (modal.type === 'followup') {
            const fields = {
              name: f.name ?? '',
              companyName: f.companyName ?? '',
              email: f.email ?? '',
              phone: f.phone ?? '',
              relatedClientId: f.relatedClientId ?? '',
              reason: f.reason ?? '',
              owner: f.owner || author,
              dueDate: f.dueDate || todayISO(),
            };
            if (modal.editing) {
              return {
                followUps: s.followUps.map((fu) => (fu.id === modal.followUpId ? { ...fu, ...fields } : fu)),
                modal: null,
              };
            }
            return {
              followUps: [...s.followUps, { id: uid('fu'), ...fields, status: 'Pending' as const }],
              modal: null,
            };
          }

          let next = s.clients;

          if (modal.type === 'client') {
            const { base, gst, total } = gstBreakdown(
              Number(f.baseAmount) || 0,
              Number(f.gstPercent) || 0,
              f.gstMode === 'included' ? 'included' : 'excluded',
            );
            const shared = {
              industry: f.industry ?? '',
              owner: f.owner ?? '',
              health: (f.health as Health) || 'Active',
              stage: (f.stage as Stage) || 'Onboarding',
              contractValue: total,
              baseAmount: base,
              gstPercent: Number(f.gstPercent) || 0,
              gstAmount: gst,
              gstMode: f.gstMode === 'included' ? ('included' as const) : ('excluded' as const),
              currency: (f.currency as CurrencyCode) || 'INR',
              billingCycle: (f.billingCycle as BillingCycle) || 'Monthly',
              contractEndDate: f.contractEndDate ?? '',
              paymentTerms: (f.paymentTerms as PaymentTerms) || 'Net 30',
              website: f.website ?? '',
              notes: f.notes ?? '',
              legalName: f.legalName ?? '',
              gstin: f.gstin ?? '',
              natureOfBusiness: f.natureOfBusiness ?? '',
              cityTier: f.cityTier ?? '',
              mandateType: (f.mandateType as MandateType) || 'Pilot',
              mandateOther: f.mandateType === 'Other' ? (f.mandateOther ?? '') : '',
              scopeOfWork: f.scopeOfWork ?? '',
            };
            if (modal.editing) {
              next = next.map((c) =>
                c.id === modal.clientId
                  ? {
                      ...c,
                      ...shared,
                      name: f.name || c.name,
                      startDate: f.startDate || c.startDate,
                      onboardingDate: f.onboardingDate || c.onboardingDate,
                    }
                  : c,
              );
              next = logActivity(next, modal.clientId!, 'Client details updated', author);
            } else {
              // A new client can be created with its first contact and its
              // first commitment in one pass.
              const contacts = f.contactName
                ? [
                    {
                      id: uid('ct'),
                      name: f.contactName,
                      role: f.contactRole ?? '',
                      email: f.contactEmail ?? '',
                      phone: f.contactPhone ?? '',
                    },
                  ]
                : [];
              const deliverables = f.initialCommitment
                ? [
                    {
                      id: uid('del'),
                      title: f.initialCommitment,
                      description: '',
                      owner: f.owner || author,
                      dueDate: f.initialCommitmentDue || todayISO(),
                      status: 'Not started' as DeliverableStatus,
                    },
                  ]
                : [];
              next = [
                ...next,
                {
                  id: uid('c'),
                  ...shared,
                  name: f.name || 'Untitled client',
                  startDate: f.startDate || todayISO(),
                  onboardingDate: f.onboardingDate || todayISO(),
                  contacts,
                  invoices: [],
                  deliverables,
                  documents: [],
                  activity: [],
                  tasks: [],
                },
              ];
            }
          } else if (modal.type === 'contact') {
            const targetId = f.clientId || modal.clientId || '';
            const contact = {
              id: uid('ct'),
              name: f.name ?? '',
              role: f.role ?? '',
              email: f.email ?? '',
              phone: f.phone ?? '',
            };
            if (targetId === '__new__') {
              next = [
                ...next,
                {
                  id: uid('c'),
                  name: f.newClientName || 'Untitled client',
                  industry: '',
                  owner: author,
                  health: 'Active',
                  stage: 'Onboarding',
                  contractValue: 0,
                  billingCycle: 'Monthly',
                  startDate: todayISO(),
                  currency: 'INR',
                  contacts: [contact],
                  invoices: [],
                  deliverables: [],
                  documents: [],
                  activity: [],
                  tasks: [],
                },
              ];
            } else {
              next = next.map((c) => (c.id === targetId ? { ...c, contacts: [...c.contacts, contact] } : c));
              next = logActivity(next, targetId, 'Contact "' + contact.name + '" added', author);
            }
          } else if (modal.type === 'invoice') {
            const { base, gst, total } = gstBreakdown(
              Number(f.baseAmount) || 0,
              Number(f.gstPercent) || 0,
              f.gstMode === 'included' ? 'included' : 'excluded',
            );
            next = next.map((c) =>
              c.id === modal.clientId
                ? {
                    ...c,
                    invoices: [
                      ...c.invoices,
                      {
                        id: uid('inv'),
                        number: f.number ?? '',
                        amount: total,
                        baseAmount: base,
                        gstPercent: Number(f.gstPercent) || 0,
                        gstAmount: gst,
                        gstMode: f.gstMode === 'included' ? ('included' as const) : ('excluded' as const),
                        issueDate: f.issueDate || todayISO(),
                        dueDate: f.dueDate || todayISO(),
                        payments: [],
                        file: fileFromForm(f),
                      },
                    ],
                  }
                : c,
            );
            next = logActivity(next, modal.clientId!, 'Invoice ' + (f.number ?? '') + ' added', author);
          } else if (modal.type === 'attachInvoiceFile') {
            next = next.map((c) =>
              c.id === modal.clientId
                ? {
                    ...c,
                    invoices: c.invoices.map((i) => (i.id === modal.invId ? { ...i, file: fileFromForm(f) } : i)),
                  }
                : c,
            );
          } else if (modal.type === 'deliverable') {
            next = next.map((c) =>
              c.id === modal.clientId
                ? {
                    ...c,
                    deliverables: [
                      ...c.deliverables,
                      {
                        id: uid('del'),
                        title: f.title ?? '',
                        description: f.description ?? '',
                        owner: f.owner || author,
                        dueDate: f.dueDate || todayISO(),
                        status: (f.status as DeliverableStatus) || 'Not started',
                        file: fileFromForm(f),
                      },
                    ],
                  }
                : c,
            );
            next = logActivity(next, modal.clientId!, 'Deliverable "' + (f.title ?? '') + '" added', author);
          } else if (modal.type === 'document') {
            next = next.map((c) =>
              c.id === modal.clientId
                ? {
                    ...c,
                    documents: [
                      ...c.documents,
                      {
                        id: uid('doc'),
                        name: f.name ?? '',
                        type: (f.type as DocumentType) || 'Other',
                        date: todayISO(),
                        url: f.fileUrl ?? '',
                        source: f.source === 'client' ? ('client' as const) : ('us' as const),
                      },
                    ],
                  }
                : c,
            );
            next = logActivity(next, modal.clientId!, 'Document "' + (f.name ?? '') + '" added', author);
          } else if (modal.type === 'activity') {
            next = next.map((c) =>
              c.id === modal.clientId
                ? {
                    ...c,
                    activity: [
                      {
                        id: uid('act'),
                        date: todayISO(),
                        author: f.author || author,
                        note: f.note ?? '',
                        kind: 'note' as const,
                      },
                      ...c.activity,
                    ],
                  }
                : c,
            );
          } else if (modal.type === 'attachFile') {
            next = next.map((c) =>
              c.id === modal.clientId
                ? {
                    ...c,
                    deliverables: c.deliverables.map((d) =>
                      d.id === modal.delId ? { ...d, file: fileFromForm(f) } : d,
                    ),
                  }
                : c,
            );
          }

          return { clients: next, modal: null };
        }),

      removeItem: (listName, clientId, itemId) =>
        patch((s) => ({
          clients: mapClient(s, clientId, (c) => ({
            ...c,
            [listName]: (c[listName] as { id: string }[]).filter((i) => i.id !== itemId),
          })),
          invoiceMenuOpenId: null,
        })),

      removeTeammate: (id) => patch((s) => ({ team: s.team.filter((t) => t.id !== id) })),
      removeFollowUp: (id) =>
        patch((s) => ({ followUps: s.followUps.filter((f) => f.id !== id), followUpMenuOpenId: null })),
      reopenFollowUp: (id) =>
        patch((s) => ({
          followUps: s.followUps.map((f) => (f.id === id ? { ...f, status: 'Pending' as const } : f)),
        })),

      markInvoicePaid: (clientId, invId) =>
        patch((s) => {
          const inv = s.clients.find((c) => c.id === clientId)?.invoices.find((i) => i.id === invId);
          let clients = mapClient(s, clientId, (c) => ({
            ...c,
            invoices: c.invoices.map((i) =>
              i.id === invId
                ? {
                    ...i,
                    payments: [
                      ...(i.payments ?? []),
                      { id: uid('pay'), bankAmount: invoiceBalance(i), tds: 0, date: todayISO() },
                    ],
                  }
                : i,
            ),
          }));
          if (inv) {
            clients = logActivity(clients, clientId, 'Payment logged for invoice ' + inv.number, firstTeamName(s));
          }
          return { clients, invoiceMenuOpenId: null };
        }),

      removePayment: (clientId, invId, paymentId) =>
        patch((s) => ({
          clients: mapClient(s, clientId, (c) => ({
            ...c,
            invoices: c.invoices.map((i) =>
              i.id === invId ? { ...i, payments: i.payments.filter((p) => p.id !== paymentId) } : i,
            ),
          })),
        })),

      removeInvoiceFile: (clientId, invId) =>
        patch((s) => ({
          clients: mapClient(s, clientId, (c) => ({
            ...c,
            invoices: c.invoices.map((i) => (i.id === invId ? { ...i, file: null } : i)),
          })),
          modal: null,
        })),

      removeDeliverableFile: (clientId, delId) =>
        patch((s) => ({
          clients: mapClient(s, clientId, (c) => ({
            ...c,
            deliverables: c.deliverables.map((d) => (d.id === delId ? { ...d, file: null } : d)),
          })),
          modal: null,
        })),

      cycleDeliverable: (clientId, delId) =>
        patch((s) => {
          const del = s.clients.find((c) => c.id === clientId)?.deliverables.find((d) => d.id === delId);
          let clients = mapClient(s, clientId, (c) => ({
            ...c,
            deliverables: c.deliverables.map((d) =>
              d.id === delId ? { ...d, status: DELIVERABLE_CYCLE[d.status] } : d,
            ),
          }));
          if (del) {
            clients = logActivity(
              clients,
              clientId,
              'Deliverable "' + del.title + '" moved to ' + DELIVERABLE_CYCLE[del.status],
              firstTeamName(s),
            );
          }
          return { clients };
        }),

      setTaskStatus: (clientId, taskId, status) =>
        patch((s) => {
          const task = s.clients.find((c) => c.id === clientId)?.tasks.find((t) => t.id === taskId);
          let clients = mapClient(s, clientId, (c) => ({
            ...c,
            tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
          }));
          if (task && task.status !== status) {
            clients = logActivity(
              clients,
              clientId,
              'Task "' + task.title + '" moved to ' + status,
              firstTeamName(s),
            );
          }
          return { clients };
        }),

      removeTask: (clientId, taskId) =>
        patch((s) => ({
          clients: mapClient(s, clientId, (c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== taskId) })),
        })),
    };
  }, [patch]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useApp must be used inside <AppStateProvider>');
  return ctx;
}
