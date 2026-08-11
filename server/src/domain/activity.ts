import { newId, type Db } from '../db/index';

/** The server owns the clock — clients never supply "today". */
export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Appends a read-only `system` entry to a client's activity feed. Every mutation
 * that changes something a human would want to see logs one.
 */
export function logSystemActivity(db: Db, clientId: string, note: string, author: string): void {
  db.prepare(
    `INSERT INTO activity (id, client_id, date, author, note, kind, created_at)
     VALUES (?, ?, ?, ?, ?, 'system', ?)`,
  ).run(newId(), clientId, todayISO(), author, note, new Date().toISOString());
}
