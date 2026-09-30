import { createApp } from './app.js';
import { createDatabase, initDb } from './db.js';
import { createStore } from './store.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

async function main() {
  const { db, driver } = await createDatabase();
  console.log(`Using database: ${driver}`);

  await initDb(db);

  const app = createApp(createStore(db));
  app.listen(PORT, () => {
    console.log(`Childcare API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
