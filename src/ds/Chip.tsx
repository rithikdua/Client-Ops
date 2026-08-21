import type { CSSProperties, ReactNode } from 'react';

export type ChipColor = 'purple' | 'green' | 'amber' | 'red' | 'grey' | 'dark';

/**
 * Chip text is 11px bold — small text by WCAG's reckoning, so it owes 4.5:1
 * against its own background rather than the 3:1 large text gets away with.
 *
 * Three of the six were under that: green 2.71, red 3.11, amber 3.55. Those
 * three are exactly the ones carrying meaning rather than decoration — "At
 * Risk", "Overdue", "Paid" — so being hard to read is the whole failure. The
 * foregrounds are darkened within the same hue and every background is
 * untouched, so the palette still reads as the design's.
 *
 * Red lands on #B3200B, which is already the error-text colour used elsewhere.
 */
export const CHIP_PALETTES: Record<ChipColor, { bg: string; fg: string }> = {
  purple: { bg: '#F3F4FF', fg: '#6729F3' }, /* 6.02 */
  green: { bg: '#DEF2E5', fg: '#17722C' }, /* was #27A644, 2.71 -> 5.16 */
  amber: { bg: '#FEF1DB', fg: '#8A5806' }, /* was #B27207, 3.55 -> 5.41 */
  red: { bg: '#FEE4E0', fg: '#B3200B' }, /* was #F34129, 3.11 -> 5.56 */
  grey: { bg: '#ECECEC', fg: '#33323A' }, /* 10.72 */
  dark: { bg: '#1A1A1A', fg: '#fff' }, /* 17.40 */
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
