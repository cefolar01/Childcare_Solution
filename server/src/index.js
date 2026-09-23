import { createApp } from './app.js';
import { createDatabase } from './db.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const DB_PATH = process.env.DB_PATH ?? 'data/childcare.db';

const db = createDatabase(DB_PATH);
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`Childcare API listening on http://localhost:${PORT}`);
});
