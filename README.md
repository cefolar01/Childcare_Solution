# Childcare_Solution

A small full-stack childcare management app for tracking enrolled children,
their guardians, and daily attendance (check-in / check-out).

## Stack

- **server/** — Node.js + Express REST API backed by SQLite (`better-sqlite3`)
- **client/** — React + Vite + TypeScript single-page app
- npm workspaces tie the two together at the repo root

## Prerequisites

- Node.js >= 20 (developed against Node 22)

## Getting started

```bash
npm install          # installs both workspaces
npm run dev:server   # API on http://localhost:3001
npm run dev:client   # web app on http://localhost:5173
```

The Vite dev server proxies `/api/*` to the API, so open
<http://localhost:5173> and the roster loads with seeded demo data.

## Useful scripts

| Command | Description |
| --- | --- |
| `npm run dev:server` | Start the API in watch mode (port 3001) |
| `npm run dev:client` | Start the Vite dev server (port 5173) |
| `npm test` | Run the API test suite (`node --test`) |
| `npm run lint` | Type-check the client and syntax-check the server |
| `npm run build:client` | Production build of the web app |

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/children` | Roster with current presence |
| `POST` | `/api/children` | Enroll a child |
| `DELETE` | `/api/children/:id` | Remove a child |
| `POST` | `/api/children/:id/checkin` | Check a child in |
| `POST` | `/api/children/:id/checkout` | Check a child out |
| `GET` | `/api/attendance/today` | Today's attendance log |

## Data

SQLite database lives at `data/childcare.db` (git-ignored) and is seeded with
demo children on first run. Set `DB_PATH` or `PORT` to override defaults.

## Cloud Agent environment

`.cursor/environment.json` installs dependencies via `npm install` and starts
the `api` and `web` dev servers as persistent terminals.
