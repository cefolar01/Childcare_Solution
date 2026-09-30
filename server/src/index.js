import { createApp } from './app.js';
import { createPool, initDb } from './db.js';
import { createStore } from './store.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

async function main() {
  const pool = createPool();

  // Wait for the database to accept connections (it may still be starting).
  await waitForDatabase(pool);
  await initDb(pool);

  const store = createStore(pool);
  const app = createApp(store);

  app.listen(PORT, () => {
    console.log(`Childcare API listening on http://localhost:${PORT}`);
  });
}

async function waitForDatabase(pool, attempts = 30) {
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

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
