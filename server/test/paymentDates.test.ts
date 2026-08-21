import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.SESSION_SECRET = 'test-secret';
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'client-ops-paydates-'));
/**
 * A workspace timezone whose calendar date is *not* the UTC one right now.
 *
 * Asia/Kolkata differs from UTC for five and a half hours a day, so a test
 * pinned to it would only catch a UTC-based implementation during that window —
 * passing by luck the rest of the time. Kiritimati is UTC+14 and Niue is UTC-11,
 * so at every instant at least one of them is on a different day, and the check
 * below is real whenever the suite happens to run.
 */
function calendarDateIn(timeZone: string, at = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const UTC_TODAY = new Date().toISOString().slice(0, 10);
const OFFSET_ZONE =
  ['Pacific/Kiritimati', 'Pacific/Niue'].find((z) => calendarDateIn(z) !== UTC_TODAY) ??
  'Pacific/Kiritimati';
process.env.WORKSPACE_TIMEZONE = OFFSET_ZONE;

const { createApp } = await import('../src/app');
const { openDb } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');
const { todayISO } = await import('../src/domain/activity');

const db = openDb(':memory:');
seedDemoWorkspace(db, { password: 'demo-pass-2026!' });
const server = createApp(db).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let cookie = '';
let clientId = '';

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** An invoice issued on a known date, with nothing paid against it. */
async function invoiceIssuedOn(number: string, issueDate: string, dueDate: string) {
  const created = await call('POST', `/api/clients/${clientId}/invoices`, {
    number,
    baseAmount: 10000,
    gstPercent: 0,
    gstMode: 'excluded',
    issueDate,
    dueDate,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.clients
    .find((c: any) => c.id === clientId)
    .invoices.find((i: any) => i.number === number);
}

const paymentsOn = (body: any, id: string) => {
  for (const c of body.clients) {
    const inv = (c.invoices ?? []).find((i: any) => i.id === id);
    if (inv) return inv.payments;
  }
  return [];
};

before(async () => {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'priya@phot.ai', password: 'demo-pass-2026!' }),
  });
  cookie = (login.headers.getSetCookie?.()[0] ?? '').split(';')[0];
  clientId = (await call('GET', '/api/clients')).body.clients[0].id;
});

after(() => {
  server.close();
  db.close();
});

describe('F-01 a payment cannot predate the invoice it settles', () => {
  test('a payment dated before the issue date is refused', async () => {
    const invoice = await invoiceIssuedOn('INV-F01-1', '2026-08-20', '2026-09-19');
    const early = await call('POST', `/api/clients/${clientId}/invoices/${invoice.id}/payments`, {
      bankAmount: 5000,
      tds: 0,
      date: '2026-08-01',
    });
    assert.equal(early.status, 400);
    assert.match(early.body.error, /cannot be dated before the invoice was issued/);
    // The message names the invoice and the date, since this is nearly always a
    // typed month or year and the fix should be obvious.
    assert.match(early.body.error, /INV-F01-1/);
    assert.match(early.body.error, /2026-08-20/);
  });

  test('the same day is fine, and so is any day after', async () => {
    const invoice = await invoiceIssuedOn('INV-F01-2', '2026-08-20', '2026-09-19');
    const sameDay = await call('POST', `/api/clients/${clientId}/invoices/${invoice.id}/payments`, {
      bankAmount: 1000,
      tds: 0,
      date: '2026-08-20',
    });
    assert.equal(sameDay.status, 201, 'paid on the day it was issued');

    const later = await call('POST', `/api/clients/${clientId}/invoices/${invoice.id}/payments`, {
      bankAmount: 1000,
      tds: 0,
      date: '2026-09-05',
    });
    assert.equal(later.status, 201);
  });

  test('nothing is recorded when the date is refused', async () => {
    const invoice = await invoiceIssuedOn('INV-F01-3', '2026-08-20', '2026-09-19');
    await call('POST', `/api/clients/${clientId}/invoices/${invoice.id}/payments`, {
      bankAmount: 5000,
      tds: 0,
      date: '2025-01-01',
    });
    const after = await call('GET', '/api/clients');
    assert.deepEqual(paymentsOn(after.body, invoice.id), []);
  });
});

describe('F-02 settling states its accounting date', () => {
  test('the date can be given, for money that arrived before anyone recorded it', async () => {
    // The realistic case: the transfer landed on the 18th, someone reconciles on
    // the 21st. The payment belongs to the 18th.
    const invoice = await invoiceIssuedOn('INV-F02-1', '2026-08-01', '2026-08-31');
    const settled = await call('POST', `/api/clients/${clientId}/invoices/${invoice.id}/settle`, {
      date: '2026-08-18',
    });
    assert.equal(settled.status, 200);

    const payments = paymentsOn(settled.body, invoice.id);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].date, '2026-08-18', 'not the day the button was clicked');
    assert.equal(payments[0].bankAmount, 1000000, 'the whole balance, in minor units');
  });

  test('without a date it uses the workspace calendar, not UTC', async () => {
    // The bug the previous timezone fix missed: settle built its own date with
    // toISOString().slice(0, 10), which is the UTC day. The workspace zone here
    // is deliberately one that is on a different date right now, so a UTC
    // implementation is off by one every time this runs, not just sometimes.
    assert.notEqual(calendarDateIn(OFFSET_ZONE), UTC_TODAY, 'the two zones must disagree today');

    const invoice = await invoiceIssuedOn('INV-F02-2', '2020-01-01', '2020-01-31');
    const settled = await call('POST', `/api/clients/${clientId}/invoices/${invoice.id}/settle`);
    assert.equal(settled.status, 200);

    const payment = paymentsOn(settled.body, invoice.id)[0];
    assert.equal(payment.date, todayISO(), 'the workspace timezone decides what today is');
    assert.equal(payment.date, calendarDateIn(OFFSET_ZONE));
    assert.notEqual(payment.date, UTC_TODAY, 'and the UTC day is not what gets stored');
  });

  test('settling still cannot predate the invoice', async () => {
    const invoice = await invoiceIssuedOn('INV-F02-3', '2026-08-20', '2026-09-19');
    const settled = await call('POST', `/api/clients/${clientId}/invoices/${invoice.id}/settle`, {
      date: '2026-07-01',
    });
    assert.equal(settled.status, 400);
    assert.match(settled.body.error, /cannot be dated before the invoice was issued/);
  });

  test('an invalid settle date is refused rather than ignored', async () => {
    const invoice = await invoiceIssuedOn('INV-F02-4', '2026-08-20', '2026-09-19');
    const settled = await call('POST', `/api/clients/${clientId}/invoices/${invoice.id}/settle`, {
      date: '2026-02-31',
    });
    assert.equal(settled.status, 400);
  });

  test('settling an already-settled invoice is still a no-op', async () => {
    const invoice = await invoiceIssuedOn('INV-F02-5', '2026-08-01', '2026-08-31');
    await call('POST', `/api/clients/${clientId}/invoices/${invoice.id}/settle`, {
      date: '2026-08-10',
    });
    const again = await call('POST', `/api/clients/${clientId}/invoices/${invoice.id}/settle`, {
      date: '2026-08-11',
    });
    assert.equal(again.status, 200);
    assert.equal(paymentsOn(again.body, invoice.id).length, 1, 'no second payment');
  });
});
