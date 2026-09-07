#!/usr/bin/env bash
# Stop local datastores. Mirrors the detection in dev-up.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "${DEV_UP_FORCE_NATIVE:-0}" != "1" ] \
  && command -v docker >/dev/null 2>&1 \
  && docker compose version >/dev/null 2>&1 \
  && docker info >/dev/null 2>&1; then
  # stop the whole compose project (datastores + app services if `docker compose up` was used);
  # named volumes (pgdata/redisdata) are kept.
  docker compose down
  exit 0
fi

echo "==> Stopping native services"
sudo service redis-server stop >/dev/null 2>&1 || true
sudo service postgresql stop >/dev/null 2>&1 || true
echo "==> Stopped. (Data is preserved on disk.)"
