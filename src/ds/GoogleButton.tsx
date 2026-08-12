/**
 * "Continue with Google" button, following Google's identity branding: white
 * surface, grey border, the four-colour G, and Roboto-ish neutral label.
 *
 * Clicking it is a full-page navigation, not a fetch — OAuth needs the browser
 * to visit Google and come back.
 */
export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  return (
    <a
      href="/api/auth/google"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        height: 44,
        borderRadius: 10,
        border: '1px solid #DADCE0',
        background: '#fff',
        color: '#3C4043',
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 15,
        textDecoration: 'none',
        width: '100%',
      }}
    >
      <GoogleG />
      {label}
    </a>
  );
}

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/** Horizontal rule with a centred label, separating sign-in methods. */
export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-2)' }} />
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-2)' }} />
    </div>
  );
}
