#!/usr/bin/env bash
# Cloud Agent install step: provision PostgreSQL (the VM has no Docker) and
# install JS dependencies. Safe to run repeatedly.
set -euo pipefail

if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-client
fi

npm install
