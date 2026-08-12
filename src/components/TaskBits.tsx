import { TASK_STATUS_OPTIONS } from '../data/options';
import type { TaskStatus } from '../data/types';
import { CHIP_PALETTES } from '../ds/Chip';
import { attachmentLabel, isImageAttachment, thumbnailStyle } from '../lib/attachments';
import { taskStatusColor } from '../lib/statusColors';
import { safeHref } from '../lib/urls';

/** Ticket key, e.g. "COB-3" — first three letters of the client + row number. */
export function taskProjectKey(clientName: string): string {
  return (clientName || 'TSK').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'TSK';
}

/** A status dropdown styled as the status chip it sets. */
export function TaskStatusSelect({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}) {
  const p = CHIP_PALETTES[taskStatusColor(status)];
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      style={{
        display: 'inline-block',
        height: 24,
        lineHeight: '24px',
        padding: '0 12px',
        borderRadius: 9999,
        background: p.bg,
        color: p.fg,
        fontFamily: "'Inter Tight', sans-serif",
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        border: 'none',
        outline: 'none',
        cursor: 'pointer',
        appearance: 'none',
        textAlign: 'center',
        boxShadow: 'none',
        margin: 0,
        verticalAlign: 'middle',
      }}
    >
      {TASK_STATUS_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

/** Image attachments render as thumbnails, everything else as a file link. */
export function AttachmentList({ attachments }: { attachments: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {attachments.map((url, i) => {
        // A thumbnail of an unsafe URL is still shown, just not clickable.
        const href = safeHref(url);
        return isImageAttachment(url) ? (
          <a key={i} href={href} target="_blank" rel="noreferrer noopener" style={{ display: 'inline-block' }}>
            <div style={thumbnailStyle(url, 56, 8)} />
          </a>
        ) : (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              color: href ? 'var(--phot-purple)' : 'var(--ink-3)',
              textDecoration: 'none',
              height: 56,
            }}
          >
            <img
              src="/assets/icons/document.svg"
              width={12}
              height={12}
              className="icon-purple"
              alt=""
            />
            {attachmentLabel(url)}
          </a>
        );
      })}
    </div>
  );
}
