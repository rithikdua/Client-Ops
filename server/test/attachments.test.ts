import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.SESSION_SECRET = 'test-secret';
const UPLOADS = mkdtempSync(join(tmpdir(), 'client-ops-attach-'));
process.env.UPLOAD_DIR = UPLOADS;

const { createApp } = await import('../src/app');
const { openDb } = await import('../src/db/index');
const { seedDemoWorkspace } = await import('../src/db/seed');
const { attachmentsFor, unreferencedUploads, commitThenDelete } = await import(
  '../src/domain/attachments'
);
const { collectOrphanUploads } = await import('../src/routes/uploads');

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

const clientOf = (body: any) => body.clients.find((c: any) => c.id === clientId);

/** An upload row plus the file behind it, without going through multipart. */
function fakeUpload(filename: string, section = 'clients'): string {
  const id = `up-${filename}`;
  writeFileSync(join(UPLOADS, filename), 'x');
  db.prepare(
    `INSERT INTO uploads (id, filename, original_name, mime, size_bytes, client_id, section, created_at)
     VALUES (?, ?, ?, 'application/pdf', 1, ?, ?, ?)`,
  ).run(id, filename, filename, clientId, section, new Date(0).toISOString());
  return id;
}

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

describe('F-06 an attachment references its upload', () => {
  test('attaching a file records the upload, not a string to be parsed later', async () => {
    fakeUpload('linked.pdf');
    const invoice = clientOf((await call('GET', '/api/clients')).body).invoices[0];

    const res = await call('PUT', `/api/clients/${clientId}/invoices/${invoice.id}/file`, {
      fileName: 'Contract.pdf',
      fileUrl: '/api/uploads/linked.pdf',
    });
    assert.equal(res.status, 200);

    const row = db
      .prepare('SELECT upload_id, external_url FROM attachments WHERE invoice_id = ?')
      .get(invoice.id) as { upload_id: string | null; external_url: string | null };
    assert.equal(row.upload_id, 'up-linked.pdf', 'a reference, not a URL');
    assert.equal(row.external_url, null);
  });

  test('a link to somewhere else is still an attachment', async () => {
    // A shared drive, a client's own portal. Refusing to store it because we do
    // not host it would lose a real attachment.
    const invoice = clientOf((await call('GET', '/api/clients')).body).invoices[1];
    await call('PUT', `/api/clients/${clientId}/invoices/${invoice.id}/file`, {
      fileName: 'On the client portal',
      fileUrl: 'https://portal.example.com/inv/9',
    });
    const row = db
      .prepare('SELECT upload_id, external_url FROM attachments WHERE invoice_id = ?')
      .get(invoice.id) as { upload_id: string | null; external_url: string | null };
    assert.equal(row.upload_id, null);
    assert.equal(row.external_url, 'https://portal.example.com/inv/9');
  });

  test('the sweeper keeps a file that is referenced', () => {
    // The failure the old design allowed. Reference-finding was a regular
    // expression over every URL string in four tables, so a URL it did not
    // match looked unreferenced and the file was deleted — while the record
    // still pointed at it.
    const unreferenced = unreferencedUploads(db, new Date().toISOString()).map((u) => u.filename);
    assert.ok(!unreferenced.includes('linked.pdf'), 'an attached file is not an orphan');
  });

  test('a file nothing points at is collected, and only that file', () => {
    fakeUpload('abandoned.pdf');
    assert.ok(existsSync(join(UPLOADS, 'abandoned.pdf')));
    assert.ok(existsSync(join(UPLOADS, 'linked.pdf')));

    const { removed } = collectOrphanUploads(db, 0);
    assert.ok(removed >= 1);
    assert.equal(existsSync(join(UPLOADS, 'abandoned.pdf')), false, 'the orphan is gone');
    assert.ok(existsSync(join(UPLOADS, 'linked.pdf')), 'the attached file is untouched');
  });

  test('archiving keeps the attachment; purging is what takes it', async () => {
    fakeUpload('doomed.pdf');
    const created = await call('POST', `/api/clients/${clientId}/deliverables`, {
      title: 'With a file',
      dueDate: '2026-09-01',
      fileUrl: '/api/uploads/doomed.pdf',
      fileName: 'doomed.pdf',
    });
    const deliverable = clientOf(created.body).deliverables.find(
      (d: any) => d.title === 'With a file',
    );
    assert.equal(deliverable.file.url, '/api/uploads/doomed.pdf');

    const attachmentCount = () =>
      (db.prepare('SELECT COUNT(*) n FROM attachments WHERE deliverable_id = ?').get(deliverable.id) as any).n;
    assert.equal(attachmentCount(), 1);

    // Deleting archives (F-10), so the attachment has to survive — otherwise
    // restoring the deliverable would bring back a record with its file gone.
    await call('DELETE', `/api/clients/${clientId}/deliverables/${deliverable.id}`);
    assert.equal(attachmentCount(), 1, 'archived, so still attached');
    assert.ok(existsSync(join(UPLOADS, 'doomed.pdf')));

    const { purgeArchived } = await import('../src/domain/archive');
    purgeArchived(db, new Date(Date.now() + 1000).toISOString());

    // No code deleted this. The foreign key did, in the same transaction — which
    // is the difference between a relation and four columns of text.
    assert.equal(attachmentCount(), 0, 'purged, so the attachment went with it');
    // The file waits for the sweep, which is deliberate: it may be attached
    // somewhere else too.
    assert.ok(existsSync(join(UPLOADS, 'doomed.pdf')));
  });

  test('replacing a file leaves exactly one attachment', async () => {
    fakeUpload('first.pdf');
    fakeUpload('second.pdf');
    const invoice = clientOf((await call('GET', '/api/clients')).body).invoices[2];
    for (const name of ['first.pdf', 'second.pdf']) {
      await call('PUT', `/api/clients/${clientId}/invoices/${invoice.id}/file`, {
        fileName: name,
        fileUrl: `/api/uploads/${name}`,
      });
    }
    const rows = attachmentsFor(db, { invoiceId: invoice.id });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].url, '/api/uploads/second.pdf');
  });

  test('a task keeps a list, and each entry is its own row', async () => {
    fakeUpload('one.pdf');
    fakeUpload('two.pdf');
    const created = await call('POST', `/api/clients/${clientId}/tasks`, {
      title: 'Two files',
      status: 'New',
      priority: 'Medium',
      attachments: ['/api/uploads/one.pdf', 'https://example.com/spec'],
    });
    const task = clientOf(created.body).tasks.find((t: any) => t.title === 'Two files');
    assert.deepEqual(task.attachments, ['/api/uploads/one.pdf', 'https://example.com/spec']);
    assert.equal(
      (db.prepare('SELECT COUNT(*) n FROM attachments WHERE task_id = ?').get(task.id) as any).n,
      2,
    );
  });
});

describe('F-06 files are deleted after the commit, never inside it', () => {
  test('a rollback does not leave the database pointing at a deleted file', () => {
    // The old sweeper unlinked inside its transaction. Anything that threw
    // part-way through rolled the rows back and left the files gone — a database
    // confidently referring to nothing, which is the worse of the two failures.
    const id = fakeUpload('survivor.pdf');
    const path = join(UPLOADS, 'survivor.pdf');

    assert.throws(() =>
      commitThenDelete(db, () => {
        db.prepare('DELETE FROM uploads WHERE id = ?').run(id);
        throw new Error('something went wrong after the delete');
      }),
    );

    assert.ok(existsSync(path), 'the file is still there');
    assert.ok(
      db.prepare('SELECT id FROM uploads WHERE id = ?').get(id),
      'and so is the row — the two agree either way',
    );
  });

  test('a file already gone from disk is not an error', () => {
    const id = fakeUpload('vanished.pdf');
    const removed = commitThenDelete(db, () => {
      db.prepare('DELETE FROM uploads WHERE id = ?').run(id);
      return [join(UPLOADS, 'no-such-file-at-all.pdf')];
    });
    assert.equal(removed, 0, 'nothing unlinked');
    assert.equal(
      db.prepare('SELECT id FROM uploads WHERE id = ?').get(id),
      undefined,
      'but the row is still gone, which is the state we wanted',
    );
  });
});

describe('F-06 upgrading an existing database', () => {
  test('URL columns are carried across, uploads matched and links kept', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'client-ops-attach-mig-')), 'db.sqlite');
    const old = openDb(path);
    // Put back the shape a v12 database had.
    old.exec('ALTER TABLE invoices ADD COLUMN file_url TEXT');
    old.exec('ALTER TABLE invoices ADD COLUMN file_name TEXT');
    old.exec('ALTER TABLE documents ADD COLUMN url TEXT');
    old.exec(
      `CREATE TABLE task_attachments (
         id TEXT PRIMARY KEY, task_id TEXT NOT NULL, url TEXT NOT NULL)`,
    );
    old.exec('DROP TABLE attachments');
    old.exec(`
      INSERT INTO clients (id, name, health, stage, billing_cycle, start_date, created_at)
        VALUES ('mc', 'Migrated', 'Active', 'Live', 'Monthly', '2026-01-01', '2026-01-01T00:00:00Z');
      INSERT INTO uploads (id, filename, original_name, mime, size_bytes, client_id, section, created_at)
        VALUES ('mu', 'held.pdf', 'Held.pdf', 'application/pdf', 5, 'mc', 'clients', '2026-01-01T00:00:00Z');
      INSERT INTO invoices (id, client_id, number, amount_minor, base_amount_minor, issue_date, due_date, file_url, file_name, created_at)
        VALUES ('mi', 'mc', 'INV-M', 100, 100, '2026-01-01', '2026-02-01', '/api/uploads/held.pdf', 'Held.pdf', '2026-01-01T00:00:00Z');
      INSERT INTO documents (id, client_id, name, type, date, url, source, created_at)
        VALUES ('md', 'mc', 'Elsewhere', 'Other', '2026-01-01', 'https://drive.example.com/x', 'us', '2026-01-01T00:00:00Z');
    `);
    old.prepare('UPDATE schema_version SET version = 12').run();
    old.close();

    const upgraded = openDb(path);

    const invoiceAttachment = upgraded
      .prepare('SELECT upload_id, external_url, name FROM attachments WHERE invoice_id = ?')
      .get('mi') as { upload_id: string | null; external_url: string | null; name: string };
    assert.equal(invoiceAttachment.upload_id, 'mu', 'matched to the upload it referred to');
    assert.equal(invoiceAttachment.name, 'Held.pdf');

    const documentAttachment = upgraded
      .prepare('SELECT upload_id, external_url FROM attachments WHERE document_id = ?')
      .get('md') as { upload_id: string | null; external_url: string | null };
    assert.equal(
      documentAttachment.external_url,
      'https://drive.example.com/x',
      'an address we cannot serve is kept rather than discarded',
    );

    // One place an attachment lives, not two.
    const invoiceColumns = (
      upgraded.prepare('PRAGMA table_info(invoices)').all() as { name: string }[]
    ).map((c) => c.name);
    assert.ok(!invoiceColumns.includes('file_url'));
    assert.ok(!invoiceColumns.includes('file_name'));
    assert.equal(
      upgraded
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_attachments'")
        .get(),
      undefined,
    );

    upgraded.close();
  });
});
