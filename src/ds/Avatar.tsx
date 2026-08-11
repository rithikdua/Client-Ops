import type { CSSProperties } from 'react';

export function Avatar({
  initials = 'AR',
  size = 32,
  color = '#6729F3',
  style,
}: {
  initials?: string;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: color,
        color: '#fff',
        fontFamily: "'Inter Tight', sans-serif",
        fontWeight: 600,
        fontSize: size * 0.38,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {initials}
    </div>
  );
}
