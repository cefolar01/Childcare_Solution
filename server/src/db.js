import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create (or open) the SQLite database, apply the schema, and seed demo data
 * on first run. Pass ":memory:" for ephemeral databases (used by tests).
 */
export function createDatabase(dbPath) {
  const resolvedPath =
    dbPath === ':memory:'
      ? ':memory:'
      : resolve(__dirname, '..', '..', dbPath ?? 'data/childcare.db');

  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      guardian_name TEXT NOT NULL,
      guardian_phone TEXT NOT NULL,
      classroom TEXT NOT NULL DEFAULT 'Unassigned',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      check_in TEXT NOT NULL DEFAULT (datetime('now')),
      check_out TEXT
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS n FROM children').get().n;
  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO children
        (first_name, last_name, date_of_birth, guardian_name, guardian_phone, classroom)
      VALUES (@first_name, @last_name, @date_of_birth, @guardian_name, @guardian_phone, @classroom)
    `);
    const seed = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
    seed([
      {
        first_name: 'Ava',
        last_name: 'Nguyen',
        date_of_birth: '2021-04-12',
        guardian_name: 'Linh Nguyen',
        guardian_phone: '555-0142',
        classroom: 'Sunflowers',
      },
      {
        first_name: 'Mateo',
        last_name: 'Garcia',
        date_of_birth: '2020-09-03',
        guardian_name: 'Sofia Garcia',
        guardian_phone: '555-0188',
        classroom: 'Sunflowers',
      },
      {
        first_name: 'Owen',
        last_name: 'Baker',
        date_of_birth: '2022-01-27',
        guardian_name: 'James Baker',
        guardian_phone: '555-0110',
        classroom: 'Ladybugs',
      },
    ]);
  }

  return db;
}
