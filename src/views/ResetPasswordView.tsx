import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { Button } from '../ds/Button';
import { Mark } from '../ds/Mark';
import { useApp } from '../state/AppState';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Shown when the URL carries `?reset=<token>`.
 *
 * The link is checked before the form is offered, so an expired one says so
 * immediately rather than after someone has typed a password twice.
 */
export function ResetPasswordView({ token }: { token: string }) {
  const { state, actions } = useApp();
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .checkReset(token)
      .then(({ valid: ok }) => {
        if (!cancelled) {
          setValid(ok);
          setChecking(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setChecking(false);
        setLocalError(err instanceof ApiError ? err.message : 'Could not check that link.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

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
    void actions.redeemReset(token, password).catch(() => {});
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

        {checking ? (
          <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Checking that link…</div>
        ) : !valid ? (
          <>
            <div className="page-title" style={{ fontSize: 22 }}>
              That link has expired
            </div>
            <div className="page-subtitle" style={{ marginBottom: 20 }}>
              Reset links can only be used once, and they expire. Ask a workspace Owner for a new
              one.
            </div>
            <Button
              variant="secondary"
              size="lg"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={actions.dismissReset}
            >
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <div className="page-title" style={{ fontSize: 22 }}>
              Choose a new password
            </div>
            <div className="page-subtitle" style={{ marginBottom: 20 }}>
              You will be signed in once it is set.
            </div>

            <label className="field">
              New password
              <input
                className="field-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
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
              {state.busy ? 'Setting password…' : 'Set password & sign in'}
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
