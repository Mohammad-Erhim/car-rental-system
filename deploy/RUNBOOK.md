# Car Rental System — Operations Runbook

Covers bootstrap, deploy, health, rollback, backup/restore, and common incidents for the
API + worker + web stack. Target: a single host or a small orchestrator. Postgres 16 and
Redis 7 are dependencies; in production they are managed services, not containers.

---

## 0. Components

| Component | Process                    | Port | Notes                                              |
| --------- | -------------------------- | ---- | -------------------------------------------------- |
| api       | `node dist/main.js`        | 3001 | REST boundary (`/api/v1`), `/health/*`, `/metrics` |
| worker    | `node dist/worker.js`      | —    | outbox drain, housekeeping, `markOverdue`, DLQ     |
| web       | nginx serving the Vite SPA | 8080 | proxies `/api` + `/health` to `api`                |
| postgres  | PostgreSQL 16              | 5432 | single source of truth                             |
| redis     | Redis 7                    | 6379 | cache + rate-limit counters + queues (rebuildable) |

Money is integer minor units everywhere. Redis holds no source-of-truth state — losing it
degrades caching and rate-limiting only.

---

## 1. Configuration

Copy `.env.example` → `.env` and fill every `REPLACE_ME`. Generate secrets:

```
openssl rand -base64 48   # JWT_ACCESS_SECRET, PASSWORD_PEPPER, COOKIE_SECRET, *_WEBHOOK
```

Required in every environment: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`,
`PASSWORD_PEPPER`, `COOKIE_SECRET`, `CORS_ALLOWED_ORIGINS` (exact web origin(s), comma-sep).
The API validates the whole environment on boot and **exits non-zero** on anything missing or
malformed — check the first lines of the api log if it will not start.

TLS terminates in front of nginx (a load balancer or another proxy). Never expose Postgres,
Redis, or `/metrics` to the internet.

**Stripe webhook** (live card payments). In the Stripe dashboard add an endpoint
`https://<your host>/api/v1/webhooks/stripe` and subscribe it to these events — one Stripe is never
asked to send cannot be handled:

- `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`,
  `charge.refunded` — Stripe's record is compared with the ledger; a difference opens a
  reconciliation exception.
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.funds_withdrawn`,
  `charge.dispute.funds_reinstated`, `charge.dispute.closed` — a chargeback reaches Finance as a
  "Card dispute" exception with its reason, status and evidence deadline (DEC-039).

The endpoint's signing secret is entered in the ops console (Integrations → Payment provider) and
stored encrypted; a wrong one shows as 400s on every delivery.

---

> **Compose files** (repo root — run every `docker compose` command from there so the
> repo-root `.env` is picked up for `${VAR}` interpolation):
> `compose.prod.yaml` = production-shaped stack · `compose.yaml` = local development stack.
> BuildKit is required — `apt-get install docker-buildx` (or the Docker `docker-buildx-plugin`)
> if `docker build` reports the buildx component missing.

## 2. Bootstrap (first deploy)

```
cp .env.example .env   # set real JWT_ACCESS_SECRET / PASSWORD_PEPPER / COOKIE_SECRET (openssl rand -base64 48)
GIT_SHA=$(git rev-parse HEAD) BUILD_TIME=$(date -u +%FT%TZ) \
  docker compose -f compose.prod.yaml build
docker compose -f compose.prod.yaml up -d          # migrate + seed:system run automatically, then api/worker/web
curl -fsS localhost:3001/health/ready              # -> {"status":"ok", ...}
```

The `migrate` service is a one-shot that runs on every `up`: it applies
`apps/api/src/database/migrations/*` empty→current and seeds the system catalogues only
(locales, lookups, roles/permissions, report definitions, notification templates). It is
idempotent and a fast no-op once the schema is current, and `api`/`worker` wait for it to
succeed — so a bare `up -d` boots to a working system. It creates **no people, vehicles, or
money**. For a demo dataset: `docker compose -f compose.prod.yaml run --rm seed-dev`.

To run migrations as a deliberate, separate step (e.g. a DBA-gated deploy), run
`docker compose -f compose.prod.yaml run --rm migrate` before `up -d`; it is the same one-shot.

Without Docker (native services — the low-footprint path, DEC-013), the equivalents are:

```
pnpm install --frozen-lockfile
pnpm --filter @carrental/contracts --filter @carrental/i18n --filter @carrental/ui build
pnpm --filter @carrental/api build && pnpm --filter @carrental/web build
node apps/api/dist/database/migrate.js
node apps/api/dist/database/seed/seed.js --profile=system
node apps/api/dist/main.js &        # api
node apps/api/dist/worker.js &      # worker
# serve apps/api/... behind nginx using deploy/nginx.conf
```

---

## 3. Routine deploy (new version)

```
git fetch && git checkout <tag>
GIT_SHA=$(git rev-parse HEAD) BUILD_TIME=$(date -u +%FT%TZ) \
  docker compose -f compose.prod.yaml build api worker web
docker compose -f compose.prod.yaml up -d      # `migrate` one-shot runs first (no-op if no new migration), then rolling-replaces api/worker/web
```

Migrations are **forward-only and additive** (new tables/columns/indexes). A deploy that adds a
migration is safe to apply before the new code is live. Watch `/health/ready` and the api log
for ~1 min after; error rate is in `/metrics` (`http_requests_total` by status).

---

## 4. Health & signals

| Check         | Command                              | Healthy                               |
| ------------- | ------------------------------------ | ------------------------------------- |
| liveness      | `curl localhost:3001/health/live`    | `200`                                 |
| readiness     | `curl localhost:3001/health/ready`   | `{"status":"ok"}`, all checks `ok`    |
| version       | `curl localhost:3001/health/version` | expected `gitSha` / `buildTime`       |
| metrics       | `curl localhost:3001/metrics`        | Prometheus text; not internet-exposed |
| web           | `curl -I localhost:3000`             | `200`, `index.html`                   |
| lookups drift | `readiness` → `checks.lookups`       | `ok` (`n lookup types verified`)      |

`readiness` degrades (`503`) if the DB, Redis, migrations, or a required lookup set is missing.

---

## 5. Rollback

Code: redeploy the previous image tag (`up -d` with the old tag). The refresh-cookie and JWT
formats are stable across releases, so sessions survive a rollback.

Migrations are not auto-reversed. If a release's migration must be undone, restore from the
pre-deploy backup (§6) — take one before any deploy that adds a migration. In practice the
additive migrations mean the previous code runs fine against the newer schema, so a code-only
rollback is almost always enough.

---

## 6. Backup & restore

**Backup (before every deploy that adds a migration; nightly otherwise):**

```
bash scripts/backup-db.sh                 # -> var/backups/carrental-<utc>.dump  (+ .sha256)
```

`scripts/backup-db.sh` runs `pg_dump -Fc` against `DATABASE_URL` and writes a checksummed
custom-format archive. Ship it off-host.

**Restore (into an empty database):**

```
bash scripts/restore-db.sh var/backups/carrental-<utc>.dump
# verifies the sha256, drops + recreates the target schema, pg_restore, then prints the row
# counts of the key tables. Run `node apps/api/dist/database/migrate.js` afterwards if the
# backup predates the current migration head.
```

Rehearsal is part of the release gate — see `docs/ai-delivery/04-implementation/stages/
STAGE-007-release-hardening/backup-restore.md` for the last verified run.

Redis needs no backup: on a cold Redis the cache repopulates on demand, rate-limit windows
reset, and queued jobs are re-derived from the transactional outbox by the worker.

---

## 7. Common incidents

**API will not start** — env validation failed. The first log lines list the offending keys.
Fix `.env`, restart.

**`readiness` = 503, `checks.db` failed** — Postgres unreachable or credentials rotated.
Confirm `pg_isready`, check `DATABASE_URL`. The API keeps serving cached GETs where it can but
writes fail fast with `dependency_unavailable` (503) — this is intended.

**`readiness` = 503, `checks.lookups` failed** — a required system lookup set is incomplete,
usually after a partial seed. Re-run `... run --rm migrate` (idempotent).

**Sign-ins returning 429** — the SRS-SEC-015 auth rate limiter tripped. Expected under a
credential-stuffing burst. If it is a false positive (a NAT'd office behind one IP), raise
`RATE_LIMIT_AUTH_MAX` / widen `RATE_LIMIT_AUTH_WINDOW_SEC` and redeploy the api, or set
`RATE_LIMIT_ENABLED=0` temporarily (1/true/yes/on and 0/false/no/off are all honoured). Counters
live in Redis (`ratelimit:*`), TTL'd.

**Checkout returning 429 at the payment step** — `POST /bookings/confirm` has its own limiter
(`RATE_LIMIT_BOOKING_CONFIRM_MAX` per `RATE_LIMIT_BOOKING_CONFIRM_WINDOW_SEC`, default 20 / 60 s per
client IP, DEC-040). It exists to stop card-testing; a burst of 429s from one address is that
working. If real customers are throttled, first check that the api sees the _customer's_ address
and not your load balancer's — `trust proxy` counts one hop, so a TLS terminator in front of the
edge makes every visitor share one bucket — before raising the limit.

**A card dispute (chargeback) appears in Payments & recovery** — an exception of kind "Card
dispute" showing the reason, Stripe's status and the date the evidence is due. A dispute never edits
the ledger. Submit the evidence in the Stripe dashboard before that date (the app does not send it),
then resolve the exception here with what happened. Later events on the same dispute (funds
withdrawn, closed) refresh the same exception; if it was already resolved and Stripe then reverses
the outcome, a new one opens. If a dispute you know about never shows up, the endpoint is not
subscribed to `charge.dispute.*` (§1) or the payment was not taken through this system.

**Stripe webhook deliveries failing** — the endpoint's recent attempts are listed in the Stripe
dashboard. 400 = wrong signing secret (Integrations → Payment provider); 500 = the handler threw and
the api logs say why. Stripe retries a failed delivery (up to three days in live mode) and the api
takes it over on the next attempt — also one whose first attempt died half-way (a claim older than
five minutes is reclaimed) — so fix the cause and let the retries land, or press "Resend" in Stripe.
Nothing needs re-entering by hand.

**A data request is overdue, or "Close account" will not complete** — Data requests, in the same
menu group as Customers (`customer.manage` to act). A reply is due one month after filing and shows
_Overdue_ past that. A closure is refused, with the reason on the screen, while the customer has a
current or upcoming reservation, an open rental or an unresolved payment issue — there is nothing to
force; it unblocks itself when those end. If completing says the saved cards could not be removed,
Stripe was unreachable: nothing was changed, so try again. Erasure removes the sign-in and contact
details, saved drivers and their documents and redacts messages sent to the person; reservations,
rentals, invoices, payments and the audit trail are kept on purpose for their legal retention period
(DEC-041). The completed-access download is available to the customer for 30 days.

**Payments stuck / `recovery_case` piling up** — a step failed after money moved. Work the
queue in the ops console (Finance → cases). The worker re-drives the outbox; if a provider is
down, cases stay `open` and visible rather than silently lost.

**Outbox not draining** — worker down or Redis down. Restart the worker; it resumes from the
`outbox` table, no data loss.

**Overdue rentals not flipping to `overdue`** — the worker's `markOverdue` tick is not
running. Restart the worker; confirm `worker.js` logs a `markOverdue` line each interval.

**Disk pressure on `pgdata`** — check `report_run.result` and `audit_event` growth. Both are
prunable by age; audit retention is a policy setting, not a hard delete path in the app.

---

## 8. What is NOT in this build

Mobile app frontend (APP-CMOB) — the REST/OpenAPI contract it consumes is served by this API
(`/api/v1/openapi.json`). Live payment / mail / SMS / push adapters are configured but default
to the simulator/outbox drivers; switch via `PAYMENT_DRIVER` / `MAIL_DRIVER` / etc. with the
matching provider secrets.

Erasing reservations, rentals, invoices and payments once their legal retention period ends (a
scheduled purge) — a closed account keeps them today (DEC-041). The mobile app does not yet run the
bank's 3-D Secure challenge at checkout; it shows "your bank needs to confirm this payment" (DEC-040).
