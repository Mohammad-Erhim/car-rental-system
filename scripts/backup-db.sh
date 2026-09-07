#!/usr/bin/env bash
# Car Rental System — database backup (SRS §17.7 release gate, SRS-SEC-012).
# Custom-format pg_dump of DATABASE_URL to var/backups/, with a sha256 sidecar.
#
#   bash scripts/backup-db.sh [DATABASE_URL]
#
# DATABASE_URL may be passed as $1 or the env var; falls back to the .env value.
set -euo pipefail
cd "$(dirname "$0")/.."

URL="${1:-${DATABASE_URL:-}}"
if [[ -z "$URL" && -f .env ]]; then
  URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- || true)"
fi
[[ -n "$URL" ]] || { echo "backup: no DATABASE_URL (arg, env, or .env)"; exit 2; }

db_name="$(printf '%s' "$URL" | sed -E 's#.*/([^/?]+).*#\1#')"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out_dir="var/backups"
mkdir -p "$out_dir"
out="$out_dir/${db_name}-${ts}.dump"

echo "backup: pg_dump ${db_name} -> ${out}"
pg_dump --dbname="$URL" --format=custom --no-owner --no-privileges --file="$out"
sha256sum "$out" | awk '{print $1}' > "$out.sha256"

bytes="$(stat -c%s "$out")"
echo "backup: ok  ${out}  (${bytes} bytes)  sha256=$(cat "$out.sha256")"
