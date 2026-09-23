import express from 'express';
import cors from 'cors';

/**
 * Build the Express app around a given database instance. Kept separate from
 * the server bootstrap so tests can inject an in-memory database.
 */
export function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.get('/api/children', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT c.*,
                a.id AS open_attendance_id,
                a.check_in AS checked_in_at
         FROM children c
         LEFT JOIN attendance a
           ON a.child_id = c.id AND a.check_out IS NULL
         ORDER BY c.first_name, c.last_name`
      )
      .all();
    res.json(
      rows.map((r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        dateOfBirth: r.date_of_birth,
        guardianName: r.guardian_name,
        guardianPhone: r.guardian_phone,
        classroom: r.classroom,
        present: r.open_attendance_id != null,
        checkedInAt: r.checked_in_at,
      }))
    );
  });

  app.post('/api/children', (req, res) => {
    const {
      firstName,
      lastName,
      dateOfBirth,
      guardianName,
      guardianPhone,
      classroom,
    } = req.body ?? {};

    if (!firstName || !lastName || !dateOfBirth || !guardianName || !guardianPhone) {
      return res.status(400).json({
        error:
          'firstName, lastName, dateOfBirth, guardianName and guardianPhone are required',
      });
    }

    const info = db
      .prepare(
        `INSERT INTO children
           (first_name, last_name, date_of_birth, guardian_name, guardian_phone, classroom)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        firstName,
        lastName,
        dateOfBirth,
        guardianName,
        guardianPhone,
        classroom || 'Unassigned'
      );

    res.status(201).json({ id: info.lastInsertRowid });
  });

  app.delete('/api/children/:id', (req, res) => {
    const info = db.prepare('DELETE FROM children WHERE id = ?').run(req.params.id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'child not found' });
    }
    res.status(204).end();
  });

  app.post('/api/children/:id/checkin', (req, res) => {
    const child = db.prepare('SELECT id FROM children WHERE id = ?').get(req.params.id);
    if (!child) {
      return res.status(404).json({ error: 'child not found' });
    }
    const open = db
      .prepare('SELECT id FROM attendance WHERE child_id = ? AND check_out IS NULL')
      .get(req.params.id);
    if (open) {
      return res.status(409).json({ error: 'child is already checked in' });
    }
    const info = db
      .prepare('INSERT INTO attendance (child_id) VALUES (?)')
      .run(req.params.id);
    res.status(201).json({ id: info.lastInsertRowid });
  });

  app.post('/api/children/:id/checkout', (req, res) => {
    const info = db
      .prepare(
        `UPDATE attendance
         SET check_out = datetime('now')
         WHERE child_id = ? AND check_out IS NULL`
      )
      .run(req.params.id);
    if (info.changes === 0) {
      return res.status(409).json({ error: 'child is not currently checked in' });
    }
    res.json({ ok: true });
  });

  app.get('/api/attendance/today', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT a.id, a.child_id AS childId, c.first_name AS firstName,
                c.last_name AS lastName, a.check_in AS checkIn, a.check_out AS checkOut
         FROM attendance a
         JOIN children c ON c.id = a.child_id
         WHERE date(a.check_in) = date('now')
         ORDER BY a.check_in DESC`
      )
      .all();
    res.json(rows);
  });

  return app;
}
