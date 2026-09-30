import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const SEED_CHILDREN = [
  ['Ava', 'Nguyen', '2021-04-12', 'Linh Nguyen', '555-0142', 'Sunflowers'],
  ['Mateo', 'Garcia', '2020-09-03', 'Sofia Garcia', '555-0188', 'Sunflowers'],
  ['Owen', 'Baker', '2022-01-27', 'James Baker', '555-0110', 'Ladybugs'],
];

/**
 * Create a database client.
 *
 * - If `DATABASE_URL` is set, connect to that PostgreSQL server via the pure-JS
 *   `pg` driver (use this for Docker, a hosted database, or production).
 * - Otherwise fall back to an embedded PGlite database (real Postgres compiled
 *   to WebAssembly) persisted on disk, so local dev needs nothing installed.
 *
 * Both clients expose an async `query(text, params)` method, so the rest of the
 * app is identical regardless of which one is used.
 */
export async function createDatabase() {
  const url = process.env.DATABASE_URL;

  if (url) {
    const pool = new Pool({ connectionString: url, max: 10 });
    await waitForPostgres(pool);
    return {
      db: pool,
      driver: `PostgreSQL server (${safeHost(url)})`,
      close: () => pool.end(),
    };
  }

  const dataDir =
    process.env.PGLITE_DIR || resolve(__dirname, '..', '..', 'data', 'pglite');
  mkdirSync(dataDir, { recursive: true });
  const db = new PGlite(dataDir);
  await db.waitReady;
  return {
    db,
    driver: `embedded PGlite (${dataDir})`,
    close: () => db.close(),
  };
}

/** Retry until the Postgres server accepts connections (it may be starting). */
async function waitForPostgres(pool, attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`Waiting for database… (${i}/${attempts})`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/** Host:port of a connection string, without credentials, for safe logging. */
function safeHost(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}`;
  } catch {
    return 'configured server';
  }
}

/**
 * Create the schema if it does not exist. `db` is any client exposing an async
 * `query(text, params)` method (a pg Pool/Client or a PGlite instance).
 */
export async function migrate(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS children (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      guardian_name TEXT NOT NULL,
      guardian_phone TEXT NOT NULL,
      classroom TEXT NOT NULL DEFAULT 'Unassigned',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      check_in TIMESTAMPTZ NOT NULL DEFAULT now(),
      check_out TIMESTAMPTZ
    );
  `);
}

/** Insert demo children on first run (no-op if any children already exist). */
export async function seed(db) {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM children');
  if (rows[0].n > 0) return;
  for (const c of SEED_CHILDREN) {
    await db.query(
      `INSERT INTO children
         (first_name, last_name, date_of_birth, guardian_name, guardian_phone, classroom)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      c
    );
  }
}

/** Convenience: apply schema then seed. */
export async function initDb(db) {
  await migrate(db);
  await seed(db);
}
