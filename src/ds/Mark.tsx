/** The Phot.AI brand mark: a purple rounded square with a white "P". */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: Math.round(size * 0.28),
        background: '#6729F3',
        color: '#fff',
        fontFamily: "'Inter Tight', sans-serif",
        fontWeight: 700,
        fontSize: Math.round(size * 0.58),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      P
    </div>
  );
}
