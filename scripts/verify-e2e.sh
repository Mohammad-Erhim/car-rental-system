#!/usr/bin/env bash
# verify:e2e — one API + apps/web (vite preview) + apps/site (standalone) stack, then the three
# viewport projects run in turn with a `db:reset` before each (the suite shares one dev DB and
# runs workers: 1 — a single all-projects pass starves the fleet by the last project).
#
#   E2E_ONLY="smoke discovery"   run just these spec files (still all three viewports)
#   E2E_PROJECTS="laptop"        run just these viewport projects
#   E2E_SKIP_SITE_BUILD=1        reuse the existing apps/site build (must already be API-fresh)
#
# The `apps/site` build MUST run with the API reachable — `generateStaticParams` and every
# data-backed route's server load hit `/api/v1/...` at build time; a build made API-down bakes
# soft-404s for `/[locale]/vehicles/*` and the customer specs then fail on console 404s. So the
# API comes up first and this script (not package.json) owns the site build.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node-v24.20.0-linux-x64/bin:$PATH"

API_PORT=3001
WEB_PORT=3100
SITE_PORT=3000
api_pid="" web_pid="" site_pid=""
cleanup() {
  for p in "$site_pid" "$web_pid" "$api_pid"; do [[ -n "$p" ]] && kill "$p" 2>/dev/null || true; done
}
trap cleanup EXIT

fuser -k "${API_PORT}/tcp" "${WEB_PORT}/tcp" "${SITE_PORT}/tcp" 2>/dev/null || true
sleep 1

echo "verify:e2e — starting API"
RATE_LIMIT_AUTH_MAX=2000 RATE_LIMIT_AUTH_WINDOW_SEC=60 \
  bash -c 'cd apps/api && node -r @swc-node/register src/main.ts' >/tmp/e2e-api.log 2>&1 &
api_pid=$!
for _ in $(seq 1 60); do curl -sf "http://localhost:${API_PORT}/health/ready" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "http://localhost:${API_PORT}/health/ready" >/dev/null || { echo "API did not become ready"; exit 1; }

if [[ -z "${E2E_SKIP_SITE_BUILD:-}" ]]; then
  echo "verify:e2e — db:reset + building apps/site against the running API"
  pnpm --filter @carrental/api db:reset >/dev/null
  API_UPSTREAM="http://localhost:${API_PORT}" pnpm --filter @carrental/site build
fi

echo "verify:e2e — starting apps/web (vite preview) + apps/site (standalone)"
pnpm --filter @carrental/web exec vite preview --port "${WEB_PORT}" --strictPort >/tmp/e2e-web.log 2>&1 &
web_pid=$!
API_UPSTREAM="http://localhost:${API_PORT}" WEB_UPSTREAM="http://localhost:${WEB_PORT}" \
  SITE_URL="http://localhost:${SITE_PORT}" PORT="${SITE_PORT}" \
  pnpm --filter @carrental/site start:standalone >/tmp/e2e-site.log 2>&1 &
site_pid=$!
for _ in $(seq 1 60); do curl -sf "http://localhost:${WEB_PORT}/ops/" >/dev/null 2>&1 && break; sleep 1; done
for _ in $(seq 1 60); do curl -sf "http://localhost:${SITE_PORT}/en" >/dev/null 2>&1 && break; sleep 1; done

status=0
for project in ${E2E_PROJECTS:-phone tablet laptop}; do
  echo "verify:e2e — db:reset + project=${project}"
  pnpm --filter @carrental/api db:reset >/dev/null
  E2E_REUSE_SERVER=1 pnpm --filter @carrental/e2e exec playwright test ${E2E_ONLY:-} \
    --project="${project}" || status=1
done
exit $status
