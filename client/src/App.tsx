import { useEffect, useMemo, useState } from 'react';
import {
  Child,
  NewChild,
  checkIn,
  checkOut,
  createChild,
  deleteChild,
  fetchChildren,
} from './api';

const EMPTY_FORM: NewChild = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  guardianName: '',
  guardianPhone: '',
  classroom: 'Sunflowers',
};

export default function App() {
  const [children, setChildren] = useState<Child[]>([]);
  const [form, setForm] = useState<NewChild>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setChildren(await fetchChildren());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const presentCount = useMemo(
    () => children.filter((c) => c.present).length,
    [children]
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createChild(form);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleAttendance(child: Child) {
    try {
      if (child.present) {
        await checkOut(child.id);
      } else {
        await checkIn(child.id);
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete(child: Child) {
    try {
      await deleteChild(child.id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <h1>Childcare Solution</h1>
          <p className="subtitle">Daily roster &amp; attendance tracking</p>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="stat-value">{children.length}</span>
            <span className="stat-label">Enrolled</span>
          </div>
          <div className="stat present">
            <span className="stat-value">{presentCount}</span>
            <span className="stat-label">Present</span>
          </div>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <main className="layout">
        <section className="card roster">
          <h2>Roster</h2>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <ul className="child-list">
              {children.map((child) => (
                <li key={child.id} className="child-row">
                  <div className="child-main">
                    <span
                      className={`dot ${child.present ? 'on' : 'off'}`}
                      aria-hidden
                    />
                    <div>
                      <div className="child-name">
                        {child.firstName} {child.lastName}
                      </div>
                      <div className="child-meta">
                        {child.classroom} · Guardian: {child.guardianName} (
                        {child.guardianPhone})
                      </div>
                    </div>
                  </div>
                  <div className="child-actions">
                    <button
                      className={child.present ? 'btn out' : 'btn in'}
                      onClick={() => toggleAttendance(child)}
                    >
                      {child.present ? 'Check out' : 'Check in'}
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => handleDelete(child)}
                      aria-label={`Remove ${child.firstName}`}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
              {children.length === 0 && (
                <li className="muted">No children enrolled yet.</li>
              )}
            </ul>
          )}
        </section>

        <section className="card form">
          <h2>Enroll a child</h2>
          <form onSubmit={handleAdd}>
            <div className="grid2">
              <label>
                First name
                <input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              Date of birth
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                required
              />
            </label>
            <div className="grid2">
              <label>
                Guardian name
                <input
                  value={form.guardianName}
                  onChange={(e) =>
                    setForm({ ...form, guardianName: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                Guardian phone
                <input
                  value={form.guardianPhone}
                  onChange={(e) =>
                    setForm({ ...form, guardianPhone: e.target.value })
                  }
                  required
                />
              </label>
            </div>
            <label>
              Classroom
              <select
                value={form.classroom}
                onChange={(e) => setForm({ ...form, classroom: e.target.value })}
              >
                <option>Sunflowers</option>
                <option>Ladybugs</option>
                <option>Caterpillars</option>
                <option>Unassigned</option>
              </select>
            </label>
            <button type="submit" className="btn primary">
              Add to roster
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
