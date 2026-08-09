#!/usr/bin/env bash
# Start the connector API (doc 07) on :3333.
# The API itself only needs fastapi/uvicorn/pydantic; the .venv that runs the
# scripts (kokoro/mflux) is invoked per-job as a subprocess (api/tasks.py).
set -euo pipefail
cd "$(dirname "$0")"

# Load DATABASE_URL (and friends) from a local .env if present, so the job store points
# at the same Neon Postgres the web app uses. Without it, falls back to sqlite.
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

PY="${PYTHON:-python3}"
if [ ! -d ".venv-api" ]; then
  echo "[run_api] creating .venv-api and installing connector deps…"
  "$PY" -m venv .venv-api
  .venv-api/bin/pip install --upgrade pip >/dev/null
  .venv-api/bin/pip install -r requirements-api.txt
fi

exec .venv-api/bin/uvicorn api.main:app --host 0.0.0.0 --port 3333 "$@"
