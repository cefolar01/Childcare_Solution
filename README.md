# Childcare_Solution

A small full-stack childcare management app for tracking enrolled children,
their guardians, and daily attendance (check-in / check-out).

## Stack

- **server/** — Node.js + Express REST API. PostgreSQL for storage, with two
  interchangeable drivers:
  - **embedded PGlite** (Postgres compiled to WebAssembly) by default — nothing
    to install, data persisted on disk
  - a real **PostgreSQL server** via the pure-JS `pg` driver when `DATABASE_URL`
    is set (Docker, a hosted database, or production)
- **client/** — React + Vite + TypeScript single-page app
- npm workspaces tie the two together at the repo root

No native modules are involved, so `npm install` needs no compiler on any OS.

## Prerequisites

- Node.js >= 20 (developed against Node 22)
- That's it for local dev — the embedded database needs nothing installed.

## Getting started (zero setup)

```bash
npm install   # installs both workspaces
npm run dev   # starts the API (:3001) and web app (:5173) together
```

Open <http://localhost:5173>. On first run the API creates its schema and seeds
demo children automatically. Data is stored in an embedded PostgreSQL database
under `data/pglite/` (git-ignored), so it persists across restarts.

Prefer separate terminals? Run `npm run dev:server` and `npm run dev:client`
individually instead.

## Using a real PostgreSQL server (optional)

Set `DATABASE_URL` and the app uses that server instead of the embedded DB.

With the bundled Docker Compose file:

```bash
npm run db:up   # starts PostgreSQL 16 in Docker on port 5432
DATABASE_URL="postgres://childcare:childcare@localhost:5432/childcare" npm run dev
```

Or point at any hosted Postgres (e.g. Neon, Supabase, RDS):

```bash
DATABASE_URL="postgres://user:pass@host:5432/dbname" npm run dev
```

On Windows PowerShell, set it first with
`$env:DATABASE_URL = "postgres://..."` and then run `npm run dev`.

## Useful scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start API + web together (one command) |
| `npm run dev:server` | Start the API in watch mode (port 3001) |
| `npm run dev:client` | Start the Vite dev server (port 5173) |
| `npm test` | Run the API test suite (PGlite, no DB server needed) |
| `npm run lint` | Type-check the client and syntax-check the server |
| `npm run build:client` | Production build of the web app |
| `npm run db:up` | Start PostgreSQL in Docker (for the `DATABASE_URL` path) |
| `npm run db:down` | Stop the database container |
| `npm run db:reset` | Drop the volume and start a fresh database |

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

The schema (`children`, `attendance`) is applied on startup and demo children
are seeded into an empty database. Configure storage with `DATABASE_URL`
(defaults to embedded PGlite at `data/pglite/`) and the API port with `PORT`.

## Cloud Agent environment

`.cursor/environment.json` installs dependencies via `npm install` and starts
the `api` and `web` dev servers as persistent terminals. It uses the embedded
database by default, so no database service is required.
