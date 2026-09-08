#!/usr/bin/env bash
# Car Rental System — database restore (SRS §17.7 release gate).
# Verifies the sha256, resets the target's public schema, pg_restore, prints key row counts.
# REFUSES a target whose name does not end in _dev, _test, or _restore unless FORCE=1.
#
#   bash scripts/restore-db.sh <dump-file> [TARGET_DATABASE_URL]
set -euo pipefail
cd "$(dirname "$0")/.."

dump="${1:?usage: restore-db.sh <dump-file> [TARGET_DATABASE_URL]}"
URL="${2:-${TARGET_DATABASE_URL:-${DATABASE_URL:-}}}"
if [[ -z "$URL" && -f .env ]]; then
  URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- || true)"
fi
[[ -f "$dump" ]] || { echo "restore: no such dump: $dump"; exit 2; }
[[ -n "$URL" ]] || { echo "restore: no target DATABASE_URL"; exit 2; }

db_name="$(printf '%s' "$URL" | sed -E 's#.*/([^/?]+).*#\1#')"
if [[ ! "$db_name" =~ (_dev|_test|_restore)$ && "${FORCE:-0}" != "1" ]]; then
  echo "restore: refusing to overwrite \"$db_name\" (name must end _dev/_test/_restore, or FORCE=1)"
  exit 3
fi

if [[ -f "$dump.sha256" ]]; then
  want="$(cat "$dump.sha256")"
  got="$(sha256sum "$dump" | awk '{print $1}')"
  [[ "$want" == "$got" ]] || { echo "restore: sha256 MISMATCH ($got != $want)"; exit 4; }
  echo "restore: sha256 ok"
fi

echo "restore: resetting schema on ${db_name}"
psql "$URL" -v ON_ERROR_STOP=1 -q -c \
  'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;'

echo "restore: pg_restore ${dump}"
pg_restore --dbname="$URL" --no-owner --no-privileges --exit-on-error "$dump"

echo "restore: row counts —"
psql "$URL" -q -A -F' ' -t -c "
  select 'account', count(*) from account
  union all select 'reservation', count(*) from reservation
  union all select 'rental', count(*) from rental
  union all select 'payment_intent', count(*) from payment_intent
  union all select 'config_version', count(*) from config_version
  union all select 'audit_event', count(*) from audit_event
  order by 1;" | sed 's/^/  /'
echo "restore: ok  (run 'node apps/api/dist/database/migrate.js' if the dump predates HEAD)"
