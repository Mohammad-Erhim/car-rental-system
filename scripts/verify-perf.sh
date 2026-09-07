#!/usr/bin/env bash
# STAGE-007 verify:perf — boot the API against a freshly seeded dev DB, run the perf smoke,
# tear down. Indicative numbers only (see stages/STAGE-007-release-hardening/perf.md).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node-v24.20.0-linux-x64/bin:$PATH"

log=/tmp/carrental-perf-api.log
port=3001

cleanup() { [[ -n "${api_pid:-}" ]] && kill "$api_pid" 2>/dev/null || true; }
trap cleanup EXIT

fuser -k "${port}/tcp" 2>/dev/null || true
sleep 1

echo "verify:perf — seeding dev DB"
pnpm --filter @carrental/api db:reset >/dev/null

echo "verify:perf — starting API"
( cd apps/api && node -r @swc-node/register src/main.ts ) >"$log" 2>&1 &
api_pid=$!

for i in $(seq 1 40); do
  curl -sf "http://localhost:${port}/health/ready" >/dev/null 2>&1 && break
  sleep 1
done

node scripts/perf-smoke.mjs
