import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import type { CurrencyCode } from '../data/types';
import { SearchIcon } from '../ds/Icon';
import { fmtMoney, moneyEntries, type MoneyByCurrency } from '../lib/money';

export function PageHeader({
  title,
  subtitle,
  action,
  align = 'flex-start',
  marginBottom = 20,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  align?: 'flex-start' | 'flex-end';
  marginBottom?: number;
}) {
  return (
    <div className="page-head" style={{ alignItems: align, marginBottom }}>
      <div>
        {/* The page's heading, and the only `h1` on it. Every screen looked
            like one unbroken run of text to anything that navigates by
            headings, which is how most screen-reader users move around. */}
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  style,
  iconSize = 16,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  style?: CSSProperties;
  iconSize?: number;
}) {
  return (
    <div className="search" style={style}>
      <SearchIcon size={iconSize} />
      {/* `type="search"` so it is announced as a search box, and the placeholder
          doubles as the label — there is no visible one, and a placeholder alone
          disappears the moment anything is typed. */}
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className = 'select',
  style,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  /** Either plain values or explicit value/label pairs. */
  options: readonly (T | { value: T; label: string })[];
  className?: string;
  style?: CSSProperties;
  /**
   * Required, and not optional by oversight. These filters have no visible
   * label — the current option doubles as one — so without this a screen
   * reader announces "All health, combo box" with no clue what it filters.
   */
  label: string;
}) {
  return (
    <select
      className={className}
      style={style}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((opt) => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        return (
          <option key={v} value={v}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

/**
 * A one-of-several choice drawn as joined buttons.
 *
 * These were `div`s, so the choice could not be reached, read or changed from a
 * keyboard at all — including the GST treatment toggle, which decides what an
 * invoice is worth. It is a radio group: one tab stop for the whole control,
 * arrow keys to move between options, exactly as a native radio group behaves.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  small = false,
  style,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  small?: boolean;
  style?: CSSProperties;
  /** Names the group. Point at a visible caption with `labelledBy` instead. */
  label?: string;
  labelledBy?: string;
}) {
  const group = useRef<HTMLDivElement>(null);

  const move = (index: number, step: number) => {
    const at = (index + step + options.length) % options.length;
    onChange(options[at].value);
    // The roving tab index follows the selection on re-render, but focus does
    // not move on its own — without this the ring stays on the option you just
    // left and the next arrow press goes the wrong way.
    group.current?.querySelectorAll('button')[at]?.focus();
  };

  return (
    <div className="segmented" style={style} role="radiogroup" aria-label={label} ref={group}>
      {options.map((opt, i) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            // Roving tab stop: the group is one stop, and arrows move inside it.
            tabIndex={selected ? 0 : -1}
            className={small ? 'seg-btn seg-btn--sm' : 'seg-btn'}
            data-active={selected}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(i, -1);
              }
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Grid header strip for the list tables. */
export function TableHead({
  columns,
  gridTemplateColumns,
  columnGap,
  style,
}: {
  columns: ReactNode[];
  gridTemplateColumns: string;
  columnGap?: number;
  style?: CSSProperties;
}) {
  return (
    <div className="table-head" style={{ display: 'grid', gridTemplateColumns, columnGap, ...style }}>
      {columns.map((c, i) => (
        <span key={i}>{c}</span>
      ))}
    </div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <div className="table-empty">{children}</div>;
}

/**
 * Three-dot trigger with a small dropdown of actions.
 *
 * The trigger was a `div` holding a "⋮" character, which a screen reader reads
 * out as the character itself if it reads it at all, and which no keyboard could
 * reach. It is now a labelled button that says what row it belongs to, opens a
 * menu, closes on Escape or a click elsewhere, and hands focus to the first item
 * so the menu can be used without a mouse.
 */
export function RowMenu({
  open,
  onToggle,
  wide = false,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  wide?: boolean;
  /** Which row this menu acts on, e.g. the invoice number. */
  label: string;
  children: ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('.row-menu-item')?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onToggle();
      // Back to the trigger, not to the top of the document — otherwise
      // dismissing a menu costs you your place in a long table.
      wrap.current?.querySelector<HTMLElement>('button')?.focus();
    };
    // A menu that only closes by clicking its own trigger again is a trap for
    // anyone who opens one and then reaches for something else.
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onToggle();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onToggle]);

  return (
    <div style={{ position: 'relative' }} ref={wrap}>
      <button
        type="button"
        className="icon-btn"
        onClick={onToggle}
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open && (
        <div id={menuId} role="menu" className={wide ? 'row-menu row-menu--wide' : 'row-menu'}>
          {children}
        </div>
      )}
    </div>
  );
}

export function RowMenuItem({
  children,
  onClick,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={danger ? 'row-menu-item row-menu-item--danger' : 'row-menu-item'}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * The one thing a table row does, as a real button.
 *
 * Whole rows carry an `onClick` here, which is a fine mouse affordance and no
 * affordance at all otherwise: a `div` cannot be tabbed to, has no role, and
 * Enter does nothing. Rather than bolt `role="button"` onto rows that already
 * contain buttons of their own — nesting controls inside controls — the row's
 * primary target becomes a button and the row click stays as a shortcut. The
 * button is what keyboard and screen-reader users get, and it is named after
 * the row rather than "open".
 */
export function RowAction({
  onClick,
  children,
  style,
  label,
  expanded,
  controls,
}: {
  onClick: () => void;
  children: ReactNode;
  style?: CSSProperties;
  /** Overrides the visible text when that text is not self-explanatory. */
  label?: string;
  /** Set when the button reveals a panel, so its state is announced. */
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <button
      type="button"
      className="row-action"
      style={style}
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
    >
      {children}
    </button>
  );
}

/** Small uppercase caption over a value, used in the meta strips. */
export function MetaCell({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={style}>
      <div className="meta-label">{label}</div>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  small = false,
  chip,
}: {
  label: string;
  value: ReactNode;
  small?: boolean;
  chip?: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={small ? 'stat-value stat-value--sm' : 'stat-value'}>{value}</div>
      {chip && <div style={{ marginTop: 8 }}>{chip}</div>}
    </div>
  );
}

/** A labelled metric inside the finance summary panels. */
export function Metric({
  label,
  value,
  valueColor,
  labelSize = 12,
  valueSize = 20,
  extra,
}: {
  label: string;
  /** A node, not a string: a cross-currency total is one line per currency. */
  value: ReactNode;
  valueColor?: string;
  labelSize?: number;
  valueSize?: number;
  extra?: ReactNode;
}) {
  return (
    <div>
      <div style={{ fontSize: labelSize, color: 'var(--ink-3)' }}>{label}</div>
      <div
        style={{
          fontFamily: 'var(--font-ui)',
          fontWeight: 700,
          fontSize: valueSize,
          letterSpacing: '-0.02em',
          marginTop: valueSize >= 20 ? 6 : 4,
          color: valueColor,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
      {extra}
    </div>
  );
}

/**
 * A cross-client total, one line per currency.
 *
 * Nothing here converts: a workspace billing in rupees and dollars gets two
 * amounts, because the alternative is adding them together and labelling the
 * result with whichever symbol came first. With a single currency — the usual
 * case — this renders one line and looks exactly like a plain amount.
 */
export function MoneyTotals({
  totals,
  fallback = 'INR',
  color,
  perCurrency,
}: {
  totals: MoneyByCurrency;
  /** Used only when there is nothing to total. */
  fallback?: CurrencyCode;
  color?: string;
  /** Optional caption under each line, e.g. a per-currency percentage. */
  perCurrency?: (code: CurrencyCode, minor: number) => ReactNode;
}) {
  const entries = moneyEntries(totals);
  const rows: [CurrencyCode, number][] = entries.length ? entries : [[fallback, 0]];
  return (
    <>
      {rows.map(([code, minor], i) => (
        <div key={code} style={{ marginTop: i === 0 ? 0 : 2, color }}>
          {fmtMoney(minor, code)}
          {perCurrency?.(code, minor)}
        </div>
      ))}
    </>
  );
}
