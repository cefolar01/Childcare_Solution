import pg from 'pg';

const { Pool } = pg;

export const DEFAULT_DATABASE_URL =
  'postgres://childcare:childcare@localhost:5432/childcare';

/** Create a pooled Postgres client from DATABASE_URL (or the local default). */
export function createPool(connectionString = process.env.DATABASE_URL) {
  return new Pool({
    connectionString: connectionString || DEFAULT_DATABASE_URL,
    max: 10,
  });
}

const SEED_CHILDREN = [
  ['Ava', 'Nguyen', '2021-04-12', 'Linh Nguyen', '555-0142', 'Sunflowers'],
  ['Mateo', 'Garcia', '2020-09-03', 'Sofia Garcia', '555-0188', 'Sunflowers'],
  ['Owen', 'Baker', '2022-01-27', 'James Baker', '555-0110', 'Ladybugs'],
];

/**
 * Create the schema if it does not exist. `db` is any client exposing an
 * async `query(text, params)` method (a pg Pool/Client or a PGlite instance).
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
