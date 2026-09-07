#!/usr/bin/env bash
# Collect a debugging evidence bundle: logs, health, metrics, last e2e report.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="var/evidence/${STAMP}"
mkdir -p "$OUT"

curl -sf http://localhost:3001/health/ready   -o "$OUT/health-ready.json"   || echo "health/ready unavailable" > "$OUT/health-ready.json"
curl -sf http://localhost:3001/health/version -o "$OUT/health-version.json" || true
curl -sf http://localhost:3001/metrics        -o "$OUT/metrics.txt"         || true
[ -d var/log ] && cp -r var/log "$OUT/log" || true
[ -d e2e/playwright-report ] && cp -r e2e/playwright-report "$OUT/playwright-report" || true
[ -d e2e/test-results ] && cp -r e2e/test-results "$OUT/e2e-test-results" || true

( cd var/evidence && zip -qr "../../evidence-bundle-${STAMP}.zip" "${STAMP}" ) 2>/dev/null || true
echo "Evidence bundle: $OUT  (zip: evidence-bundle-${STAMP}.zip if zip installed)"
