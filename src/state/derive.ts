import type { Client, FollowUp } from '../data/types';
import { fmtDate, parseISO, TODAY } from '../lib/dates';
import type { ChipColor } from '../ds/Chip';
import { useApp } from './AppState';

export interface FollowUpRow {
  id: string;
  source: FollowUp;
  name: string;
  email: string;
  phone: string;
  /** Company name if given, else the linked client, else a prospect label. */
  clientName: string;
  client: Client | null;
  reason: string;
  owner: string;
  dueDateFormatted: string;
  overdue: boolean;
  dueColor: string;
  status: FollowUp['status'];
  statusLabel: string;
  statusColor: ChipColor;
  sortKey: string;
  logCount: number;
  lastLogNote: string;
  logRows: { id: string; date: string; note: string; dateFormatted: string }[];
}

function toRow(f: FollowUp, clients: Client[]): FollowUpRow {
  const client = clients.find((c) => c.id === f.relatedClientId) ?? null;
  const overdue = f.status !== 'Done' && parseISO(f.dueDate) < TODAY;
  const log = f.log ?? [];
  return {
    id: f.id,
    source: f,
    name: f.name,
    email: f.email || '',
    phone: f.phone || '',
    clientName: f.companyName || (client ? client.name : 'New contact / prospect'),
    client,
    reason: f.reason,
    owner: f.owner,
    dueDateFormatted: fmtDate(f.dueDate),
    overdue,
    dueColor: overdue ? 'var(--danger)' : 'var(--ink-2)',
    status: f.status,
    statusLabel: overdue ? 'Overdue' : f.status,
    statusColor: f.status === 'Done' ? 'green' : overdue ? 'red' : 'amber',
    // Done items sort after pending ones, then by due date.
    sortKey: (f.status === 'Done' ? 1 : 0) + f.dueDate,
    logCount: log.length,
    lastLogNote: log.length ? log[log.length - 1].note : '',
    logRows: log
      .slice()
      .reverse()
      .map((l) => ({ ...l, dateFormatted: fmtDate(l.date) })),
  };
}

export function useFollowUpRows(): { rows: FollowUpRow[]; pending: FollowUpRow[] } {
  const { state } = useApp();
  const all = state.followUps.map((f) => toRow(f, state.clients));
  const pending = all.filter((r) => r.status !== 'Done').sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  let rows = all;
  if (state.followUpStatusFilter === 'pending') rows = rows.filter((r) => r.status !== 'Done');
  else if (state.followUpStatusFilter === 'done') rows = rows.filter((r) => r.status === 'Done');
  rows = rows.slice().sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return { rows, pending };
}

export interface PhonebookRow {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  clientId: string;
  clientName: string;
}

export function usePhonebookRows(): PhonebookRow[] {
  const { state } = useApp();
  const q = (state.phonebookSearch || '').toLowerCase();
  const all: PhonebookRow[] = [];
  state.clients.forEach((c) =>
    (c.contacts ?? []).forEach((ct) =>
      all.push({
        id: ct.id,
        name: ct.name,
        role: ct.role,
        email: ct.email,
        phone: ct.phone,
        clientId: c.id,
        clientName: c.name,
      }),
    ),
  );
  return all
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q),
    )
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}
