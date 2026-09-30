#!/usr/bin/env bash
# Cloud Agent start step: bring up the local PostgreSQL cluster and ensure the
# application role/database exist. Idempotent and safe on every boot.
set -euo pipefail

PG_VERSION="$(ls /usr/lib/postgresql 2>/dev/null | sort -n | tail -1)"

# Start the default cluster if it is not already running.
sudo pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null || true

# Wait until Postgres is accepting connections.
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

# Create the app role and database if they do not exist yet.
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='childcare'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER childcare WITH PASSWORD 'childcare' CREATEDB;"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='childcare'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE childcare OWNER childcare;"
