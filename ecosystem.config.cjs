// PM2 process definition for running the app in the background.
// Serves the API and the built web UI from a single Node process.
// Usage: `npm run bg:start` (build + start), `npm run bg:stop`, `npm run bg:logs`.
module.exports = {
  apps: [
    {
      name: 'childcare',
      script: 'server/src/index.js',
      cwd: __dirname,
      env: {
        PORT: 3001,
        // Set DATABASE_URL here (or in your shell) to use a real Postgres
        // server; leave unset to use the embedded PGlite database.
      },
    },
  ],
};
