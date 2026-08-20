import type { Access, Client, FollowUp, Permission, Teammate } from '../data/types';

/**
 * The whole workspace as the server is willing to show the signed-in user.
 * Every mutation returns a fresh one, so the client never has to guess how a
 * change affected permissions or derived values.
 */
export interface Snapshot {
  me: Me;
  clients: Client[];
  team: Teammate[];
  followUps: FollowUp[];
  /** Workspace-wide settings; see `setWorkspaceTimezone`. */
  workspace?: { timezone: string };
}

export interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  permission: Permission;
  access: Access;
  canWrite: boolean;
  canManageTeam: boolean;
  /** False for accounts that only sign in with Google. */
  hasPassword: boolean;
  /** True until the holder replaces a password an Owner chose for them. */
  mustChangePassword: boolean;
  previewAs: { id: string; name: string; role: string; summary: string } | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the session is missing or expired. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      // Session lives in an httpOnly cookie, so it must ride along.
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is the API running?');
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Request failed (${response.status}).`;
    throw new ApiError(response.status, message, payload?.details);
  }
  return payload as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
const del = <T>(path: string) => request<T>('DELETE', path);

/** Amounts sent to the API are whole currency units; responses are minor units. */
export const api = {
  /** Public — tells the sign-in screen whether to offer first-run setup. */
  status: () =>
    get<{ needsSetup: boolean; googleEnabled: boolean; setupTokenRequired: boolean }>(
      '/auth/status',
    ),
  session: () => get<Snapshot>('/auth/session'),
  login: (email: string, password: string) => post<Snapshot>('/auth/login', { email, password }),
  /** Creates the workspace's first Owner. Only available while it has no users. */
  setup: (body: {
    name: string;
    email: string;
    role: string;
    password: string;
    setupToken: string;
  }) => post<Snapshot>('/auth/setup', body),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<Snapshot>('/auth/password', { currentPassword, newPassword }),
  /** Checks a reset link before asking for a password. */
  checkReset: (token: string) =>
    get<{ valid: boolean }>(`/auth/reset?token=${encodeURIComponent(token)}`),
  redeemReset: (token: string, newPassword: string) =>
    post<Snapshot>('/auth/reset', { token, newPassword }),
  /** Owner-only: issues a one-time reset link to hand to a teammate. */
  createResetLink: (userId: string) =>
    post<{ resetUrl: string; expiresAt: string }>(`/team/${userId}/reset-password`),
  logout: () => post<void>('/auth/logout'),
  startPreview: (teammateId: string) => post<Snapshot>('/auth/preview', { teammateId }),
  exitPreview: () => del<Snapshot>('/auth/preview'),

  createClient: (body: unknown) => post<Snapshot>('/clients', body),
  updateClient: (clientId: string, body: unknown) => patch<Snapshot>(`/clients/${clientId}`, body),

  addContact: (clientId: string, body: unknown) => post<Snapshot>(`/clients/${clientId}/contacts`, body),
  addContactAnywhere: (body: unknown) => post<Snapshot>('/contacts', body),
  removeContact: (clientId: string, contactId: string) =>
    del<Snapshot>(`/clients/${clientId}/contacts/${contactId}`),

  addInvoice: (clientId: string, body: unknown) => post<Snapshot>(`/clients/${clientId}/invoices`, body),
  removeInvoice: (clientId: string, invoiceId: string) =>
    del<Snapshot>(`/clients/${clientId}/invoices/${invoiceId}`),
  setInvoiceFile: (clientId: string, invoiceId: string, body: unknown) =>
    put<Snapshot>(`/clients/${clientId}/invoices/${invoiceId}/file`, body),
  clearInvoiceFile: (clientId: string, invoiceId: string) =>
    del<Snapshot>(`/clients/${clientId}/invoices/${invoiceId}/file`),
  addPayment: (clientId: string, invoiceId: string, body: unknown) =>
    post<Snapshot>(`/clients/${clientId}/invoices/${invoiceId}/payments`, body),
  settleInvoice: (clientId: string, invoiceId: string) =>
    post<Snapshot>(`/clients/${clientId}/invoices/${invoiceId}/settle`),
  removePayment: (clientId: string, invoiceId: string, paymentId: string) =>
    del<Snapshot>(`/clients/${clientId}/invoices/${invoiceId}/payments/${paymentId}`),

  addDeliverable: (clientId: string, body: unknown) =>
    post<Snapshot>(`/clients/${clientId}/deliverables`, body),
  updateDeliverable: (clientId: string, deliverableId: string, body: unknown) =>
    patch<Snapshot>(`/clients/${clientId}/deliverables/${deliverableId}`, body),
  removeDeliverable: (clientId: string, deliverableId: string) =>
    del<Snapshot>(`/clients/${clientId}/deliverables/${deliverableId}`),

  addDocument: (clientId: string, body: unknown) => post<Snapshot>(`/clients/${clientId}/documents`, body),
  removeDocument: (clientId: string, documentId: string) =>
    del<Snapshot>(`/clients/${clientId}/documents/${documentId}`),

  addActivity: (clientId: string, body: unknown) => post<Snapshot>(`/clients/${clientId}/activity`, body),

  addTask: (clientId: string, body: unknown) => post<Snapshot>(`/clients/${clientId}/tasks`, body),
  updateTask: (clientId: string, taskId: string, body: unknown) =>
    patch<Snapshot>(`/clients/${clientId}/tasks/${taskId}`, body),
  removeTask: (clientId: string, taskId: string) => del<Snapshot>(`/clients/${clientId}/tasks/${taskId}`),

  addTeammate: (body: unknown) => post<Snapshot>('/team', body),
  setTeammateAccess: (userId: string, access: Access) => put<Snapshot>(`/team/${userId}/access`, { access }),
  removeTeammate: (userId: string) => del<Snapshot>(`/team/${userId}`),

  addFollowUp: (body: unknown) => post<Snapshot>('/followups', body),
  updateFollowUp: (id: string, body: unknown) => patch<Snapshot>(`/followups/${id}`, body),
  completeFollowUp: (id: string, body: unknown) => post<Snapshot>(`/followups/${id}/complete`, body),
  reopenFollowUp: (id: string) => post<Snapshot>(`/followups/${id}/reopen`),
  removeFollowUp: (id: string) => del<Snapshot>(`/followups/${id}`),

  /**
   * Uploads a file against a specific client and returns the URL to reference it
   * by. Both the client and the owning section are required: the server
   * authorizes the upload against that section now, and every later download
   * against the same one.
   */
  async upload(
    clientId: string,
    file: File,
    section: 'clients' | 'invoices' | 'deliverables' | 'documents' = 'clients',
  ): Promise<{ url: string; name: string }> {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`/api/clients/${clientId}/uploads/${section}`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(response.status, payload?.error ?? 'Upload failed.', payload?.details);
    }
    return payload as { url: string; name: string };
  },
};
