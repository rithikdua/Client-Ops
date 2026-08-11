import {
  EmptyRow,
  PageHeader,
  RowMenu,
  RowMenuItem,
  SearchField,
  SegmentedControl,
  Select,
  TableHead,
} from '../components/ui';
import { Chip } from '../ds/Chip';
import { Chevron } from '../ds/Icon';
import { useAccess } from '../state/access';
import { useApp, type FollowUpStatusFilter, type FollowUpSubTab } from '../state/AppState';
import { useFollowUpRows, usePhonebookRows } from '../state/derive';

const QUEUE_GRID = '16px 1.6fr 1fr 1.4fr 0.8fr 0.8fr 0.9fr 48px';
const PHONEBOOK_GRID = '1.2fr 1fr 1.4fr 1fr';

export function FollowUpsView() {
  const { state, actions } = useApp();
  const { rows } = useFollowUpRows();
  const phonebook = usePhonebookRows();
  const { canWrite } = useAccess();
  const isPhonebook = state.followUpSubTab === 'phonebook';

  return (
    <div className="page">
      <PageHeader
        title="Follow-ups"
        subtitle="Who the team needs to reach out to — introductions, check-ins, and pending replies, all in one place."
        action={
          canWrite && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={isPhonebook ? actions.openAddContactGlobal : actions.openAddFollowUp}
            >
              <img src="/assets/icons/add-square.svg" width={16} height={16} className="icon-invert" alt="" />
              {isPhonebook ? 'Add contact' : 'Add follow-up'}
            </button>
          )
        }
      />

      <SegmentedControl<FollowUpSubTab>
        value={state.followUpSubTab}
        onChange={actions.setFollowUpSubTab}
        options={[
          { value: 'queue', label: 'Follow-up queue' },
          { value: 'phonebook', label: 'Phonebook' },
        ]}
        style={{ marginBottom: 20 }}
      />

      {!isPhonebook && (
        <>
          <div style={{ marginBottom: 16 }}>
            <Select<FollowUpStatusFilter>
              value={state.followUpStatusFilter}
              onChange={actions.setFollowUpStatusFilter}
              options={[
                { value: 'pending', label: 'Pending only' },
                { value: 'done', label: 'Done only' },
                { value: 'all', label: 'All' },
              ]}
            />
          </div>

          {/* No overflow clipping here — the row menu must escape the card. */}
          <div className="card">
            <TableHead
              gridTemplateColumns={QUEUE_GRID}
              style={{ borderRadius: '12px 12px 0 0' }}
              columns={['', 'Contact', 'Client', 'Reason', 'Owner', 'Due', 'Status', '']}
            />
            {rows.map((row) => {
              const expanded = !!state.expandedFollowUps[row.id];
              return (
                <div key={row.id} style={{ borderBottom: '1px solid var(--border-2)' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: QUEUE_GRID,
                      padding: 'var(--row-pad)',
                      alignItems: 'center',
                      fontSize: 13.5,
                      position: 'relative',
                    }}
                  >
                    <div onClick={() => actions.toggleFollowUpExpand(row.id)} style={{ cursor: 'pointer' }}>
                      <Chevron open={expanded} />
                    </div>
                    <div style={{ minWidth: 0, paddingRight: 10 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.name}
                      </div>
                      {row.email && (
                        <div
                          style={{
                            fontSize: 11.5,
                            marginTop: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <a href={`mailto:${row.email}`}>{row.email}</a>
                        </div>
                      )}
                      {row.phone && (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: 'var(--ink-3)',
                            marginTop: 2,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.phone}
                        </div>
                      )}
                    </div>
                    {row.client ? (
                      <span
                        onClick={() => actions.openClient(row.client!.id)}
                        style={{ cursor: 'pointer', color: 'var(--phot-purple)' }}
                      >
                        {row.clientName}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--ink-3)' }}>{row.clientName}</span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--ink-2)' }}>{row.reason}</div>
                      {row.logCount > 0 && (
                        <div
                          onClick={() => actions.toggleFollowUpExpand(row.id)}
                          style={{
                            fontSize: 11.5,
                            color: 'var(--phot-purple)',
                            marginTop: 3,
                            cursor: 'pointer',
                          }}
                        >
                          {row.logCount} past call(s) · last: “{row.lastLogNote}”
                        </div>
                      )}
                    </div>
                    <span>{row.owner}</span>
                    <span>{row.dueDateFormatted}</span>
                    <span
                      onClick={
                        canWrite
                          ? () =>
                              row.status === 'Done'
                                ? actions.reopenFollowUp(row.id)
                                : actions.openCompleteFollowUp(row.id)
                          : undefined
                      }
                      style={{ cursor: canWrite ? 'pointer' : 'default' }}
                    >
                      <Chip color={row.statusColor}>{row.statusLabel}</Chip>
                    </span>
                    {canWrite ? (
                      <RowMenu
                        open={state.followUpMenuOpenId === row.id}
                        onToggle={() => actions.toggleFollowUpMenu(row.id)}
                      >
                        <RowMenuItem onClick={() => actions.openEditFollowUp(row.source)}>Edit</RowMenuItem>
                        <RowMenuItem danger onClick={() => actions.removeFollowUp(row.id)}>
                          Delete
                        </RowMenuItem>
                      </RowMenu>
                    ) : (
                      <span />
                    )}
                  </div>

                  {expanded && (
                    <div style={{ padding: '0 20px 16px 42px' }}>
                      <div className="expand-panel">
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--ink-3)',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            marginBottom: 10,
                          }}
                        >
                          Call history
                        </div>
                        {row.logRows.map((lg) => (
                          <div key={lg.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-2)' }}>
                            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>
                              {lg.dateFormatted}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--ink-1)', marginTop: 2 }}>{lg.note}</div>
                          </div>
                        ))}
                        {row.logRows.length === 0 && (
                          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>No calls logged yet.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {rows.length === 0 && <EmptyRow>Nothing to follow up on.</EmptyRow>}
          </div>
        </>
      )}

      {isPhonebook && (
        <div className="card card--clip">
          <div className="card-head">
            <div className="card-title">Phonebook</div>
            <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
              Every client contact, in one searchable directory.
            </div>
            <SearchField
              value={state.phonebookSearch}
              onChange={actions.setPhonebookSearch}
              placeholder="Search name, company, email…"
              iconSize={15}
              style={{ marginTop: 12, height: 38, maxWidth: 320, flex: 'none', border: '1px solid var(--border-1)' }}
            />
          </div>
          <TableHead
            gridTemplateColumns={PHONEBOOK_GRID}
            columns={['Name', 'Client', 'Email', 'Phone']}
          />
          {phonebook.map((pb) => (
            <div
              key={pb.id}
              className="table-row"
              style={{ display: 'grid', gridTemplateColumns: PHONEBOOK_GRID }}
            >
              <div>
                <span style={{ fontWeight: 600 }}>{pb.name}</span>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{pb.role}</div>
              </div>
              <span
                onClick={() => actions.openClientTab(pb.clientId, 'contacts')}
                style={{ cursor: 'pointer', color: 'var(--phot-purple)' }}
              >
                {pb.clientName}
              </span>
              <span>
                <a href={`mailto:${pb.email}`}>{pb.email}</a>
              </span>
              <span>
                <a href={`tel:${pb.phone}`} style={{ color: 'var(--ink-1)', textDecoration: 'none' }}>
                  {pb.phone}
                </a>
              </span>
            </div>
          ))}
          {phonebook.length === 0 && <EmptyRow>No contacts match your search.</EmptyRow>}
        </div>
      )}
    </div>
  );
}
