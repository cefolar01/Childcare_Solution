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

## Running in the background (no terminal window)

To keep the app running after you close the terminal, use the bundled
[PM2](https://pm2.keymetrics.io/) process manager. This builds the web UI and
serves it together with the API from a single background process on one port.

```bash
npm run bg:start    # build + start in the background (http://localhost:3001)
npm run bg:status   # show process status
npm run bg:logs     # tail logs
npm run bg:stop     # stop it
npm run bg:restart  # rebuild + restart
npm run bg:delete   # remove it from PM2
```

Open <http://localhost:3001> — both the UI and the API are served there. The
process is managed by the PM2 daemon, so it keeps running when the terminal
closes. To also start it automatically on machine boot, run `pm2 startup` and
follow the printed instructions, then `pm2 save`.

Use `npm run dev` instead while actively developing (hot reload, API on :3001
and Vite on :5173). Use `npm run bg:*` when you just want it running.

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
| `npm run bg:start` | Build + run in the background via PM2 (port 3001) |
| `npm run bg:stop` / `bg:logs` / `bg:status` | Manage the background process |
| `npm run build` | Build the web UI for the single-process/background mode |
| `npm start` | Run the built app as one process (API + UI on :3001) |
| `npm test` | Run the API test suite (PGlite, no DB server needed) |
| `npm run lint` | Type-check the client and syntax-check the server |
| `npm run build:client` | Production build of the web app |
| `npm run db:up` | Start PostgreSQL in Docker (for the `DATABASE_URL` path) |
| `npm run db:down` | Stop the database container |
| `npm run db:reset` | Drop the volume and start a fresh database |

## Applicant authentication (WP-CC-AUTH-001 / 002 / 003)

Portal applicants can **self-register** (email as username), enroll **TOTP** 2FA,
sign in (password → TOTP → optional **90-day force password reset**), and land on
**their demographic profile**.

### Auth secrets (do not commit)

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Derives encryption for TOTP seeds and SSN at rest (min 16 chars). **Required in production.** Dev falls back to a local placeholder — set a real secret before any shared deploy. |

Never put plaintext passwords, TOTP seeds, SSN values, or `AUTH_SECRET` in git,
fixtures committed as secrets, Slack, or email. Tests use synthetic emails such as
`applicant.demo.001@example.test` and synthetic SSN patterns (e.g. `000-00-0001`).

### Password policy

- Min 12 characters; upper, lower, digit, and special character required.
- Passwords **force-reset every 90 days** at login (Rich-confirmed).
- Session cookie `cc_session` is httpOnly. Interim Dev session TTL is **8 hours absolute**; idle-timeout preference remains an open question (not invented).

### Applicant UI routes

| Path | Purpose |
| --- | --- |
| `/register` | Self-register + TOTP enroll |
| `/login` | Sign in → 2FA → (force reset if due) → profile |
| `/profile` | Own demographic profile (post-login land) |
| `/roster` | Existing staff roster scaffold (dev convenience) |

### Auth / profile API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Start registration |
| `GET` | `/api/auth/2fa/setup` | TOTP otpauth URI (enrollment token) |
| `POST` | `/api/auth/2fa/enroll` | Verify TOTP; complete registration |
| `POST` | `/api/auth/login` | Email + password → 2FA challenge |
| `POST` | `/api/auth/2fa/verify-login` | Complete 2FA or require force reset |
| `POST` | `/api/auth/password/force-reset` | 90-day reset then session |
| `POST` | `/api/auth/logout` | Revoke session |
| `GET` | `/api/auth/me` | Current applicant |
| `GET` | `/api/profile` | Own demographics (SSN masked) |
| `PUT` | `/api/profile` | Update demographics |
| `GET` | `/api/profile/:id` | Own id only; others → 403 |

Household member / child listing on profile is **deferred** (open question on WP-CC-AUTH-003).

## API overview (roster)

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

The schema (`children`, `attendance`, `applicants`, auth/profile/audit tables) is
applied on startup and demo children are seeded into an empty database. Configure
storage with `DATABASE_URL` (defaults to embedded PGlite at `data/pglite/`) and
the API port with `PORT`.

## Cloud Agent environment

`.cursor/environment.json` installs dependencies via `npm install` and starts
the `api` and `web` dev servers as persistent terminals. It uses the embedded
database by default, so no database service is required.
