import { ALL_ACCESS } from '../data/options';
import type { Access, ClientTabId } from '../data/types';
import { useApp } from './AppState';

export interface AccessInfo {
  /** Effective access, as decided by the server for this session. */
  access: Access;
  /** Money is withheld wholesale from anyone without invoice access. */
  showInvoiceStats: boolean;
  /** False for read-only (Viewer) accounts — write affordances are hidden. */
  canWrite: boolean;
  /** Only Owners may manage the team or preview as someone else. */
  canManageTeam: boolean;
  banner: { name: string; role: string; summary: string } | null;
  visibleClientTabs: ClientTabId[];
}

const ALL_CLIENT_TABS: ClientTabId[] = [
  'overview',
  'contacts',
  'invoices',
  'deliverables',
  'documents',
  'tasks',
  'activity',
];

export function useAccess(): AccessInfo {
  const { state } = useApp();
  const me = state.me;
  const access: Access = me ? me.access : { ...ALL_ACCESS };

  return {
    access,
    showInvoiceStats: !!access.invoices,
    canWrite: me ? me.canWrite : false,
    canManageTeam: me ? me.canManageTeam : false,
    banner: me?.previewAs
      ? { name: me.previewAs.name, role: me.previewAs.role, summary: me.previewAs.summary }
      : null,
    // A tab is only offered when the server would actually send its data.
    visibleClientTabs: ALL_CLIENT_TABS.filter((id) => {
      if (id === 'invoices') return !!access.invoices;
      if (id === 'documents') return !!access.documents;
      if (id === 'deliverables') return !!access.deliverables;
      // Contacts, tasks and activity live inside the client record.
      if (id === 'contacts' || id === 'tasks' || id === 'activity') return !!access.clients;
      return true;
    }),
  };
}
