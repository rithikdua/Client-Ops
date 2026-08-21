import { Router } from 'express';
import { requireWrite } from '../auth/permissions';
import { transact, type Db } from '../db/index';
import { ARCHIVABLE, restoreRow, type ArchivableTable } from '../domain/archive';
import { logSystemActivity } from '../domain/activity';
import { HttpError } from '../http/errors';
import { audit, type AuditAction } from '../domain/audit';
import { snapshotFor } from './clients';

/**
 * Seeing and undoing what has been archived.
 *
 * One router rather than a `restore` on each resource: restoring is the same
 * operation whatever the row is, and the seven copies that would otherwise
 * exist are seven chances for one of them to forget the parent check.
 *
 * Access follows the section the record belongs to, exactly as reading it does.
 * Archiving something is not a way to move it out from behind its permission —
 * a teammate without Invoices access must not be able to list, or resurrect, an
 * archived invoice.
 */

/** Which section grants sight of each kind of archived row. */
const SECTION_OF: Record<ArchivableTable, 'clients' | 'invoices' | 'deliverables' | 'documents' | 'followups'> = {
  clients: 'clients',
  contacts: 'clients',
  tasks: 'clients',
  invoices: 'invoices',
  deliverables: 'deliverables',
  documents: 'documents',
  follow_ups: 'followups',
};

/** The audit trail names things in the singular; the tables do not. */
const AUDIT_NAME: Record<ArchivableTable, string> = {
  clients: 'client',
  contacts: 'contact',
  invoices: 'invoice',
  deliverables: 'deliverable',
  documents: 'document',
  tasks: 'task',
  follow_ups: 'followup',
};

/** What each archived row shows in a list: enough to recognise it. */
const LABEL_OF: Record<ArchivableTable, string> = {
  clients: 'name',
  contacts: 'name',
  invoices: 'number',
  deliverables: 'title',
  documents: 'name',
  tasks: 'title',
  follow_ups: 'name',
};

export interface ArchivedRow {
  id: string;
  type: ArchivableTable;
  label: string;
  archivedAt: string;
  /** The account it belonged to, when it had one. */
  clientId?: string;
  clientName?: string;
}

function parseTable(value: string): ArchivableTable {
  if (!Object.prototype.hasOwnProperty.call(ARCHIVABLE, value)) {
    throw new HttpError(400, 'That is not something that can be archived.');
  }
  return value as ArchivableTable;
}

/** Archived rows of one kind, newest first. */
export function listArchived(db: Db, table: ArchivableTable, clientId?: string): ArchivedRow[] {
  const label = LABEL_OF[table];
  const scoped = table !== 'clients' && table !== 'follow_ups';
  const rows = db
    .prepare(
      `SELECT t.id, t.${label} AS label, t.archived_at
              ${scoped ? ', t.client_id, c.name AS client_name' : ''}
         FROM ${table} t
              ${scoped ? 'LEFT JOIN clients c ON c.id = t.client_id' : ''}
        WHERE t.archived_at IS NOT NULL
              ${scoped && clientId ? 'AND t.client_id = ?' : ''}
        ORDER BY t.archived_at DESC`,
    )
    .all(...(scoped && clientId ? [clientId] : [])) as {
    id: string;
    label: string;
    archived_at: string;
    client_id?: string;
    client_name?: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    type: table,
    label: r.label,
    archivedAt: r.archived_at,
    ...(r.client_id ? { clientId: r.client_id, clientName: r.client_name ?? '' } : {}),
  }));
}

export function archiveRoutes(db: Db): Router {
  const router = Router();

  /**
   * Everything archived that this user is allowed to see.
   *
   * `?clientId=` narrows it to one account, which is what the client detail
   * screen asks for; without it the Clients screen gets archived accounts.
   */
  router.get('/', (req, res) => {
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
    const only = typeof req.query.type === 'string' ? [parseTable(req.query.type)] : undefined;

    const tables = (only ?? (Object.keys(ARCHIVABLE) as ArchivableTable[])).filter(
      (table) => req.actor!.access[SECTION_OF[table]],
    );
    const rows = tables.flatMap((table) => listArchived(db, table, clientId));
    rows.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
    res.json({ archived: rows });
  });

  router.post('/:type/:id/restore', requireWrite, (req, res) => {
    const table = parseTable(req.params.type);
    if (!req.actor!.access[SECTION_OF[table]]) {
      throw new HttpError(403, `You do not have access to ${ARCHIVABLE[table].toLowerCase()}s.`);
    }

    transact(db, () => {
      restoreRow(db, table, req.params.id);
      const label =
        (
          db
            .prepare(`SELECT ${LABEL_OF[table]} AS label FROM ${table} WHERE id = ?`)
            .get(req.params.id) as { label: string } | undefined
        )?.label ?? req.params.id;

      audit(db, req, {
        action: `${AUDIT_NAME[table]}.restore` as AuditAction,
        targetType: AUDIT_NAME[table],
        targetId: req.params.id,
        targetLabel: label,
        detail: 'restored from the archive',
      });

      // The client's own feed should say it came back, for the same reason it
      // says things were added: the feed is the account's history.
      const owner =
        table === 'clients'
          ? req.params.id
          : (
              db.prepare(`SELECT client_id FROM ${table} WHERE id = ?`).get(req.params.id) as
                | { client_id?: string }
                | undefined
            )?.client_id;
      if (owner) {
        logSystemActivity(
          db,
          owner,
          `${ARCHIVABLE[table]} "${label}" restored from the archive`,
          req.actor!.name,
        );
      }
    });

    res.json(snapshotFor(db, req));
  });

  return router;
}
