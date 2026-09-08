#!/usr/bin/env bash
# verify:seo — build + boot apps/site (with the API for SSR data), run the technical-SEO
# assertions in scripts/verify-seo.mjs, tear down. STAGE-011 / STAGE-013.
#
#   SEO_SKIP_BUILD=1   reuse an existing apps/site/.next
#   SEO_REUSE_SERVER=1  assume API :3001 + site :3000 are already running
set -euo pipefail
cd "$(dirname "$0")/.."

API_PORT=3001
SITE_PORT=3000
api_pid=""
site_pid=""
cleanup() {
  [[ -n "$site_pid" ]] && kill "$site_pid" 2>/dev/null || true
  [[ -n "$api_pid" ]] && kill "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT

if [[ "${SEO_REUSE_SERVER:-0}" != "1" ]]; then
  fuser -k "${API_PORT}/tcp" "${SITE_PORT}/tcp" 2>/dev/null || true
  sleep 1

  echo "verify:seo — building shared packages"
  pnpm build:packages >/dev/null

  # The API must be up *before* `apps/site` builds: `generateStaticParams` and every data-backed
  # route's server load() hit /api/v1/... at build time. A build made API-down bakes soft-404s
  # and the SEO assertions then fail (same rule as scripts/verify-e2e.sh).
  echo "verify:seo — seeding dev DB + starting API"
  pnpm --filter @carrental/api db:reset >/dev/null
  ( cd apps/api && node -r @swc-node/register src/main.ts ) >/tmp/carrental-seo-api.log 2>&1 &
  api_pid=$!
  for _ in $(seq 1 40); do
    curl -sf "http://localhost:${API_PORT}/health/ready" >/dev/null 2>&1 && break
    sleep 1
  done
  curl -sf "http://localhost:${API_PORT}/health/ready" >/dev/null || { echo "API did not become ready"; exit 1; }

  if [[ "${SEO_SKIP_BUILD:-0}" != "1" ]]; then
    echo "verify:seo — building apps/site against the running API"
    API_UPSTREAM="http://localhost:${API_PORT}" pnpm --filter @carrental/site build >/dev/null
  fi

  echo "verify:seo — starting apps/site (next start)"
  API_UPSTREAM="http://localhost:${API_PORT}" SITE_URL="http://localhost:${SITE_PORT}" \
    pnpm --filter @carrental/site start >/tmp/carrental-seo-site.log 2>&1 &
  site_pid=$!
  for _ in $(seq 1 40); do
    curl -sf "http://localhost:${SITE_PORT}/en" >/dev/null 2>&1 && break
    sleep 1
  done
fi

SEO_BASE_URL="http://localhost:${SITE_PORT}" node scripts/verify-seo.mjs
