import { ACCESS_SECTIONS, ALL_ACCESS } from '../data/options';
import type { Access, ClientTabId, Teammate } from '../data/types';
import { useApp } from './AppState';

export interface AccessInfo {
  /** Null when not previewing — i.e. the current user sees everything. */
  previewMember: Teammate | null;
  access: Access;
  /** Money is hidden wholesale from anyone without invoice access. */
  showInvoiceStats: boolean;
  banner: { name: string; role: string; summary: string } | null;
  /** Client-detail tabs the previewed teammate is allowed to open. */
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
  const previewMember = state.previewAsId
    ? (state.team.find((t) => t.id === state.previewAsId) ?? null)
    : null;
  const access: Access = previewMember
    ? { ...ALL_ACCESS, ...(previewMember.access ?? {}) }
    : { ...ALL_ACCESS };

  let banner: AccessInfo['banner'] = null;
  if (previewMember) {
    const granted = ACCESS_SECTIONS.filter((sec) => access[sec.key]).map((sec) => sec.label);
    const summary =
      granted.length === ACCESS_SECTIONS.length
        ? 'everything'
        : granted.length
          ? granted.join(', ')
          : 'nothing yet';
    banner = { name: previewMember.name, role: previewMember.role, summary };
  }

  const visibleClientTabs = ALL_CLIENT_TABS.filter(
    (id) =>
      (id !== 'invoices' || access.invoices) && (id !== 'documents' || access.documents),
  );

  return {
    previewMember,
    access,
    showInvoiceStats: access.invoices,
    banner,
    visibleClientTabs,
  };
}
