# Childcare_Solution

A small full-stack childcare management app for tracking enrolled children,
their guardians, and daily attendance (check-in / check-out).

## Stack

- **server/** — Node.js + Express REST API backed by **PostgreSQL** via the
  pure-JS `pg` driver (no native modules, so `npm install` needs no compiler)
- **client/** — React + Vite + TypeScript single-page app
- Tests run against **PGlite** (Postgres compiled to WebAssembly), so the test
  suite needs no database server
- npm workspaces tie the two together at the repo root

## Prerequisites

- Node.js >= 20 (developed against Node 22)
- A PostgreSQL database. The easiest path is Docker (Docker Desktop on
  macOS/Windows) and the bundled `docker-compose.yml`; alternatively point the
  app at any Postgres instance via `DATABASE_URL`.

## Getting started

```bash
npm install     # installs both workspaces
npm run db:up   # starts PostgreSQL in Docker (port 5432)
npm run dev     # starts the API (:3001) and web app (:5173) together
```

Prefer separate terminals? Run `npm run dev:server` and `npm run dev:client`
individually instead.

The API creates its schema and seeds demo children automatically on startup.
The Vite dev server proxies `/api/*` to the API, so open
<http://localhost:5173> and the roster loads with seeded demo data.

Not using Docker? Start your own Postgres and set `DATABASE_URL`, e.g.:

```bash
export DATABASE_URL="postgres://user:pass@localhost:5432/childcare"
npm run dev
```

The default when `DATABASE_URL` is unset is
`postgres://childcare:childcare@localhost:5432/childcare`, which matches
`docker-compose.yml`.

## Useful scripts

| Command | Description |
| --- | --- |
| `npm run db:up` | Start PostgreSQL in Docker |
| `npm run db:down` | Stop the database container |
| `npm run db:reset` | Drop the volume and start a fresh database |
| `npm run dev` | Start API + web together (one command) |
| `npm run dev:server` | Start the API in watch mode (port 3001) |
| `npm run dev:client` | Start the Vite dev server (port 5173) |
| `npm test` | Run the API test suite on PGlite (no DB server needed) |
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

Data lives in PostgreSQL. On startup the API applies the schema
(`children`, `attendance`) if needed and seeds demo children on an empty
database. Configure the connection with `DATABASE_URL` and the API port with
`PORT`. The Docker volume `childcare_pgdata` persists data between runs; use
`npm run db:reset` to start clean.

## Cloud Agent environment

`.cursor/environment.json` provisions a local PostgreSQL server, installs npm
dependencies, starts the database on boot, and runs the `api` and `web` dev
servers as persistent terminals.
