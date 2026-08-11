import type { CSSProperties, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'pill' | 'secondary' | 'ghost' | 'dark' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<ButtonSize, { h: number; px: number; fs: number; r: number }> = {
  sm: { h: 28, px: 12, fs: 12, r: 6 },
  md: { h: 36, px: 16, fs: 14, r: 8 },
  lg: { h: 44, px: 20, fs: 15, r: 10 },
};

const VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: { background: '#6729F3', color: '#fff' },
  pill: {
    background: '#6729F3',
    color: '#fff',
    borderRadius: 9999,
    fontWeight: 700,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  secondary: { background: '#fff', color: '#1A1A1A', border: '1px solid #D9D9D9' },
  ghost: { background: 'transparent', color: '#6729F3' },
  dark: { background: '#1A1A1A', color: '#fff' },
  danger: { background: '#fff', color: '#F34129', border: '1px solid #F34129' },
};

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  icon,
  style,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  onClick?: () => void;
  /** Icon file name from `public/assets/icons`, rendered at 16px. */
  icon?: string;
  style?: CSSProperties;
}) {
  const s = SIZES[size];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: s.h,
        padding: `0 ${s.px}px`,
        borderRadius: s.r,
        fontFamily: "'Inter Tight', system-ui, sans-serif",
        fontWeight: 600,
        fontSize: s.fs,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: 'pointer',
        transition: 'all 150ms cubic-bezier(0.2,0,0,1)',
        border: 'none',
        outline: 'none',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
        ...VARIANTS[variant],
        ...style,
      }}
    >
      {icon && <img src={`/assets/icons/${icon}.svg`} width={16} height={16} alt="" />}
      {children}
    </button>
  );
}
