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

  // Applicant auth (WP-CC-AUTH-001 / 002 / 003)
  await db.query(`
    CREATE TABLE IF NOT EXISTS applicants (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      totp_secret_enc TEXT,
      totp_enrolled_at TIMESTAMPTZ,
      registration_complete BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS auth_challenges (
      id TEXT PRIMARY KEY,
      applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS applicant_profiles (
      applicant_id INTEGER PRIMARY KEY REFERENCES applicants(id) ON DELETE CASCADE,
      first_name TEXT,
      last_name TEXT,
      mailing_address1 TEXT,
      mailing_address2 TEXT,
      mailing_city TEXT,
      mailing_state TEXT,
      mailing_zip TEXT,
      physical_address1 TEXT,
      physical_address2 TEXT,
      physical_city TEXT,
      physical_state TEXT,
      physical_zip TEXT,
      ssn_enc TEXT,
      date_of_birth TEXT,
      updated_at TIMESTAMPTZ
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id SERIAL PRIMARY KEY,
      applicant_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
