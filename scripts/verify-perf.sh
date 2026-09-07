#!/usr/bin/env bash
# verify:perf — API perf smoke (STAGE-007) + apps/site first-load budget (STAGE-011/013).
# Boots the API against a freshly seeded dev DB; if an apps/site production build is present
# (or PERF_BUILD_SITE=1) it also serves it and checks the JS/HTML/CLS budgets. Indicative
# numbers only (see stages/STAGE-007-release-hardening/perf.md).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node-v24.20.0-linux-x64/bin:$PATH"

api_log=/tmp/carrental-perf-api.log
site_log=/tmp/carrental-perf-site.log
api_port=3001
site_port=3000
api_pid=""
site_pid=""

cleanup() {
  [[ -n "$site_pid" ]] && kill "$site_pid" 2>/dev/null || true
  [[ -n "$api_pid" ]] && kill "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT

fuser -k "${api_port}/tcp" "${site_port}/tcp" 2>/dev/null || true
sleep 1

echo "verify:perf — seeding dev DB"
pnpm --filter @carrental/api db:reset >/dev/null

echo "verify:perf — starting API"
( cd apps/api && node -r @swc-node/register src/main.ts ) >"$api_log" 2>&1 &
api_pid=$!
for _ in $(seq 1 40); do
  curl -sf "http://localhost:${api_port}/health/ready" >/dev/null 2>&1 && break
  sleep 1
done

node scripts/perf-smoke.mjs

# --- apps/site first-load budget ---------------------------------------------------------------
if [[ "${PERF_BUILD_SITE:-0}" == "1" ]]; then
  echo "verify:perf — building apps/site"
  pnpm build:packages >/dev/null
  API_UPSTREAM="http://localhost:${api_port}" pnpm --filter @carrental/site build >/dev/null
fi

if [[ -f apps/site/.next/standalone/apps/site/server.js ]]; then
  echo "verify:perf — starting apps/site (standalone) for the first-load budget"
  API_UPSTREAM="http://localhost:${api_port}" SITE_URL="http://localhost:${site_port}" PORT="${site_port}" \
    pnpm --filter @carrental/site start:standalone >"$site_log" 2>&1 &
  site_pid=$!
  for _ in $(seq 1 40); do
    curl -sf "http://localhost:${site_port}/en" >/dev/null 2>&1 && break
    sleep 1
  done
  SITE_PERF_BASE="http://localhost:${site_port}" node scripts/perf-site.mjs
else
  echo "verify:perf — no apps/site build; skipping the site budget (set PERF_BUILD_SITE=1)"
fi
