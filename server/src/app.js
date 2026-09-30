import express from 'express';
import cors from 'cors';

/**
 * Build the Express app around a given data store. Kept separate from the
 * server bootstrap so tests can inject an in-memory store.
 */
export function createApp(store) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.get('/api/children', (_req, res) => {
    res.json(store.listChildren());
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

    const id = store.createChild({
      firstName,
      lastName,
      dateOfBirth,
      guardianName,
      guardianPhone,
      classroom,
    });

    res.status(201).json({ id });
  });

  app.delete('/api/children/:id', (req, res) => {
    const removed = store.removeChild(Number(req.params.id));
    if (!removed) {
      return res.status(404).json({ error: 'child not found' });
    }
    res.status(204).end();
  });

  app.post('/api/children/:id/checkin', (req, res) => {
    const result = store.checkIn(Number(req.params.id));
    if (result.status === 'not_found') {
      return res.status(404).json({ error: 'child not found' });
    }
    if (result.status === 'already_in') {
      return res.status(409).json({ error: 'child is already checked in' });
    }
    res.status(201).json({ id: result.id });
  });

  app.post('/api/children/:id/checkout', (req, res) => {
    const closed = store.checkOut(Number(req.params.id));
    if (!closed) {
      return res.status(409).json({ error: 'child is not currently checked in' });
    }
    res.json({ ok: true });
  });

  app.get('/api/attendance/today', (_req, res) => {
    res.json(store.attendanceToday());
  });

  return app;
}
