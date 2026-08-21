import type { CSSProperties } from 'react';

/** A Vuesax-style stroke icon from `public/assets/icons`. */
export function Icon({
  name,
  size = 16,
  className,
  style,
  alt = '',
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}) {
  return (
    <img
      src={`/assets/icons/${name}.svg`}
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, ...style }}
      alt={alt}
    />
  );
}

export function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8B8C8F" strokeWidth={1.5}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/** Row-expander chevron; rotates 90° when open. */
export function Chevron({ open, size = 10 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ink-3)"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transition: 'transform 0.15s',
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        flexShrink: 0,
      }}
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

/**
 * An icon-only delete control.
 *
 * This was a bare `<img onClick>`: not focusable, not activated by Enter, and
 * announced only as an image called "Remove" with no hint of what it removes.
 * It is now a button whose label names its target, because "Remove, button"
 * repeated eight times down a table tells a screen-reader user nothing about
 * which row they are on.
 */
export function TrashButton({
  onClick,
  size = 15,
  label,
}: {
  onClick: () => void;
  size?: number;
  /** What is being removed, e.g. the contact's name. */
  label: string;
}) {
  return (
    <button type="button" className="icon-button trash-button" onClick={onClick} aria-label={label}>
      <img src="/assets/icons/trash.svg" width={size} height={size} className="trash" alt="" />
    </button>
  );
}
