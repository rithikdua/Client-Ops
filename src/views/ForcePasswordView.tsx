import { useState, type FormEvent } from 'react';
import { Button } from '../ds/Button';
import { Mark } from '../ds/Mark';
import { useApp } from '../state/AppState';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Blocks the workspace until someone replaces a password an Owner chose for them.
 *
 * A full screen rather than a dismissible modal, because the reason is not
 * cosmetic: until this is done, another person knows these credentials. The
 * server refuses every data endpoint in the same state, so a user who dodged this
 * screen would only find a wall of 403s.
 */
export function ForcePasswordView() {
  const { state, actions } = useApp();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setLocalError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setLocalError('The passwords do not match.');
      return;
    }
    void actions.setOwnPassword(current, password).catch(() => {});
  };

  const message = localError ?? state.error;

  return (
    <div
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
        style={{ width: 400, padding: 32, background: '#fff', boxShadow: 'var(--shadow-2)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Mark size={30} />
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>
            Phot<span style={{ color: 'var(--phot-purple)' }}>.AI</span>
          </div>
        </div>

        <div className="page-title" style={{ fontSize: 22 }}>
          Set your own password
        </div>
        <div className="page-subtitle" style={{ marginBottom: 20 }}>
          Your account was created with a temporary password, so whoever set it up still knows it.
          Choose your own to continue.
        </div>

        <label className="field">
          Temporary password
          <input
            className="field-input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          New password
          <input
            className="field-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="field-hint" style={{ marginTop: 4 }}>
          At least {MIN_PASSWORD_LENGTH} characters, and different from the temporary one.
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          Confirm new password
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
          onClick={submit}
        >
          {state.busy ? 'Saving…' : 'Set password & continue'}
        </Button>

        <div
          onClick={actions.logout}
          style={{
            marginTop: 14,
            fontSize: 12.5,
            color: 'var(--phot-purple)',
            cursor: 'pointer',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
          Sign out instead
        </div>
      </form>
    </div>
  );
}
