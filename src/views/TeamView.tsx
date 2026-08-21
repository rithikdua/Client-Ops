import { EmptyRow, PageHeader, TableHead } from '../components/ui';
import { ACCESS_SECTIONS, ALL_ACCESS } from '../data/options';
import { Avatar } from '../ds/Avatar';
import { Chip } from '../ds/Chip';
import { TrashButton } from '../ds/Icon';
import { permissionColor } from '../lib/statusColors';
import { useAccess } from '../state/access';
import { useApp } from '../state/AppState';

const GRID = '2fr 1.3fr 1fr 1fr 170px';

export function TeamView() {
  const { state, actions } = useApp();
  // Adding people and changing what they can see is Owner-only, server-side too.
  const { canManageTeam } = useAccess();

  return (
    <div className="page">
      <PageHeader
        title="Team"
        subtitle="Everyone who can be assigned as an account owner or deliverable owner."
        action={
          canManageTeam && (
            <button type="button" className="btn btn--primary" onClick={actions.openAddTeammate}>
              <img src="/assets/icons/add-square.svg" width={16} height={16} className="icon-invert" alt="" />
              Add teammate
            </button>
          )
        }
      />

      <div className="card card--clip">
        <TableHead
          gridTemplateColumns={GRID}
          columnGap={12}
          columns={['Name', 'Role', 'Permission', 'Access', '']}
        />
        {state.team.map((t) => {
          const access = { ...ALL_ACCESS, ...(t.access ?? {}) };
          const granted = ACCESS_SECTIONS.filter((sec) => access[sec.key]).length;
          const isFull = granted === ACCESS_SECTIONS.length;
          return (
            <div
              key={t.id}
              className="table-row"
              style={{ display: 'grid', gridTemplateColumns: GRID, columnGap: 12 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar initials={t.name[0]} size={30} />
                <span style={{ fontWeight: 600 }}>{t.name}</span>
              </div>
              <span>{t.role}</span>
              <span>
                <Chip color={permissionColor(t.permission)}>{t.permission}</Chip>
              </span>
              <span
                style={{
                  color: isFull ? 'var(--ink-3)' : 'var(--phot-purple)',
                  fontSize: 13,
                }}
              >
                {isFull ? 'Full access' : `${granted}/${ACCESS_SECTIONS.length} sections`}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'flex-end' }}>
                {canManageTeam && (
                  <>
                    {/* Every row holds the same three words, so each says whose
                        access, whose password and whose account it acts on. */}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => actions.openManagePermissions(t)}
                      aria-label={`Manage access for ${t.name}`}
                      style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}
                    >
                      Manage
                    </button>
                    {/* Recovery for a teammate who cannot get in, without
                        deleting the account and losing its history. */}
                    {t.id !== state.me?.id && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => actions.createResetLink(t)}
                        aria-label={`Create a password reset link for ${t.name}`}
                        style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}
                      >
                        Reset
                      </button>
                    )}
                    <TrashButton
                      onClick={() => actions.removeTeammate(t.id)}
                      label={`Remove ${t.name} from the workspace`}
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
        {state.team.length === 0 && <EmptyRow>No teammates added yet.</EmptyRow>}
      </div>
    </div>
  );
}
