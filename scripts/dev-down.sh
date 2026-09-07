#!/usr/bin/env bash
# Stop local dependencies.
set -euo pipefail

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose down
  exit 0
fi

echo "==> Stopping native services"
sudo service redis-server stop >/dev/null 2>&1 || true
sudo service postgresql stop >/dev/null 2>&1 || true
echo "==> Stopped. (Data is preserved on disk.)"
