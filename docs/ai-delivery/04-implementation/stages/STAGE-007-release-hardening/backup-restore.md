# STAGE-007 — backup / restore rehearsal

SRS §17.7 release gate · SRS-SEC-012 (protected backups). Rehearsed 2026-09-07 against the
native PostgreSQL 16.15 on this host.

## Scripts

- `scripts/backup-db.sh [DATABASE_URL]` — `pg_dump -Fc --no-owner --no-privileges` of the
  target to `var/backups/<db>-<utcstamp>.dump`, plus a `<dump>.sha256` sidecar.
- `scripts/restore-db.sh <dump> [TARGET_URL]` — verifies the sha256, `DROP SCHEMA public
CASCADE; CREATE SCHEMA public` + drops `drizzle`, `pg_restore --exit-on-error`, prints key
  row counts. Refuses a target not ending in `_dev` / `_test` / `_restore` unless `FORCE=1`.

Redis is **not** backed up — it holds cache entries, rate-limit windows, and queue state, all
of which the app re-derives (the transactional `outbox` is the durable queue source).

## Rehearsal run

```
$ bash scripts/backup-db.sh
backup: pg_dump carrental_dev -> var/backups/carrental_dev-20260907T093138Z.dump
backup: ok  var/backups/carrental_dev-20260907T093138Z.dump  (159620 bytes)  sha256=91e63d24…68db

$ createdb carrental_restore
$ bash scripts/restore-db.sh var/backups/carrental_dev-20260907T093138Z.dump <…/carrental_restore>
restore: sha256 ok
restore: resetting schema on carrental_restore
restore: pg_restore var/backups/carrental_dev-20260907T093138Z.dump
restore: row counts —
  account 6
  audit_event 18
  config_version 0
  payment_intent 0
  rental 0
  reservation 0
restore: ok

# key counts identical between source (carrental_dev) and carrental_restore:  account=6

$ DATABASE_URL=<…/carrental_restore> node -r @swc-node/register apps/api/src/main.ts
$ curl -s localhost:3001/health/ready
{"status":"ok","checks":{
  "db":{"status":"ok"},
  "migrations":{"status":"ok","detail":"7 migrations applied"},
  "redis":{"status":"ok"},
  "lookups":{"status":"ok","detail":"34 lookup types verified"}}}
```

## Result

**PASS.** A `pg_dump` archive restores into an empty database with matching row counts, and the
API boots against the restored database with `/health/ready = ok` (schema, migration ledger,
and required lookup sets all intact). The dump was current with the migration head (`0006`), so
no follow-up `migrate` was needed; the restore script prints a reminder for the case where a
backup predates HEAD.

## Production notes

- Take a backup before any deploy that adds a migration (migrations are forward-only; §5 of the
  runbook covers the rollback path).
- Ship archives off-host; encrypt at rest (SRS-SEC-012).
- Nightly cron: `bash scripts/backup-db.sh` + retention prune of `var/backups/`.
