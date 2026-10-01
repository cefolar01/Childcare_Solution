import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createAuthStore } from './auth/store.js';
import { mountAuthRoutes } from './auth/routes.js';
import { mountProfileRoutes } from './auth/profileRoutes.js';

/** Wrap an async route so rejected promises flow to Express error handling. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Build the Express app around a given data store. Kept separate from the
 * server bootstrap so tests can inject a store backed by any Postgres client.
 *
 * When `clientDist` points at a built client bundle, the app also serves the
 * web UI (with SPA fallback) so the whole app runs as a single process.
 */
export function createApp(store, clientDist, authStore) {
  const app = express();
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const auth = authStore || createAuthStore(store.db);
  // Expose for tests that need direct store access via app locals
  app.locals.authStore = auth;
  app.locals.store = store;

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  mountAuthRoutes(app, auth, wrap);
  mountProfileRoutes(app, auth, wrap);

  app.get(
    '/api/children',
    wrap(async (_req, res) => {
      res.json(await store.listChildren());
    })
  );

  app.post(
    '/api/children',
    wrap(async (req, res) => {
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

      const id = await store.createChild({
        firstName,
        lastName,
        dateOfBirth,
        guardianName,
        guardianPhone,
        classroom,
      });

      res.status(201).json({ id });
    })
  );

  app.delete(
    '/api/children/:id',
    wrap(async (req, res) => {
      const removed = await store.removeChild(Number(req.params.id));
      if (!removed) {
        return res.status(404).json({ error: 'child not found' });
      }
      res.status(204).end();
    })
  );

  app.post(
    '/api/children/:id/checkin',
    wrap(async (req, res) => {
      const result = await store.checkIn(Number(req.params.id));
      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'child not found' });
      }
      if (result.status === 'already_in') {
        return res.status(409).json({ error: 'child is already checked in' });
      }
      res.status(201).json({ id: result.id });
    })
  );

  app.post(
    '/api/children/:id/checkout',
    wrap(async (req, res) => {
      const closed = await store.checkOut(Number(req.params.id));
      if (!closed) {
        return res.status(409).json({ error: 'child is not currently checked in' });
      }
      res.json({ ok: true });
    })
  );

  app.get(
    '/api/attendance/today',
    wrap(async (_req, res) => {
      res.json(await store.attendanceToday());
    })
  );

  // Serve the built web UI when available (single-process / background mode).
  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  return app;
}
