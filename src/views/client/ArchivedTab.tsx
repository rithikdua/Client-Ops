import { useEffect } from 'react';
import { ArchivedList } from '../../components/ArchivedList';
import type { Client } from '../../data/types';
import { useAccess } from '../../state/access';
import { useApp } from '../../state/AppState';

/**
 * Everything deleted from this account, and how to put it back.
 *
 * Deleting an invoice or a task now hides it, so it has to be visible
 * somewhere or the promise of recovery is theoretical. It lives on the account
 * rather than in a workspace-wide bin because that is where you go looking:
 * you know which client lost the thing, not when it happened.
 *
 * Archived rows are not part of the snapshot — the server does not send them —
 * so this fetches when the tab is opened.
 */
export function ArchivedTab({ client }: { client: Client }) {
  const { state, actions } = useApp();
  const { canWrite } = useAccess();

  useEffect(() => {
    actions.loadArchived(client.id);
  }, [actions, client.id]);

  // The workspace-wide list and this one share state, so filter to this account.
  // Clients themselves are excluded: an archived client is not reachable from
  // inside itself, and restoring one belongs on the Clients screen.
  const rows = state.archived.filter((row) => row.clientId === client.id && row.type !== 'clients');

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 12 }}>
        Deleted records are kept here rather than destroyed. Restoring one puts it
        back exactly where it was.
      </div>
      <ArchivedList
        rows={rows}
        loading={state.archivedLoading}
        canWrite={canWrite}
        empty="Nothing has been deleted from this account."
        onRestore={actions.restoreArchived}
        showKind
      />
    </div>
  );
}
