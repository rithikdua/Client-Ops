import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { api, ApiError, type Me, type Snapshot } from '../api/client';
import { ALL_ACCESS, DELIVERABLE_CYCLE } from '../data/options';
import type {
  Access,
  AttachedFile,
  Client,
  ClientTabId,
  FollowUp,
  Health,
  SectionKey,
  Task,
  TaskStatus,
  Teammate,
  View,
} from '../data/types';
import { addDays, parseISO, toISO, todayISO, type InvoicePeriod } from '../lib/dates';
import { minorToInput } from '../lib/money';
import type { FormKey, ModalForm, ModalState } from './modal';

export type SortBy = 'name' | 'value' | 'health';
export type DeliverableSortBy = 'due' | 'status' | 'client' | 'owner';
export type InvoiceStatusFilter = 'all' | 'Paid' | 'Partially Paid' | 'Pending' | 'Overdue';
export type FollowUpStatusFilter = 'pending' | 'done' | 'all';
export type FollowUpSubTab = 'queue' | 'phonebook';

export type LoadStatus = 'loading' | 'setup' | 'signed-out' | 'ready';

export interface AppStateShape {
  /** Server-owned data. Empty until the first snapshot arrives. */
  me: Me | null;
  clients: Client[];
  team: Teammate[];
  followUps: FollowUp[];

  status: LoadStatus;
  /** A mutation is in flight. */
  busy: boolean;
  /** Last error, surfaced as a dismissible banner. */
  error: string | null;

  view: View;
  selectedId: string | null;
  clientTabId: ClientTabId;
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
  me: null,
  clients: [],
  team: [],
  followUps: [],
  status: 'loading',
  busy: false,
  error: null,
  view: 'overview',
  selectedId: null,
  clientTabId: 'overview',
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
  login: (email: string, password: string) => Promise<void>;
  /** First-run only: creates the workspace's first Owner and signs them in. */
  setup: (input: { name: string; email: string; role: string; password: string }) => Promise<void>;
  openChangePassword: () => void;
  logout: () => void;
  reload: () => void;
  dismissError: () => void;

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
  openLogPayment: (clientId: string, invId: string, balanceMinor: number) => void;
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

function fileFields(f: ModalForm) {
  return { fileName: f.fileName ?? '', fileUrl: f.fileUrl ?? '' };
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppStateShape>(initialState);
  // Actions read the latest state without being re-created on every change.
  const stateRef = useRef(state);
  stateRef.current = state;

  const patch = useCallback(
    (updater: Partial<AppStateShape> | ((s: AppStateShape) => Partial<AppStateShape>)) => {
      setState((s) => ({ ...s, ...(typeof updater === 'function' ? updater(s) : updater) }));
    },
    [],
  );

  const applySnapshot = useCallback(
    (snapshot: Snapshot, extra?: Partial<AppStateShape>) => {
      patch({
        me: snapshot.me,
        clients: snapshot.clients,
        team: snapshot.team,
        followUps: snapshot.followUps,
        status: 'ready',
        busy: false,
        error: null,
        ...extra,
      });
    },
    [patch],
  );

  /**
   * Runs a mutation: marks the app busy, applies the returned snapshot, and
   * turns failures into a visible message instead of a silent no-op.
   */
  const run = useCallback(
    async (
      fn: () => Promise<Snapshot>,
      opts: { onSuccess?: Partial<AppStateShape>; requiresWrite?: boolean } = {},
    ) => {
      const me = stateRef.current.me;
      if (opts.requiresWrite !== false && me && !me.canWrite) {
        patch({ error: 'Your account is read-only, so nothing was changed.' });
        return;
      }
      patch({ busy: true, error: null });
      try {
        applySnapshot(await fn(), opts.onSuccess);
      } catch (err) {
        if (err instanceof ApiError && err.isUnauthorized) {
          patch({ status: 'signed-out', me: null, clients: [], team: [], followUps: [], busy: false });
          return;
        }
        const detail =
          err instanceof ApiError && err.details?.length
            ? ` (${err.details.map((d) => d.message).join(' ')})`
            : '';
        patch({ busy: false, error: (err instanceof Error ? err.message : 'Something went wrong.') + detail });
      }
    },
    [applySnapshot, patch],
  );

  // Resume an existing session on load. A workspace with no accounts at all
  // lands on first-run setup rather than an unusable sign-in form.
  useEffect(() => {
    let cancelled = false;
    api
      .session()
      .then((snapshot) => {
        if (!cancelled) applySnapshot(snapshot);
      })
      .catch(async (err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.isUnauthorized) {
          const { needsSetup } = await api.status().catch(() => ({ needsSetup: false }));
          if (!cancelled) patch({ status: needsSetup ? 'setup' : 'signed-out' });
          return;
        }
        patch({
          status: 'signed-out',
          error: err instanceof Error ? err.message : 'Cannot reach the API.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [applySnapshot, patch]);

  const actions = useMemo<AppActions>(() => {
    const firstTeamName = () => {
      const s = stateRef.current;
      return s.me?.name ?? (s.team[0] ? s.team[0].name : '');
    };
    const clientById = (id: string | undefined) =>
      stateRef.current.clients.find((c) => c.id === id);
    const openModal = (modal: ModalState, extra?: Partial<AppStateShape>) => patch({ modal, ...extra });

    return {
      login: async (email, password) => {
        patch({ busy: true, error: null });
        try {
          applySnapshot(await api.login(email, password), { view: 'overview', selectedId: null });
        } catch (err) {
          patch({ busy: false, error: err instanceof Error ? err.message : 'Sign-in failed.' });
          throw err;
        }
      },
      setup: async (input) => {
        patch({ busy: true, error: null });
        try {
          applySnapshot(await api.setup(input), { view: 'overview', selectedId: null });
        } catch (err) {
          patch({ busy: false, error: err instanceof Error ? err.message : 'Setup failed.' });
          throw err;
        }
      },
      openChangePassword: () =>
        patch({
          modal: {
            type: 'changePassword',
            form: { currentPassword: '', newPassword: '', confirmPassword: '' },
          },
        }),
      logout: () => {
        void api.logout().finally(() => {
          setState({ ...initialState(), status: 'signed-out' });
        });
      },
      reload: () => {
        void run(() => api.session(), { requiresWrite: false });
      },
      dismissError: () => patch({ error: null }),

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
        patch((s) => ({ expandedInvoices: { ...s.expandedInvoices, [invId]: !s.expandedInvoices[invId] } })),
      toggleInvoiceMenu: (invId) =>
        patch((s) => ({ invoiceMenuOpenId: s.invoiceMenuOpenId === invId ? null : invId })),
      toggleFollowUpExpand: (id) =>
        patch((s) => ({ expandedFollowUps: { ...s.expandedFollowUps, [id]: !s.expandedFollowUps[id] } })),
      toggleFollowUpMenu: (id) =>
        patch((s) => ({ followUpMenuOpenId: s.followUpMenuOpenId === id ? null : id })),

      // The server records the preview on the session, so it lands on whichever
      // section that teammate is actually allowed to open.
      startPreview: (teammateId) => {
        void run(
          async () => {
            const snapshot = await api.startPreview(teammateId);
            const first = (
              ['overview', 'clients', 'invoices', 'deliverables', 'documents', 'team', 'followups'] as const
            ).find((v) => snapshot.me.access[v]);
            patch({ view: first ?? 'overview', selectedId: null, modal: null });
            return snapshot;
          },
          { requiresWrite: false },
        );
      },
      exitPreview: () => {
        void run(() => api.exitPreview(), { requiresWrite: false });
      },

      openAddClient: () =>
        patch({
          modal: {
            type: 'client',
            editing: false,
            form: {
              name: '',
              industry: '',
              owner: firstTeamName(),
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
        }),

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
            baseAmount: minorToInput(client.baseAmount ?? client.contractValue),
            gstPercent: String(client.gstPercent ?? 18),
            gstMode: client.gstMode || 'excluded',
          },
        }),

      openAddContact: (clientId) =>
        openModal({ type: 'contact', clientId, form: { clientId, name: '', role: '', email: '', phone: '' } }),
      openAddContactGlobal: () =>
        openModal({ type: 'contact', clientId: '', form: { clientId: '', name: '', role: '', email: '', phone: '' } }),

      openAddInvoice: (clientId) => {
        const c = clientById(clientId);
        const n = (c ? c.invoices.length : 0) + 1;
        openModal({
          type: 'invoice',
          clientId,
          form: {
            number: 'INV-2026-' + String(500 + n).padStart(4, '0'),
            baseAmount: '',
            gstPercent: String(c?.gstPercent ?? 18),
            gstMode: 'excluded',
            issueDate: todayISO(),
            dueDate: '',
            fileName: '',
            fileUrl: '',
          },
        });
      },

      openLogPayment: (clientId, invId, balanceMinor) =>
        openModal(
          {
            type: 'logPayment',
            clientId,
            invId,
            form: {
              bankAmount: balanceMinor > 0 ? minorToInput(balanceMinor) : '',
              tds: '',
              date: todayISO(),
            },
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
        openModal({
          type: 'deliverable',
          clientId,
          form: {
            title: '',
            description: '',
            owner: firstTeamName(),
            dueDate: '',
            status: 'Not started',
            fileName: '',
            fileUrl: '',
          },
        }),

      openAttachFile: (clientId, delId, existing) =>
        openModal({
          type: 'attachFile',
          clientId,
          delId,
          hasExistingFile: !!existing,
          form: { fileName: existing?.name ?? '', fileUrl: existing?.url ?? '' },
        }),

      openAddDocument: (clientId) =>
        openModal({ type: 'document', clientId, form: { name: '', type: 'Contract', fileUrl: '', source: 'us' } }),

      openAddActivity: (clientId) =>
        openModal({ type: 'activity', clientId, form: { note: '', author: firstTeamName() } }),

      openAddTeammate: () =>
        openModal({
          type: 'teammate',
          form: { name: '', role: '', email: '', permission: 'Editor', password: '', access: { ...ALL_ACCESS } },
        }),

      openManagePermissions: (member) =>
        openModal({
          type: 'permissions',
          teammateId: member.id,
          form: { access: { ...ALL_ACCESS, ...(member.access ?? {}) } },
        }),

      openAddFollowUp: () =>
        openModal({
          type: 'followup',
          editing: false,
          form: {
            name: '',
            companyName: '',
            email: '',
            phone: '',
            relatedClientId: '',
            reason: '',
            owner: firstTeamName(),
            dueDate: todayISO(),
          },
        }),

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
        openModal({
          type: 'task',
          clientId,
          form: {
            title: '',
            assignee: firstTeamName(),
            description: '',
            status: 'New',
            priority: 'Medium',
            dueDate: '',
            attachments: [],
            linkInput: '',
          },
        }),

      openEditTask: (clientId, task) =>
        openModal({
          type: 'task',
          clientId,
          editing: true,
          taskId: task.id,
          form: {
            title: task.title,
            assignee: task.assignee || firstTeamName(),
            description: task.description || '',
            status: task.status || 'New',
            priority: task.priority || 'Medium',
            dueDate: task.dueDate || '',
            attachments: task.attachments || [],
            linkInput: '',
          },
        }),

      openTaskPreview: (clientId, task) => openModal({ type: 'taskPreview', clientId, task, form: {} }),

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

      // Files go to the server and come back as a URL to reference.
      handleTaskFileChange: (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        patch({ busy: true, error: null });
        api
          .upload(file)
          .then(({ url }) =>
            patch((s) => ({
              busy: false,
              modal: s.modal
                ? { ...s.modal, form: { ...s.modal.form, attachments: [...(s.modal.form.attachments ?? []), url] } }
                : null,
            })),
          )
          .catch((err) =>
            patch({ busy: false, error: err instanceof Error ? err.message : 'Upload failed.' }),
          );
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

      submitModal: () => {
        const modal = stateRef.current.modal;
        if (!modal) return;
        const f = modal.form;
        const closed = { modal: null };

        switch (modal.type) {
          case 'client': {
            const body: Record<string, unknown> = {
              name: f.name || 'Untitled client',
              industry: f.industry ?? '',
              owner: f.owner ?? '',
              health: f.health ?? 'Active',
              stage: f.stage ?? 'Onboarding',
              currency: f.currency ?? 'INR',
              billingCycle: f.billingCycle ?? 'Monthly',
              baseAmount: Number(f.baseAmount) || 0,
              gstPercent: Number(f.gstPercent) || 0,
              gstMode: f.gstMode === 'included' ? 'included' : 'excluded',
              startDate: f.startDate || todayISO(),
              onboardingDate: f.onboardingDate || '',
              contractEndDate: f.contractEndDate || '',
              paymentTerms: f.paymentTerms ?? 'Net 30',
              website: f.website ?? '',
              notes: f.notes ?? '',
              legalName: f.legalName ?? '',
              gstin: f.gstin ?? '',
              natureOfBusiness: f.natureOfBusiness ?? '',
              cityTier: f.cityTier ?? '',
              mandateType: f.mandateType ?? 'Pilot',
              mandateOther: f.mandateOther ?? '',
              scopeOfWork: f.scopeOfWork ?? '',
            };
            if (modal.editing) {
              void run(() => api.updateClient(modal.clientId!, body), { onSuccess: closed });
            } else {
              if (f.contactName) {
                body.contact = {
                  name: f.contactName,
                  role: f.contactRole ?? '',
                  email: f.contactEmail ?? '',
                  phone: f.contactPhone ?? '',
                };
              }
              if (f.initialCommitment) {
                body.initialCommitment = {
                  title: f.initialCommitment,
                  dueDate: f.initialCommitmentDue || '',
                };
              }
              void run(() => api.createClient(body), { onSuccess: closed });
            }
            return;
          }
          case 'contact': {
            const contact = {
              name: f.name ?? '',
              role: f.role ?? '',
              email: f.email ?? '',
              phone: f.phone ?? '',
            };
            if (modal.clientId) {
              void run(() => api.addContact(modal.clientId!, contact), { onSuccess: closed });
            } else {
              void run(
                () =>
                  api.addContactAnywhere({
                    ...contact,
                    clientId: f.clientId ?? '',
                    newClientName: f.newClientName ?? '',
                  }),
                { onSuccess: closed },
              );
            }
            return;
          }
          case 'invoice':
            void run(
              () =>
                api.addInvoice(modal.clientId!, {
                  number: f.number ?? '',
                  baseAmount: Number(f.baseAmount) || 0,
                  gstPercent: Number(f.gstPercent) || 0,
                  gstMode: f.gstMode === 'included' ? 'included' : 'excluded',
                  issueDate: f.issueDate || todayISO(),
                  dueDate: f.dueDate || todayISO(),
                  ...fileFields(f),
                }),
              { onSuccess: closed },
            );
            return;
          case 'logPayment':
            void run(
              () =>
                api.addPayment(modal.clientId!, modal.invId!, {
                  bankAmount: Number(f.bankAmount) || 0,
                  tds: Number(f.tds) || 0,
                  date: f.date || todayISO(),
                }),
              { onSuccess: closed },
            );
            return;
          case 'attachInvoiceFile':
            void run(() => api.setInvoiceFile(modal.clientId!, modal.invId!, fileFields(f)), {
              onSuccess: closed,
            });
            return;
          case 'deliverable':
            void run(
              () =>
                api.addDeliverable(modal.clientId!, {
                  title: f.title ?? '',
                  description: f.description ?? '',
                  owner: f.owner ?? '',
                  dueDate: f.dueDate || todayISO(),
                  status: f.status ?? 'Not started',
                  ...fileFields(f),
                }),
              { onSuccess: closed },
            );
            return;
          case 'attachFile':
            void run(() => api.updateDeliverable(modal.clientId!, modal.delId!, fileFields(f)), {
              onSuccess: closed,
            });
            return;
          case 'document':
            void run(
              () =>
                api.addDocument(modal.clientId!, {
                  name: f.name ?? '',
                  type: f.type ?? 'Other',
                  url: f.fileUrl ?? '',
                  source: f.source === 'client' ? 'client' : 'us',
                }),
              { onSuccess: closed },
            );
            return;
          case 'activity':
            void run(
              () => api.addActivity(modal.clientId!, { note: f.note ?? '', author: f.author ?? '' }),
              { onSuccess: closed },
            );
            return;
          case 'task': {
            const body = {
              title: f.title ?? '',
              description: f.description ?? '',
              assignee: f.assignee ?? '',
              status: f.status ?? 'New',
              priority: f.priority ?? 'Medium',
              dueDate: f.dueDate || '',
              attachments: f.attachments ?? [],
            };
            void run(
              () =>
                modal.editing
                  ? api.updateTask(modal.clientId!, modal.taskId!, body)
                  : api.addTask(modal.clientId!, body),
              { onSuccess: closed },
            );
            return;
          }
          case 'teammate':
            void run(
              () =>
                api.addTeammate({
                  name: f.name ?? '',
                  email: f.email ?? '',
                  role: f.role ?? '',
                  permission: f.permission ?? 'Editor',
                  password: f.password ?? '',
                  access: f.access ?? { ...ALL_ACCESS },
                }),
              { onSuccess: closed },
            );
            return;
          case 'permissions':
            void run(
              () => api.setTeammateAccess(modal.teammateId!, (f.access ?? { ...ALL_ACCESS }) as Access),
              { onSuccess: closed },
            );
            return;
          case 'followup': {
            const body = {
              name: f.name ?? '',
              companyName: f.companyName ?? '',
              email: f.email ?? '',
              phone: f.phone ?? '',
              relatedClientId: f.relatedClientId ?? '',
              reason: f.reason ?? '',
              owner: f.owner ?? '',
              dueDate: f.dueDate || todayISO(),
            };
            void run(
              () => (modal.editing ? api.updateFollowUp(modal.followUpId!, body) : api.addFollowUp(body)),
              { onSuccess: closed },
            );
            return;
          }
          case 'completeFollowUp':
            void run(
              () =>
                api.completeFollowUp(modal.followUpId!, {
                  note: f.note ?? '',
                  action: f.action === 'done' ? 'done' : 'snooze',
                  nextDate: f.nextDate ?? '',
                }),
              { onSuccess: closed },
            );
            return;
          case 'changePassword': {
            if ((f.newPassword ?? '') !== (f.confirmPassword ?? '')) {
              patch({ error: 'The new passwords do not match.' });
              return;
            }
            // Allowed for read-only accounts: it changes your login, not data.
            void run(() => api.changePassword(f.currentPassword ?? '', f.newPassword ?? ''), {
              onSuccess: closed,
              requiresWrite: false,
            });
            return;
          }
          case 'taskPreview':
            patch(closed);
            return;
        }
      },

      removeItem: (listName, clientId, itemId) => {
        const remove =
          listName === 'contacts'
            ? () => api.removeContact(clientId, itemId)
            : listName === 'invoices'
              ? () => api.removeInvoice(clientId, itemId)
              : listName === 'deliverables'
                ? () => api.removeDeliverable(clientId, itemId)
                : () => api.removeDocument(clientId, itemId);
        void run(remove, { onSuccess: { invoiceMenuOpenId: null } });
      },

      removeTeammate: (id) => {
        void run(() => api.removeTeammate(id));
      },
      removeFollowUp: (id) => {
        void run(() => api.removeFollowUp(id), { onSuccess: { followUpMenuOpenId: null } });
      },
      reopenFollowUp: (id) => {
        void run(() => api.reopenFollowUp(id));
      },
      markInvoicePaid: (clientId, invId) => {
        void run(() => api.settleInvoice(clientId, invId), { onSuccess: { invoiceMenuOpenId: null } });
      },
      removePayment: (clientId, invId, paymentId) => {
        void run(() => api.removePayment(clientId, invId, paymentId));
      },
      removeInvoiceFile: (clientId, invId) => {
        void run(() => api.clearInvoiceFile(clientId, invId), { onSuccess: { modal: null } });
      },
      removeDeliverableFile: (clientId, delId) => {
        void run(() => api.updateDeliverable(clientId, delId, { fileName: '', fileUrl: '' }), {
          onSuccess: { modal: null },
        });
      },
      cycleDeliverable: (clientId, delId) => {
        const current = clientById(clientId)?.deliverables.find((d) => d.id === delId);
        if (!current) return;
        void run(() =>
          api.updateDeliverable(clientId, delId, { status: DELIVERABLE_CYCLE[current.status] }),
        );
      },
      setTaskStatus: (clientId, taskId, status) => {
        void run(() => api.updateTask(clientId, taskId, { status }));
      },
      removeTask: (clientId, taskId) => {
        void run(() => api.removeTask(clientId, taskId));
      },
    };
  }, [applySnapshot, patch, run]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useApp must be used inside <AppStateProvider>');
  return ctx;
}
