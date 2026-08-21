import { useState, type FormEvent } from 'react';
import { Button } from '../ds/Button';
import { GoogleButton, OrDivider } from '../ds/GoogleButton';
import { Mark } from '../ds/Mark';
import { useApp } from '../state/AppState';

export function LoginView() {
  const { state, actions } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!email || !password) return;
    // The provider surfaces failures through state.error.
    void actions.login(email, password).catch(() => {});
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--grad-header)',
        fontFamily: 'var(--font-ui)',
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        className="card"
        style={{ width: 380, padding: 32, background: '#fff', boxShadow: 'var(--shadow-2)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Mark size={30} />
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>
            Phot<span style={{ color: 'var(--phot-purple)' }}>.AI</span>
          </div>
        </div>

        <h1 className="page-title" style={{ fontSize: 22 }}>
          Sign in to Client Ops
        </h1>
        <div className="page-subtitle" style={{ marginBottom: 20 }}>
          Use your workspace account.
        </div>

        {state.googleEnabled && (
          <>
            <GoogleButton />
            <OrDivider label="or sign in with email" />
          </>
        )}

        <label className="field">
          Email
          <input
            className="field-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@phot.ai"
            autoFocus
          />
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          Password
          <input
            className="field-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {state.error && (
          <div
            role="alert"
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 8,
              background: '#FEE4E0',
              color: '#B3200B',
              fontSize: 13,
            }}
          >
            {state.error}
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          style={{ width: '100%', marginTop: 18, justifyContent: 'center' }}
          type="submit"
        >
          {state.busy ? 'Signing in…' : 'Sign in'}
        </Button>

        <div style={{ marginTop: 18, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
          Accounts are created by a workspace Owner from the Team screen.
          {state.googleEnabled && ' If yours was set up with Google, use the button above.'}
        </div>
      </form>
    </main>
  );
}
