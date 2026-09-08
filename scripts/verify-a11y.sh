#!/usr/bin/env bash
# verify:a11y — axe-core (WCAG 2.1 A+AA) over the critical customer + /ops screens, laptop
# project. Same single-origin stack as verify:e2e (API :3001 + apps/web vite preview :3100 +
# apps/site standalone :3000), built with the API reachable, then `a11y.spec.ts` reuses it.
#
#   A11Y_SKIP_BUILD=1   reuse the existing apps/web + apps/site builds
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node-v24.20.0-linux-x64/bin:$PATH"

API_PORT=3001
WEB_PORT=3100
SITE_PORT=3000
api_pid="" web_pid="" site_pid=""
cleanup() {
  for p in "$site_pid" "$web_pid" "$api_pid"; do [[ -n "$p" ]] && kill "$p" 2>/dev/null || true; done
  sleep 1
  fuser -k "${API_PORT}/tcp" "${WEB_PORT}/tcp" "${SITE_PORT}/tcp" 2>/dev/null || true
}
trap cleanup EXIT

fuser -k "${API_PORT}/tcp" "${WEB_PORT}/tcp" "${SITE_PORT}/tcp" 2>/dev/null || true
sleep 1

echo "verify:a11y — build:packages"
pnpm build:packages >/dev/null

echo "verify:a11y — db:reset + start API"
pnpm --filter @carrental/api db:reset >/dev/null
RATE_LIMIT_AUTH_MAX=2000 RATE_LIMIT_AUTH_WINDOW_SEC=60 \
  bash -c 'cd apps/api && node -r @swc-node/register src/main.ts' >/tmp/a11y-api.log 2>&1 &
api_pid=$!
for _ in $(seq 1 60); do curl -sf "http://localhost:${API_PORT}/health/ready" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "http://localhost:${API_PORT}/health/ready" >/dev/null || { echo "API did not become ready"; exit 1; }

if [[ "${A11Y_SKIP_BUILD:-0}" != "1" ]]; then
  echo "verify:a11y — build apps/web + apps/site (API up)"
  pnpm --filter @carrental/web build >/dev/null
  API_UPSTREAM="http://localhost:${API_PORT}" pnpm --filter @carrental/site build >/dev/null
fi

echo "verify:a11y — start apps/web (vite preview :$WEB_PORT) + apps/site (standalone :$SITE_PORT)"
pnpm --filter @carrental/web exec vite preview --port "${WEB_PORT}" --strictPort >/tmp/a11y-web.log 2>&1 &
web_pid=$!
API_UPSTREAM="http://localhost:${API_PORT}" WEB_UPSTREAM="http://localhost:${WEB_PORT}" \
  SITE_URL="http://localhost:${SITE_PORT}" PORT="${SITE_PORT}" \
  pnpm --filter @carrental/site start:standalone >/tmp/a11y-site.log 2>&1 &
site_pid=$!
for _ in $(seq 1 60); do curl -sf "http://localhost:${WEB_PORT}/ops/" >/dev/null 2>&1 && break; sleep 1; done
for _ in $(seq 1 60); do curl -sf "http://localhost:${SITE_PORT}/en" >/dev/null 2>&1 && break; sleep 1; done

echo "verify:a11y — running a11y.spec.ts (laptop)"
E2E_REUSE_SERVER=1 pnpm --filter @carrental/e2e exec playwright test a11y.spec.ts --project=laptop
