import type { CSSProperties, ReactNode } from 'react';
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
        <div className="page-title">{title}</div>
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
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className = 'select',
  style,
}: {
  value: T;
  onChange: (v: T) => void;
  /** Either plain values or explicit value/label pairs. */
  options: readonly (T | { value: T; label: string })[];
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <select
      className={className}
      style={style}
      value={value}
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

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  small = false,
  style,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  small?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className="segmented" style={style}>
      {options.map((opt) => (
        <div
          key={opt.value}
          className={small ? 'seg-btn seg-btn--sm' : 'seg-btn'}
          data-active={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </div>
      ))}
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

/** Three-dot trigger with a small dropdown of actions. */
export function RowMenu({
  open,
  onToggle,
  wide = false,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <div className="icon-btn" onClick={onToggle}>
        ⋮
      </div>
      {open && <div className={wide ? 'row-menu row-menu--wide' : 'row-menu'}>{children}</div>}
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
    <div className={danger ? 'row-menu-item row-menu-item--danger' : 'row-menu-item'} onClick={onClick}>
      {children}
    </div>
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
