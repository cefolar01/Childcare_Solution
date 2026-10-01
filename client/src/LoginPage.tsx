import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  forceResetPassword,
  login,
  verifyLoginTotp,
} from './api';

type Step = 'credentials' | 'totp' | 'force_reset';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [step, setStep] = useState<Step>('credentials');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(email, password);
      setChallengeToken(result.challengeToken);
      setStep('totp');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onTotp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await verifyLoginTotp(challengeToken, code);
      if (result.next === 'force_password_reset' && result.resetToken) {
        setResetToken(result.resetToken);
        setResetMessage(result.message || 'Password reset required.');
        setStep('force_reset');
        return;
      }
      navigate('/profile', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onForceReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await forceResetPassword(resetToken, newPassword);
      navigate('/profile', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="eyebrow">Applicant portal</p>
        <h1>Sign in</h1>
        <p className="lede">
          Email, password, then authenticator code. After success you land on
          your profile.
        </p>

        {error && <div className="banner error">{error}</div>}

        {step === 'credentials' && (
          <form onSubmit={onLogin} className="auth-form">
            <label>
              Email (username)
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        )}

        {step === 'totp' && (
          <form onSubmit={onTotp} className="auth-form">
            <label>
              Authenticator code
              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify and continue'}
            </button>
          </form>
        )}

        {step === 'force_reset' && (
          <form onSubmit={onForceReset} className="auth-form">
            <p className="hint">{resetMessage}</p>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </label>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Update password and open profile'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          Need an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
