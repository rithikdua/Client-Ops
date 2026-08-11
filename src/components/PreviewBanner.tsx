import { useAccess } from '../state/access';
import { useApp } from '../state/AppState';

/** Sticky banner shown while viewing the app through a teammate's access. */
export function PreviewBanner() {
  const { actions } = useApp();
  const { banner } = useAccess();
  if (!banner) return null;

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        background: 'var(--surface-tint)',
        borderBottom: '1px solid var(--phot-purple)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--ink-1)' }}>
        <strong>Previewing as {banner.name}</strong> · {banner.role} — sees {banner.summary}
      </div>
      <span
        onClick={actions.exitPreview}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--phot-purple)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Exit preview
      </span>
    </div>
  );
}
