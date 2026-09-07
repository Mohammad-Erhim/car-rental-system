#!/usr/bin/env bash
# Start local dependencies for the Car Rental System.
#
# Preferred path: Docker (`docker compose up -d`).
# Fallback (this host has no container runtime — DEC-013): native services.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_USER="${PG_USER:-carrental}"
PG_PASSWORD="${PG_PASSWORD:-carrental_dev_pw}"
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
DEV_DB="${DEV_DB:-carrental_dev}"
TEST_DB="${TEST_DB:-carrental_test}"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "==> docker compose detected — starting containers"
  docker compose up -d postgres redis
  exit 0
fi

echo "==> No Docker. Using native services (postgresql-16, redis-server)."

if ! command -v pg_isready >/dev/null 2>&1; then
  echo "!! PostgreSQL client not found. Install with:"
  echo "   sudo apt-get install -y postgresql-16 postgresql-client-16 redis-server"
  exit 1
fi

echo "--> starting postgresql"
sudo service postgresql start >/dev/null 2>&1 || true
echo "--> starting redis"
sudo service redis-server start >/dev/null 2>&1 || true

# wait for postgres
for i in $(seq 1 30); do
  if pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then break; fi
  sleep 1
done
pg_isready -h "$PG_HOST" -p "$PG_PORT"

# ensure role + databases exist (idempotent)
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL >/dev/null
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${PG_USER}') THEN
    CREATE ROLE ${PG_USER} WITH LOGIN PASSWORD '${PG_PASSWORD}' CREATEDB;
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DEV_DB} OWNER ${PG_USER}'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DEV_DB}')\gexec
SELECT 'CREATE DATABASE ${TEST_DB} OWNER ${PG_USER}'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${TEST_DB}')\gexec
SQL

# redis check
if command -v redis-cli >/dev/null 2>&1; then
  redis-cli ping >/dev/null 2>&1 && echo "--> redis: PONG"
fi

echo "==> Dependencies ready:"
echo "    PostgreSQL  ${PG_HOST}:${PG_PORT}  (dbs: ${DEV_DB}, ${TEST_DB}; user: ${PG_USER})"
echo "    Redis       127.0.0.1:6379"
echo ""
echo "    Next: cp .env.example .env  (set DATABASE_URL password to '${PG_PASSWORD}')"
echo "          pnpm db:migrate && pnpm db:seed"
