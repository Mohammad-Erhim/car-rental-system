#!/usr/bin/env bash
# STAGE-013 system-wide QA matrix. Brings up one API (:3001) + apps/site standalone (:3000) +
# apps/web /ops (vite preview :4000, base=/ops/), then runs e2e/tests/qa-matrix.spec.ts across
# the three viewport projects. Screenshots land in
# stages/STAGE-013-system-qa/screenshots/{site,ops}/.
#
#   QA_SKIP_BUILD=1   reuse the existing apps/web + apps/site builds
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node-v24.20.0-linux-x64/bin:$PATH"

API_PORT=3001
SITE_PORT=3000
WEB_PORT=4000
api_pid="" site_pid="" web_pid=""
cleanup() {
  for p in "$site_pid" "$web_pid" "$api_pid"; do [[ -n "$p" ]] && kill "$p" 2>/dev/null || true; done
}
trap cleanup EXIT

redis-cli ping >/dev/null 2>&1 || sudo systemctl start redis-server >/dev/null 2>&1 || true
fuser -k "${API_PORT}/tcp" "${SITE_PORT}/tcp" "${WEB_PORT}/tcp" 2>/dev/null || true
sleep 1

echo "qa-matrix — build:packages"
pnpm build:packages >/dev/null

echo "qa-matrix — db:reset + start API"
pnpm --filter @carrental/api db:reset >/dev/null
RATE_LIMIT_AUTH_MAX=2000 RATE_LIMIT_AUTH_WINDOW_SEC=60 \
  bash -c 'cd apps/api && node -r @swc-node/register src/main.ts' >/tmp/qa-api.log 2>&1 &
api_pid=$!
for _ in $(seq 1 60); do curl -sf "http://localhost:${API_PORT}/health/ready" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "http://localhost:${API_PORT}/health/ready" >/dev/null || { echo "API did not become ready"; exit 1; }

if [[ "${QA_SKIP_BUILD:-0}" != "1" ]]; then
  echo "qa-matrix — build apps/web + apps/site (API up)"
  pnpm --filter @carrental/web build >/dev/null
  API_UPSTREAM="http://localhost:${API_PORT}" pnpm --filter @carrental/site build >/dev/null
fi

echo "qa-matrix — start apps/site (standalone :$SITE_PORT) + apps/web (vite preview :$WEB_PORT)"
API_UPSTREAM="http://localhost:${API_PORT}" SITE_URL="http://localhost:${SITE_PORT}" PORT="${SITE_PORT}" \
  pnpm --filter @carrental/site start:standalone >/tmp/qa-site.log 2>&1 &
site_pid=$!
pnpm --filter @carrental/web exec vite preview --port "${WEB_PORT}" --strictPort >/tmp/qa-web.log 2>&1 &
web_pid=$!
for _ in $(seq 1 60); do curl -sf "http://localhost:${SITE_PORT}/en" >/dev/null 2>&1 && break; sleep 1; done
for _ in $(seq 1 60); do curl -sf "http://localhost:${WEB_PORT}/ops/" >/dev/null 2>&1 && break; sleep 1; done

echo "qa-matrix — running the matrix"
# `_helpers.ts` `shot()` defaults to the STAGE-000 evidence dir; point it at this stage's.
QA_REUSE_SERVER=1 QA_API_URL="http://localhost:${API_PORT}" \
  QA_SITE_URL="http://localhost:${SITE_PORT}" QA_WEB_URL="http://localhost:${WEB_PORT}" \
  E2E_SCREENSHOT_DIR="$PWD/docs/ai-delivery/04-implementation/stages/STAGE-013-system-qa/screenshots" \
  pnpm --filter @carrental/e2e exec playwright test --config playwright.qa.config.ts
