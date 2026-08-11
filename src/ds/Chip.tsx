import type { CSSProperties, ReactNode } from 'react';

export type ChipColor = 'purple' | 'green' | 'amber' | 'red' | 'grey' | 'dark';

export const CHIP_PALETTES: Record<ChipColor, { bg: string; fg: string }> = {
  purple: { bg: '#F3F4FF', fg: '#6729F3' },
  green: { bg: '#DEF2E5', fg: '#27A644' },
  amber: { bg: '#FEF1DB', fg: '#B27207' },
  red: { bg: '#FEE4E0', fg: '#F34129' },
  grey: { bg: '#ECECEC', fg: '#33323A' },
  dark: { bg: '#1A1A1A', fg: '#fff' },
};

export function Chip({
  children,
  color = 'purple',
  style,
}: {
  children: ReactNode;
  color?: ChipColor;
  style?: CSSProperties;
}) {
  const p = CHIP_PALETTES[color];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 24,
        padding: '0 10px',
        borderRadius: 9999,
        background: p.bg,
        color: p.fg,
        fontFamily: "'Inter Tight', sans-serif",
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
