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
import { ALL_ACCESS, DELIVERABLE_CYCLE, NAV_ORDER } from '../data/options';
import type {
  ArchivedRecord,
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
import {
  addDays,
  parseISO,
  setWorkspaceTimezone,
  toISO,
  todayISO,
  type InvoicePeriod,
} from '../lib/dates';
import { minorToInput } from '../lib/money';
import type { FormKey, ModalForm, ModalState } from './modal';

export type SortBy = 'name' | 'value' | 'health';
export type DeliverableSortBy = 'due' | 'status' | 'client' | 'owner';
export type InvoiceStatusFilter = 'all' | 'Paid' | 'Partially Paid' | 'Pending' | 'Overdue';
export type FollowUpStatusFilter = 'pending' | 'done' | 'all';
export type FollowUpSubTab = 'queue' | 'phonebook';

export type LoadStatus = 'loading' | 'setup' | 'reset' | 'signed-out' | 'ready';

export interface AppStateShape {
  /** Server-owned data. Empty until the first snapshot arrives. */
  me: Me | null;
  clients: Client[];
  team: Teammate[];
  followUps: FollowUp[];

  status: LoadStatus;
  /** Whether the server has Google sign-in configured. */
  googleEnabled: boolean;
  /** Whether first-run setup requires the deployment's SETUP_TOKEN. */
  setupTokenRequired: boolean;
  /** Minimum password length this deployment enforces; shown on the forms. */
  minPasswordLength: number;
  /** Reset token from the URL, when the app was opened through a reset link. */
  resetToken: string | null;
  /** A mutation is in flight. */
  busy: boolean;
  /** Last error, surfaced as a dismissible banner. */
  error: string | null;

  view: View;
  selectedId: string | null;
  clientTabId: ClientTabId;
  search: string;
  healthFilter: Health | 'all';
  /**
   * Whether the Clients screen is showing live accounts or archived ones.
   *
   * Archived records are not in the snapshot at all — the server does not send
   * them — so this decides whether the screen renders `clients` or `archived`.
   */
  clientsTab: 'active' | 'archived';
  /** What has been archived, fetched on demand rather than with every snapshot. */
  archived: ArchivedRecord[];
  archivedLoading: boolean;
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

/**
 * Pulls the one-shot values the app can be opened with out of the URL.
 *
 * Read here rather than in an effect, and without touching the URL: React
 * double-invokes effects in development (and may legitimately re-run them), so
 * an effect that consumed the query string would find it empty the second time
 * and lose the token.
 */
function readLaunchParams(): { resetToken: string | null; authError: string | null } {
  if (typeof window === 'undefined') return { resetToken: null, authError: null };
  const params = new URLSearchParams(window.location.search);
  return { resetToken: params.get('reset'), authError: params.get('authError') };
}

/** UUID where available; randomUUID needs a secure context, LAN http is not. */
function newIntentKey(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const initialState = (): AppStateShape => ({
  me: null,
  clients: [],
  team: [],
  followUps: [],
  // A reset link is known before anything is fetched, so the screen shows at once.
  status: readLaunchParams().resetToken ? 'reset' : 'loading',
  googleEnabled: false,
  setupTokenRequired: false,
  minPasswordLength: 12,
  resetToken: readLaunchParams().resetToken,
  busy: false,
  error: null,
  view: 'overview',
  selectedId: null,
  clientTabId: 'overview',
  search: '',
  healthFilter: 'all',
  clientsTab: 'active',
  archived: [],
  archivedLoading: false,
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
  setup: (input: {
    name: string;
    email: string;
    role: string;
    password: string;
    setupToken: string;
  }) => Promise<void>;
  openChangePassword: () => void;
  /** Sets your own password from the forced-change screen. */
  setOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  redeemReset: (token: string, newPassword: string) => Promise<void>;
  dismissReset: () => void;
  /** Owner-only: mints a one-time reset link for a teammate. */
  createResetLink: (teammate: Teammate) => void;
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
  setClientsTab: (tab: 'active' | 'archived') => void;
  /** Loads the archive for a client, or for the workspace when given nothing. */
  loadArchived: (clientId?: string) => void;
  restoreArchived: (type: string, id: string) => void;
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
  markInvoicePaid: (clientId: string, invId: string, balanceMinor: number) => void;
  removePayment: (clientId: string, invId: string, paymentId: string) => void;
  removeInvoiceFile: (clientId: string, invId: string) => void;
  removeDeliverableFile: (clientId: string, delId: string) => void;
  cycleDeliverable: (clientId: string, delId: string) => void;
  setTaskStatus: (clientId: string, taskId: string, status: TaskStatus) => void;
  removeTask: (clientId: string, taskId: string) => void;
}

const AppStateContext = createContext<{ state: AppStateShape; actions: AppActions } | null>(null);

/**
 * Corrects a view the signed-in user may not open, to the first one they may.
 *
 * The sidebar already hides denied sections, but the *default* view was always
 * Overview — so a teammate granted only Invoices opened on a dashboard they had
 * no access to, and saw a screen full of zeros drawn from a payload that
 * (correctly) withheld the data. Falling back to their first real section makes
 * the permission set the single source of truth for navigation too.
 */
function permittedView(view: View, access: Access | undefined): View {
  // The client detail screen is not a nav entry; it follows Clients access.
  const needed: SectionKey = view === 'client' ? 'clients' : view;
  if (access?.[needed]) return view;
  return NAV_ORDER.find((key) => access?.[key]) ?? 'overview';
}

function fileFields(f: ModalForm) {
  return { fileName: f.fileName ?? '', fileUrl: f.fileUrl ?? '' };
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppStateShape>(initialState);
  // Captured once, before anything can clear the address bar.
  const [launchAuthError] = useState(() => readLaunchParams().authError);
  // Actions read the latest state without being re-created on every change.
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Identifies what the user is trying to do, for as long as the modal is open.
   *
   * Sent as Idempotency-Key so that submitting the same form twice — a second
   * click while the first request is still in flight, or a retry after the
   * connection dropped — creates one record rather than two. Reset when the
   * modal closes, so genuinely logging the same amount twice still works.
   */
  const intentKeyRef = useRef<string | null>(null);
  const intentKey = () => (intentKeyRef.current ??= newIntentKey());

  /**
   * Orders the snapshots coming back from the server.
   *
   * Every mutation answers with the whole workspace, and responses do not have
   * to arrive in the order they were sent: a refresh issued a moment ago can be
   * overtaken by a write and land afterwards, carrying state assembled before
   * that write existed. Applying it would silently undo what the person just
   * did on screen — the row reappears, the note vanishes — while the server has
   * it right, which is the worst kind of wrong: nothing to retry, and no sign
   * anything happened.
   *
   * Each request takes a ticket before it leaves; a reply holding an older
   * ticket than one already applied is dropped.
   */
  const requestSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const nextRequestSeq = () => ++requestSeqRef.current;

  const patch = useCallback(
    (updater: Partial<AppStateShape> | ((s: AppStateShape) => Partial<AppStateShape>)) => {
      setState((s) => ({ ...s, ...(typeof updater === 'function' ? updater(s) : updater) }));
    },
    [],
  );

  useEffect(() => {
    if (!state.modal) intentKeyRef.current = null;
  }, [state.modal]);

  const applySnapshot = useCallback(
    (snapshot: Snapshot, extra?: Partial<AppStateShape>, seq?: number) => {
      // Out of order: something newer is already on screen. Dropping this is the
      // whole point — see nextRequestSeq above.
      if (seq !== undefined) {
        if (seq < appliedSeqRef.current) return;
        appliedSeqRef.current = seq;
      }
      // Adopt the workspace's calendar before anything derived from a date is
      // recomputed, so "today" is the same day the server would name.
      setWorkspaceTimezone(snapshot.workspace?.timezone);
      patch((s) => {
        const next = { ...s, ...extra };
        return {
          me: snapshot.me,
          clients: snapshot.clients,
          team: snapshot.team,
          followUps: snapshot.followUps,
          status: 'ready' as const,
          busy: false,
          error: null,
          ...extra,
          // Land somewhere the user can actually open. Every path arrives here —
          // sign-in, session resume, and starting or leaving a preview — so a
          // teammate with, say, Invoices only never opens on a dashboard they were
          // denied, and an Owner previewing them is shown the same thing.
          view: permittedView(next.view, snapshot.me.access),
        };
      });
    },
    [patch],
  );

  /**
   * Runs a mutation: marks the app busy, applies the returned snapshot, and
   * turns failures into a visible message instead of a silent no-op.
   */
  /**
   * Loads the archive. Separate from `run` because it is a read: it must not
   * take the one-mutation-at-a-time lock, and it returns no snapshot.
   */
  const fetchArchived = useCallback(
    async (clientId?: string) => {
      patch({ archivedLoading: true });
      try {
        const result = await api.listArchived(clientId ? { clientId } : {});
        patch({ archived: result.archived, archivedLoading: false });
      } catch (err) {
        patch({
          archivedLoading: false,
          error: err instanceof Error ? err.message : 'Could not load the archive.',
        });
      }
    },
    [patch],
  );

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
      // One mutation at a time. A second click while the first is still in
      // flight is the same intent, not a new one — and on a slow connection
      // that is exactly what an impatient person does. The server's
      // idempotency key is the real defence; this stops the request leaving.
      if (stateRef.current.busy) return;
      patch({ busy: true, error: null });
      const seq = nextRequestSeq();
      try {
        applySnapshot(await fn(), opts.onSuccess, seq);
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
        // A version conflict means this screen is showing something stale. Pull
        // the current state in so the message and the data agree — carrying the
        // message through, because applySnapshot clears the error banner and
        // refreshing silently would leave the person with a form that just
        // refused to save and no explanation.
        if (err instanceof ApiError && err.status === 409) {
          const conflict = err.message;
          const refreshSeq = nextRequestSeq();
          api
            .session()
            .then((snapshot) => applySnapshot(snapshot, { busy: false, error: conflict }, refreshSeq))
            .catch(() => {
              /* the banner already says what happened */
            });
        }
      }
    },
    [applySnapshot, patch],
  );

  // Resume an existing session on load. A workspace with no accounts at all
  // lands on first-run setup rather than an unusable sign-in form.
  useEffect(() => {
    let cancelled = false;

    // A reset link takes precedence over any existing session: whoever is holding
    // it is here to set a password, not to resume someone else's tab. The token
    // was captured during state init; all that is left is to get it out of the
    // address bar so it is not shared or bookmarked.
    if (stateRef.current.resetToken) {
      if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
      return () => {
        cancelled = true;
      };
    }

    const resumeSeq = nextRequestSeq();
    api
      .session()
      .then((snapshot) => {
        if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
        if (!cancelled) applySnapshot(snapshot, undefined, resumeSeq);
      })
      .catch(async (err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.isUnauthorized) {
          const { needsSetup, googleEnabled, setupTokenRequired, minPasswordLength } = await api
            .status()
            .catch(() => ({
              needsSetup: false,
              googleEnabled: false,
              setupTokenRequired: false,
              minPasswordLength: stateRef.current.minPasswordLength,
            }));
          // A failed Google round trip comes back as ?authError=… on the URL. Read
          // from the captured value, not the live URL, for the same reason as the
          // reset token above.
          const authError = launchAuthError;
          if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
          if (!cancelled) {
            patch({
              status: needsSetup ? 'setup' : 'signed-out',
              googleEnabled,
              setupTokenRequired,
              minPasswordLength,
              error: authError,
            });
          }
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
    /**
     * Who a new record is assigned to by default: the signed-in account. The id,
     * not the name — the name is only ever a label now.
     */
    const defaultAssigneeId = () => {
      const s = stateRef.current;
      return s.me?.id ?? (s.team[0] ? s.team[0].id : '');
    };
    const clientById = (id: string | undefined) =>
      stateRef.current.clients.find((c) => c.id === id);
    const openModal = (modal: ModalState, extra?: Partial<AppStateShape>) => patch({ modal, ...extra });

    /** The payment form, pre-filled. Settling is this with the whole balance. */
    const openPaymentForm = (clientId: string, invId: string, balanceMinor: number) =>
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
      );

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
      setOwnPassword: async (currentPassword, newPassword) => {
        patch({ busy: true, error: null });
        try {
          applySnapshot(await api.changePassword(currentPassword, newPassword));
        } catch (err) {
          patch({ busy: false, error: err instanceof Error ? err.message : 'Could not set the password.' });
          throw err;
        }
      },
      redeemReset: async (token, newPassword) => {
        patch({ busy: true, error: null });
        try {
          applySnapshot(await api.redeemReset(token, newPassword), {
            resetToken: null,
            view: 'overview',
            selectedId: null,
          });
        } catch (err) {
          patch({ busy: false, error: err instanceof Error ? err.message : 'Could not set the password.' });
          throw err;
        }
      },
      dismissReset: () => patch({ status: 'signed-out', resetToken: null, error: null }),

      createResetLink: (teammate) => {
        patch({ busy: true, error: null });
        api
          .createResetLink(teammate.id)
          .then(({ resetUrl, expiresAt }) =>
            patch({
              busy: false,
              modal: {
                type: 'resetLink',
                teammateId: teammate.id,
                form: { resetUrl, resetExpires: expiresAt, teammateName: teammate.name },
              },
            }),
          )
          .catch((err) =>
            patch({
              busy: false,
              error: err instanceof Error ? err.message : 'Could not create a reset link.',
            }),
          );
      },

      logout: () => {
        const { googleEnabled, setupTokenRequired } = stateRef.current;
        void api.logout().finally(() => {
          setState({ ...initialState(), status: 'signed-out', googleEnabled, setupTokenRequired });
        });
      },
      reload: () => {
        void run(() => api.session(), { requiresWrite: false });
      },
      dismissError: () => patch({ error: null }),

      goTo: (view) => patch({ view, selectedId: null }),
      goClients: () => patch({ view: 'clients' }),
      // The detail screen needs Clients access. Cross-client screens link to it,
      // and a teammate granted only Invoices would otherwise land on a client
      // record the server had (correctly) refused to send. Guarded here, at the
      // one place every one of those links goes through, rather than trusting
      // each view to remember.
      openClient: (id) => {
        if (!stateRef.current.me?.access.clients) return;
        patch({ view: 'client', selectedId: id, clientTabId: 'overview' });
      },
      openClientTab: (id, tabId) => {
        if (!stateRef.current.me?.access.clients) return;
        patch({ view: 'client', selectedId: id, clientTabId: tabId });
      },
      setClientTab: (id) => patch({ clientTabId: id }),

      setSearch: (search) => patch({ search }),
      setHealthFilter: (healthFilter) => patch({ healthFilter }),
      setClientsTab: (clientsTab) => {
        patch({ clientsTab });
        // Fetched when the tab is opened rather than with every snapshot: the
        // archive is usually empty and always uninteresting until asked for.
        if (clientsTab === 'archived') void fetchArchived();
      },
      loadArchived: (clientId) => void fetchArchived(clientId),
      restoreArchived: (type, id) => {
        void run(() => api.restoreArchived(type, id)).then(() =>
          // The row is back in the snapshot now, so the list it came from is one
          // item out of date.
          fetchArchived(
            stateRef.current.view === 'client' ? (stateRef.current.selectedId ?? undefined) : undefined,
          ),
        );
      },
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
              ownerUserId: defaultAssigneeId(),
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
          version: client.version,
          form: {
            name: client.name,
            industry: client.industry,
            ownerUserId: client.ownerUserId ?? '',
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
        openPaymentForm(clientId, invId, balanceMinor),

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
            ownerUserId: defaultAssigneeId(),
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

      openAddActivity: (clientId) => openModal({ type: 'activity', clientId, form: { note: '' } }),

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
            ownerUserId: defaultAssigneeId(),
            dueDate: todayISO(),
          },
        }),

      openEditFollowUp: (f) =>
        openModal(
          {
            type: 'followup',
            editing: true,
            followUpId: f.id,
            version: f.version,
            form: {
              name: f.name,
              companyName: f.companyName || '',
              email: f.email || '',
              phone: f.phone || '',
              relatedClientId: f.relatedClientId || '',
              reason: f.reason,
              ownerUserId: f.ownerUserId ?? '',
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
            assigneeUserId: defaultAssigneeId(),
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
          version: task.version,
          form: {
            title: task.title,
            assigneeUserId: task.assigneeUserId ?? defaultAssigneeId(),
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
        const clientId = stateRef.current.modal?.clientId;
        if (!clientId) return;
        patch({ busy: true, error: null });
        api
          // A task attachment lives inside the client record, so it is owned by
          // the Clients section — which is also who may download it later.
          .upload(clientId, file, 'clients')
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
              ownerUserId: f.ownerUserId ?? '',
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
              void run(() => api.updateClient(modal.clientId!, { ...body, version: modal.version }), {
                onSuccess: closed,
              });
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
              void run(() => api.createClient(body, intentKey()), { onSuccess: closed });
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
              void run(() => api.addContact(modal.clientId!, contact, intentKey()), { onSuccess: closed });
            } else {
              void run(
                () =>
                  api.addContactAnywhere(
                    {
                      ...contact,
                      clientId: f.clientId ?? '',
                      newClientName: f.newClientName ?? '',
                    },
                    intentKey(),
                  ),
                { onSuccess: closed },
              );
            }
            return;
          }
          case 'invoice':
            void run(
              () =>
                api.addInvoice(
                  modal.clientId!,
                  {
                    number: f.number ?? '',
                    baseAmount: Number(f.baseAmount) || 0,
                    gstPercent: Number(f.gstPercent) || 0,
                    gstMode: f.gstMode === 'included' ? 'included' : 'excluded',
                    issueDate: f.issueDate || todayISO(),
                    dueDate: f.dueDate || todayISO(),
                    ...fileFields(f),
                  },
                  intentKey(),
                ),
              { onSuccess: closed },
            );
            return;
          case 'logPayment':
            void run(
              () =>
                api.addPayment(
                  modal.clientId!,
                  modal.invId!,
                  {
                    bankAmount: Number(f.bankAmount) || 0,
                    tds: Number(f.tds) || 0,
                    date: f.date || todayISO(),
                  },
                  intentKey(),
                ),
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
                api.addDeliverable(
                  modal.clientId!,
                  {
                    title: f.title ?? '',
                    description: f.description ?? '',
                    ownerUserId: f.ownerUserId ?? '',
                    dueDate: f.dueDate || todayISO(),
                    status: f.status ?? 'Not started',
                    ...fileFields(f),
                  },
                  intentKey(),
                ),
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
                api.addDocument(
                  modal.clientId!,
                  {
                    name: f.name ?? '',
                    type: f.type ?? 'Other',
                    url: f.fileUrl ?? '',
                    source: f.source === 'client' ? 'client' : 'us',
                  },
                  intentKey(),
                ),
              { onSuccess: closed },
            );
            return;
          case 'activity':
            void run(() => api.addActivity(modal.clientId!, { note: f.note ?? '' }, intentKey()), {
              onSuccess: closed,
            });
            return;
          case 'task': {
            const body = {
              title: f.title ?? '',
              description: f.description ?? '',
              assigneeUserId: f.assigneeUserId ?? '',
              status: f.status ?? 'New',
              priority: f.priority ?? 'Medium',
              dueDate: f.dueDate || '',
              attachments: f.attachments ?? [],
            };
            void run(
              () =>
                modal.editing
                  ? api.updateTask(modal.clientId!, modal.taskId!, { ...body, version: modal.version })
                  : api.addTask(modal.clientId!, body, intentKey()),
              { onSuccess: closed },
            );
            return;
          }
          case 'teammate':
            void run(
              () =>
                api.addTeammate(
                  {
                    name: f.name ?? '',
                    email: f.email ?? '',
                    role: f.role ?? '',
                    permission: f.permission ?? 'Editor',
                    password: f.password ?? '',
                    access: f.access ?? { ...ALL_ACCESS },
                  },
                  intentKey(),
                ),
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
              ownerUserId: f.ownerUserId ?? '',
              dueDate: f.dueDate || todayISO(),
            };
            void run(
              () =>
                modal.editing
                  ? api.updateFollowUp(modal.followUpId!, { ...body, version: modal.version })
                  : api.addFollowUp(body, intentKey()),
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
      // Settling is just a payment for the whole balance, so it goes through the
      // same form. The amount and date are pre-filled; the date stays editable,
      // because "today" is a default rather than a fact.
      markInvoicePaid: (clientId, invId, balanceMinor) =>
        openPaymentForm(clientId, invId, balanceMinor),
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
