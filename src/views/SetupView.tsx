import { useState, type FormEvent } from 'react';
import { Button } from '../ds/Button';
import { GoogleButton, OrDivider } from '../ds/GoogleButton';
import { Mark } from '../ds/Mark';
import { useApp } from '../state/AppState';

const MIN_PASSWORD_LENGTH = 8;

/**
 * First-run setup. Shown only while the workspace has no accounts at all; the
 * server closes the endpoint permanently once one exists, so this is a bootstrap
 * step rather than open self-registration.
 */
export function SetupView() {
  const { state, actions } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setLocalError(null);
    if (!name.trim() || !email.trim()) {
      setLocalError('Your name and email are required.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }
    if (password !== confirm) {
      setLocalError('The passwords do not match.');
      return;
    }
    void actions
      .setup({
        name: name.trim(),
        email: email.trim(),
        role: role.trim(),
        password,
        setupToken: setupCode.trim(),
      })
      .catch(() => {});
  };

  const message = localError ?? state.error;

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
        style={{ width: 420, padding: 32, background: '#fff', boxShadow: 'var(--shadow-2)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Mark size={30} />
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>
            Phot<span style={{ color: 'var(--phot-purple)' }}>.AI</span>
          </div>
        </div>

        <h1 className="page-title" style={{ fontSize: 22 }}>
          Create your account
        </h1>
        <div className="page-subtitle" style={{ marginBottom: 20 }}>
          This workspace is empty. The first account becomes its Owner, with full access and the
          ability to invite the rest of your team.
        </div>

        {state.setupTokenRequired && (
          <label className="field" style={{ marginBottom: 16 }}>
            Setup code
            <input
              className="field-input"
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
              placeholder="From whoever deployed this"
              autoComplete="off"
            />
            <div className="field-hint">
              This deployment requires the one-time code set as SETUP_TOKEN.
            </div>
          </label>
        )}

        {state.googleEnabled && (
          <>
            <GoogleButton label="Continue with Google" />
            <div className="field-hint" style={{ marginTop: 8, marginBottom: 4 }}>
              Your Google account becomes the Owner — no password to choose.
            </div>
            <OrDivider label="or set a password" />
          </>
        )}

        <label className="field">
          Full name
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rithik Dua"
            autoFocus
          />
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          Work email
          <input
            className="field-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          Job title <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(optional)</span>
          <input
            className="field-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Ops Lead"
          />
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          Password
          <input
            className="field-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="field-hint" style={{ marginTop: 4 }}>
          At least {MIN_PASSWORD_LENGTH} characters.
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          Confirm password
          <input
            className="field-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        {message && (
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
            {message}
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          style={{ width: '100%', marginTop: 18, justifyContent: 'center' }}
          type="submit"
        >
          {state.busy ? 'Creating account…' : 'Create account & sign in'}
        </Button>
      </form>
    </main>
  );
}
