import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AuthUser,
  Profile,
  fetchProfile,
  getMe,
  logout,
  saveProfile,
} from './api';

const EMPTY: Record<string, string> = {
  firstName: '',
  lastName: '',
  mailingAddress1: '',
  mailingAddress2: '',
  mailingCity: '',
  mailingState: '',
  mailingZip: '',
  physicalAddress1: '',
  physicalAddress2: '',
  physicalCity: '',
  physicalState: '',
  physicalZip: '',
  ssn: '',
  dateOfBirth: '',
};

function fromProfile(p: Profile): Record<string, string> {
  return {
    ...EMPTY,
    firstName: p.firstName,
    lastName: p.lastName,
    mailingAddress1: p.mailingAddress1,
    mailingAddress2: p.mailingAddress2 || '',
    mailingCity: p.mailingCity,
    mailingState: p.mailingState,
    mailingZip: p.mailingZip,
    physicalAddress1: p.physicalAddress1,
    physicalAddress2: p.physicalAddress2 || '',
    physicalCity: p.physicalCity,
    physicalState: p.physicalState,
    physicalZip: p.physicalZip,
    ssn: '',
    dateOfBirth: p.dateOfBirth,
  };
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [ssnMasked, setSsnMasked] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (!me) {
          navigate('/login', { replace: true });
          return;
        }
        if (cancelled) return;
        setUser(me);
        const data = await fetchProfile();
        if (cancelled) return;
        setForm(fromProfile(data.profile));
        setSsnMasked(data.profile.ssnMasked);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          navigate('/login', { replace: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});
    try {
      const payload = { ...form };
      if (!payload.ssn && ssnMasked) {
        // Keep existing SSN when field left blank after prior save — server requires SSN.
        // Ask user to re-enter if blank and no prior value path: require entry when empty.
      }
      const result = await saveProfile(payload);
      setSsnMasked(result.profile.ssnMasked);
      setForm(fromProfile(result.profile));
      setMessage(result.message);
    } catch (err) {
      const e = err as Error & { fieldErrors?: Record<string, string> };
      setError(e.message);
      if (e.fieldErrors) setFieldErrors(e.fieldErrors);
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">Loading profile…</p>
      </div>
    );
  }

  return (
    <div className="page profile-page">
      <header className="profile-header">
        <div>
          <p className="eyebrow">Your profile</p>
          <h1>Applicant demographics</h1>
          <p className="lede">
            Keep contact details current so the agency can reach your family
            about child-care needs. Household/child listing is deferred to the
            request slice.
          </p>
          {user && <p className="hint">Signed in as {user.email}</p>}
        </div>
        <div className="profile-actions">
          <Link className="btn ghost" to="/roster">
            Staff roster (dev)
          </Link>
          <button className="btn out" type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}
      {message && <div className="banner ok">{message}</div>}

      <form className="profile-form" onSubmit={onSave}>
        <section>
          <h2>Name</h2>
          <div className="grid2">
            <Field
              label="First Name"
              name="firstName"
              value={form.firstName}
              error={fieldErrors.firstName}
              onChange={setField}
              required
            />
            <Field
              label="Last Name"
              name="lastName"
              value={form.lastName}
              error={fieldErrors.lastName}
              onChange={setField}
              required
            />
          </div>
        </section>

        <section>
          <h2>Mailing address</h2>
          <Field
            label="Mailing Address 1"
            name="mailingAddress1"
            value={form.mailingAddress1}
            error={fieldErrors.mailingAddress1}
            onChange={setField}
            required
          />
          <Field
            label="Mailing Address 2 (optional)"
            name="mailingAddress2"
            value={form.mailingAddress2}
            error={fieldErrors.mailingAddress2}
            onChange={setField}
          />
          <div className="grid3">
            <Field
              label="City"
              name="mailingCity"
              value={form.mailingCity}
              error={fieldErrors.mailingCity}
              onChange={setField}
              required
            />
            <Field
              label="State"
              name="mailingState"
              value={form.mailingState}
              error={fieldErrors.mailingState}
              onChange={setField}
              required
            />
            <Field
              label="Zip"
              name="mailingZip"
              value={form.mailingZip}
              error={fieldErrors.mailingZip}
              onChange={setField}
              required
            />
          </div>
        </section>

        <section>
          <h2>Physical address</h2>
          <Field
            label="Physical Address 1"
            name="physicalAddress1"
            value={form.physicalAddress1}
            error={fieldErrors.physicalAddress1}
            onChange={setField}
            required
          />
          <Field
            label="Physical Address 2 (optional)"
            name="physicalAddress2"
            value={form.physicalAddress2}
            error={fieldErrors.physicalAddress2}
            onChange={setField}
          />
          <div className="grid3">
            <Field
              label="City"
              name="physicalCity"
              value={form.physicalCity}
              error={fieldErrors.physicalCity}
              onChange={setField}
              required
            />
            <Field
              label="State"
              name="physicalState"
              value={form.physicalState}
              error={fieldErrors.physicalState}
              onChange={setField}
              required
            />
            <Field
              label="Zip"
              name="physicalZip"
              value={form.physicalZip}
              error={fieldErrors.physicalZip}
              onChange={setField}
              required
            />
          </div>
        </section>

        <section>
          <h2>Sensitive identifiers</h2>
          <p className="hint">
            SSN is masked after save (e.g. ***-**-6789). Use synthetic values
            only in non-production environments.
          </p>
          <div className="grid2">
            <label>
              SSN {ssnMasked ? `(saved ${ssnMasked})` : ''}
              <input
                value={form.ssn}
                onChange={(e) => setField('ssn', e.target.value)}
                placeholder={ssnMasked || '###-##-####'}
                required={!ssnMasked}
              />
              {fieldErrors.ssn && <span className="field-error">{fieldErrors.ssn}</span>}
            </label>
            <Field
              label="Date of Birth"
              name="dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              error={fieldErrors.dateOfBirth}
              onChange={setField}
              required
            />
          </div>
        </section>

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  error,
  required,
  type = 'text',
}: {
  label: string;
  name: string;
  value: string;
  onChange: (name: string, value: string) => void;
  error?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        required={required}
      />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
