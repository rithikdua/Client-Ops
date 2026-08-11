import { NAV_ORDER } from '../data/options';
import type { NavKey } from '../data/types';
import { Avatar } from '../ds/Avatar';
import { Icon } from '../ds/Icon';
import { Mark } from '../ds/Mark';
import { useAccess } from '../state/access';
import { useApp } from '../state/AppState';

const NAV_META: Record<NavKey, { label: string; icon: string }> = {
  overview: { label: 'Overview', icon: 'home' },
  clients: { label: 'Clients', icon: 'shop' },
  invoices: { label: 'Invoices & Payments', icon: 'coin' },
  deliverables: { label: 'Deliverables', icon: 'task-square' },
  documents: { label: 'Documents', icon: 'document' },
  team: { label: 'Team', icon: 'profile-2user' },
  followups: { label: 'Follow-ups', icon: 'notification' },
};

export function Sidebar() {
  const { state, actions } = useApp();
  const { access } = useAccess();

  return (
    <aside className="sidebar">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 8px',
          marginBottom: 4,
        }}
        className="sidebar-logo"
      >
        <Mark size={26} />
        <div
          className="nav-label"
          style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: '-0.01em',
          }}
        >
          Phot<span style={{ color: 'var(--phot-purple)' }}>.AI</span>
        </div>
      </div>
      <div
        className="sidebar-label"
        style={{ fontSize: 11, color: 'var(--ink-3)', padding: '0 8px 12px', fontWeight: 500 }}
      >
        Client Ops
      </div>
      <div
        className="sidebar-label"
        style={{
          fontSize: 10,
          color: 'var(--ink-3)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          padding: '8px 10px 4px',
          fontWeight: 600,
        }}
      >
        Workspace
      </div>

      {NAV_ORDER.filter((id) => access[id]).map((id) => {
        const active = state.view === id;
        return (
          <div
            key={id}
            className="nav-item"
            data-active={active}
            onClick={() => actions.goTo(id)}
          >
            <Icon
              name={NAV_META[id].icon}
              size={16}
              className={active ? 'icon-purple' : 'icon-muted'}
            />
            <span className="nav-label">{NAV_META[id].label}</span>
          </div>
        );
      })}

      <div style={{ flex: 1 }} />

      <div
        style={{
          border: '1px solid var(--border-2)',
          borderRadius: 12,
          padding: 12,
          background: 'linear-gradient(180deg, var(--phot-purple-50) 0%, #fff 100%)',
        }}
      >
        <div className="sidebar-identity" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar initials="PS" size={28} />
          <div className="nav-label" style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 600,
                fontSize: 12.5,
                color: 'var(--ink-1)',
              }}
            >
              Priya Shah
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Ops lead</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
