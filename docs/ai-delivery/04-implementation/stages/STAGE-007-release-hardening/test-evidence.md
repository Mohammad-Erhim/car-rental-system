# STAGE-007 — test evidence

Stage: **Release hardening — security, accessibility, performance, backup/restore, deploy
artifacts, full sweep, traceability audit.**
Date: 2026-09-07. Branch `implementation`.

## Verification gates

| Gate              | Command                | Result                                                                                                                                            |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static            | `pnpm verify:static`   | PASS — lint + typecheck + prettier + `openapi:generate` (87 paths) + contract drift                                                               |
| Unit              | `pnpm verify:unit`     | PASS — 63                                                                                                                                         |
| API integration   | `pnpm verify:api`      | PASS — **68** (`security` **13 new**, `rental` 4, report 7, reservation-ops 6, booking 7, iam 9, discovery 7, config-lookup 5, migrate 4, meta 6) |
| Migration         | `pnpm verify:migrate`  | PASS — 4; head `0006` (no new migration in 007)                                                                                                   |
| E2E (3 viewports) | `pnpm verify:e2e`      | PASS — full suite incl. `a11y` + `full-sweep`; 1 local retry configured for the memory-constrained host                                           |
| Accessibility     | `pnpm verify:a11y`     | PASS — 0 serious/critical axe (WCAG 2.1 A+AA) on the critical customer + ops screens                                                              |
| Security          | `pnpm verify:security` | PASS — 13 (`security.spec.ts`, TEST-SEC-003/007/008/010/011/015/016/017)                                                                          |
| Performance       | `pnpm verify:perf`     | PASS — hot reads p95 ≤ 40 ms single-process, 0 errors (indicative; `perf.md`)                                                                     |
| Backup / restore  | manual rehearsal       | PASS — dump → restore → API boots → `/health/ready = ok` (`backup-restore.md`)                                                                    |
| Secret scan       | `pnpm check:secrets`   | PASS                                                                                                                                              |

## What shipped

### Security (SRS-SEC-\*, `apps/api/src/common/security/`, `apps/api/test/security.spec.ts`)

- **`RateLimitGuard`** (SEC-015) — Redis fixed-window, keyed by bucket + client IP, fails open,
  no-op when `RATE_LIMIT_ENABLED=false`. Registered as an `APP_GUARD` ahead of `AuthGuard`.
  `@RateLimit({ preset: 'auth' })` on `sign-in`, `register`, `verify-contact`,
  `resend-verification`, `recovery/{start,complete}`. Env: `RATE_LIMIT_ENABLED`,
  `RATE_LIMIT_AUTH_MAX` (40), `RATE_LIMIT_AUTH_WINDOW_SEC` (60).
- **`CsrfGuard`** (SEC-003) — on `/auth/refresh` + `/auth/sign-out` (the only cookie-authed
  writes): a request carrying the refresh cookie must be same-origin (`Origin`/`Referer` in
  `CORS_ALLOWED_ORIGINS`) or present a matching `X-CSRF-Token` double-submit; requests with no
  refresh cookie pass through.
- `security.spec.ts` (13): auth-burst → `429` + `Retry-After`; CORS never reflects a foreign
  origin (simple + preflight); refresh cookie is `HttpOnly; SameSite=Lax; Path=/api/v1/auth`;
  foreign-origin cookie write → `403`, same-origin → `201`; anonymous → `401` and wrong-perm
  (`rental_agent`) → `403` on every ops admin route; a `TST1`-scoped operator's report can't be
  widened by a param; config author can't self-approve; a SQL-ish filter value returns 0 rows,
  not an error; unknown body fields are stripped (no mass assignment); malformed JSON → 4xx not
  500; config publish + sign-in are audited; the Problem envelope carries no
  password/token/stack/sql.

### Accessibility (`e2e/tests/a11y.spec.ts`, axe-core WCAG 2.1 A+AA)

- 0 serious/critical violations across `/`, `/search`, `/sign-in`, `/register`, `/account`,
  `/account/profile`, `/account/drivers`, `/trips`, and `/ops`, `/ops/work`, `/ops/rentals`,
  `/ops/fleet`, `/ops/config`, `/ops/insights`, `/ops/audit`, `/ops/config/reference-data`.
- Fixes: light-theme `--success` / `--warning` / `--destructive` tokens darkened so the tinted
  (`/15`) Badge/pill variants clear 4.5:1 on white (the "All systems operational" chip was
  4.23); inline text links (auth pages "Sign in" / "Register", customer "back" links) are now
  always-underlined, resolving `link-in-text-block`.

### Performance (`scripts/perf-smoke.mjs`, `verify:perf`)

- Autocannon over `/health/ready`, `/meta/locales`, `/discovery/search` with a 25-request fetch
  correctness pre-flight. All within budget, 0 errors. See `perf.md` — indicative only on this
  single-process, 1.9 GB host.

### Backup / restore (`scripts/backup-db.sh`, `scripts/restore-db.sh`)

- `pg_dump -Fc` + sha256 sidecar; restore verifies the checksum, resets the schema,
  `pg_restore`, prints key row counts, guards the target name. Rehearsed end to end incl. an API
  boot against the restored DB. `backup-restore.md`.

### Deploy artifacts (`deploy/`)

- `Dockerfile.api` (multi-stage, non-root, `tsc → dist` + `pnpm deploy`, migrations copied in),
  `Dockerfile.web` (vite build → nginx), `nginx.conf` (SPA fallback + `/api` + `/health`
  proxy), `docker-compose.yml` (postgres 16 + redis 7 + api + worker + web + `migrate`/`seed-dev`
  one-shots), `.dockerignore`, `RUNBOOK.md`. `pnpm --filter @carrental/api build` verified to
  emit every container entrypoint (`main.js`, `worker.js`, `database/migrate.js`,
  `database/seed/seed.js`). A live `docker build` needs Docker (absent here) — documented.

### Deferred-from-005: overdue worker

- The worker housekeeping tick now flips `active` rentals past `scheduledReturnAt` to `overdue`
  (FR-RNT-014). Manual trigger: `POST /ops/rentals/overdue-sweep` (`rental.read`+`rental.return`).
  `rental.spec.ts` TEST-RNT-003.

### Full sweep (`e2e/tests/full-sweep.spec.ts`)

- Every implemented customer + ops route visited at the project viewport: heading visible, no
  horizontal page overflow, console/network guards clean, screenshot captured. A representative
  set re-checked in Arabic (RTL) on phone + laptop.

## Traceability

`traceability-matrix.md` updated: SRS-SEC / SRS-NFR / SRS-UI cross-cutting rows moved to
COMPLETED-for-scope with the STAGE-007 evidence; a new STAGE-007 screen/flow block; FR-RNT-014
closed. `release-readiness.md` records every gate, the full SRS-SEC-001..017 map, and the
bounded, reasoned deferral list.

## Deferred (documented in `release-readiness.md`, not dropped)

k6 write-path load + ZAP baseline + SAST (need a staged deploy + the tools); Firefox/WebKit E2E
(Chromium-only host); full step-up-auth UI; OIDC (no provider in scope); the STAGE-005/006
feature deferrals (incident/replacement, transfers, maintenance UI, fleet import, case retry,
data-quality panel, non-`policy` config kinds, scheduled-report send-time re-auth). None is a
correctness, authorization, or money-path blocker.

## Defects

D-007-1..3 — see `defects.md`. No open defects.
