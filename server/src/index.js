import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createDatabase, initDb } from './db.js';
import { createStore } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const CLIENT_DIST = resolve(__dirname, '..', '..', 'client', 'dist');

async function main() {
  const { db, driver } = await createDatabase();
  console.log(`Using database: ${driver}`);

  await initDb(db);

  const app = createApp(createStore(db), CLIENT_DIST);
  const server = app.listen(PORT, () => {
    console.log(`Childcare API listening on http://localhost:${PORT}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n✖ Port ${PORT} is already in use — the app can't start.`);
      console.error('  Stop the other instance (e.g. "npm run bg:stop" or Ctrl+C in the');
      console.error(`  other terminal), or start on another port: PORT=3002 npm run dev\n`);
      process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
