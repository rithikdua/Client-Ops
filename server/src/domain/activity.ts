import { envTimezone } from '../config';
import { newId, type Db } from '../db/index';

/**
 * The workspace's business timezone. Every calendar day in the system — activity
 * dates, follow-up due dates, the browser's default date on a form — is measured
 * here, so a deployment's server timezone cannot change what "today" means.
 */
export const WORKSPACE_TIMEZONE = envTimezone('WORKSPACE_TIMEZONE', 'Asia/Kolkata');

/**
 * The server owns the clock — clients never supply "today".
 *
 * Measured in the workspace timezone rather than the host's, which is what keeps
 * this in step with the date the browser puts in a form. A UTC container serving
 * a team in India was stamping the next day's date from 6:30pm local onward.
 */
export function todayISO(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
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
