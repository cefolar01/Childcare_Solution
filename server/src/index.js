import { createApp } from './app.js';
import { createStore } from './store.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const DB_PATH = process.env.DB_PATH ?? 'data/childcare.json';

const store = createStore(DB_PATH);
const app = createApp(store);

app.listen(PORT, () => {
  console.log(`Childcare API listening on http://localhost:${PORT}`);
});
