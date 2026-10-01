import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { enrollTotp, fetchTotpSetup, register } from './api';

type Step = 'credentials' | 'totp' | 'done';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('credentials');
  const [enrollmentToken, setEnrollmentToken] = useState('');
  const [policy, setPolicy] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await register(email, password);
      setEnrollmentToken(result.enrollmentToken);
      setPolicy(result.passwordPolicy);
      const setup = await fetchTotpSetup(result.enrollmentToken);
      setOtpauthUrl(setup.otpauthUrl);
      setSecret(setup.secret);
      setStep('totp');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onEnroll(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await enrollTotp(enrollmentToken, code);
      setStep('done');
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
        <h1>Create your account</h1>
        <p className="lede">
          Self-register with your email as username, a strong password, and
          authenticator-app 2FA. Passwords must be changed every 90 days.
        </p>

        {error && <div className="banner error">{error}</div>}

        {step === 'credentials' && (
          <form onSubmit={onRegister} className="auth-form">
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <p className="hint">
              At least 12 characters with upper, lower, digit, and special
              character. Policy enforces a 90-day reset.
            </p>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Working…' : 'Continue to 2FA'}
            </button>
          </form>
        )}

        {step === 'totp' && (
          <form onSubmit={onEnroll} className="auth-form">
            {policy && <p className="hint">{policy}</p>}
            <p>
              Add this account in your authenticator app, then enter a 6-digit
              code to finish registration.
            </p>
            <label>
              Manual secret
              <input readOnly value={secret} />
            </label>
            <p className="hint break">{otpauthUrl}</p>
            <label>
              Verification code
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
              {busy ? 'Verifying…' : 'Complete registration'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="auth-form">
            <p className="success-copy">
              Registration complete. Continue to sign in to open your profile.
            </p>
            <button className="btn primary" type="button" onClick={() => navigate('/login')}>
              Continue to sign in
            </button>
          </div>
        )}

        <p className="auth-footer">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
