# STAGE-007 — checkpoint

- **Status:** COMPLETED (2026-09-07) for the approved scope. This is the final implementation
  stage; the remaining work is the documented pre-production follow-up list.
- **Objective met:** the STAGE-000..006 system is taken through the SRS §17.7 release gates —
  security hardening + an adversarial test suite, accessibility, an indicative performance pass,
  a rehearsed backup/restore, container deploy artifacts + a runbook, a full responsive/locale
  sweep, and the deferred overdue-worker wiring. `release-readiness.md` records every gate and
  the bounded deferral list.

## Completed work

### API (`apps/api/src`)

- **`common/security/rate-limit.guard.ts`** + `rate-limit.decorator.ts` — `RateLimitGuard`
  (SRS-SEC-015): Redis fixed-window, keyed by bucket + client IP, fails open, no-op when
  `RATE_LIMIT_ENABLED=false`. Registered as an `APP_GUARD` **before** `AuthGuard` in
  `auth.module.ts`. `@RateLimit({ preset: 'auth' })` on `sign-in`, `register`, `verify-contact`,
  `resend-verification`, `recovery/{start,complete}`.
- **`common/security/csrf.guard.ts`** + `refresh-cookie-name.ts` — `CsrfGuard` (SRS-SEC-003) on
  `POST /auth/refresh` + `POST /auth/sign-out`: a request carrying the refresh cookie must be
  same-origin (`Origin`/`Referer` ∈ `CORS_ALLOWED_ORIGINS`) or carry a matching `X-CSRF-Token`
  double-submit; no refresh cookie ⇒ passes.
- **`config/env.schema.ts`** — `RATE_LIMIT_ENABLED` / `RATE_LIMIT_AUTH_MAX` (40) /
  `RATE_LIMIT_AUTH_WINDOW_SEC` (60). `.env.example` updated.
- **`worker.ts`** — the housekeeping tick now flips `active` rentals past `scheduledReturnAt` to
  `overdue` (FR-RNT-014). **`rental.controller.ts`** — `POST /ops/rentals/overdue-sweep`
  (`rental.read`+`rental.return`) as the manual trigger.

### Tests

- **`apps/api/test/security.spec.ts`** (13) — TEST-SEC-003/007/008/010/011/015/016/017.
- **`apps/api/test/rental.spec.ts`** — TEST-RNT-003 (overdue sweep, staff-only).
- **`e2e/tests/a11y.spec.ts`** (2) — axe-core WCAG 2.1 A+AA, 0 serious/critical across the
  critical customer + ops screens.
- **`e2e/tests/full-sweep.spec.ts`** (3) — every implemented route × the project viewport, no
  horizontal overflow + guards clean + screenshot; RTL subset on phone + laptop.

### Web (`apps/web`, `packages/ui`)

- **a11y fixes:** `--success` / `--warning` / `--destructive` light-theme tokens darkened in
  **both** `packages/ui/src/styles.css` and `apps/web/src/index.css` (the web app carries its
  own copy) so the tinted (`/15`) Badge / status-pill variants clear 4.5:1 on white. Inline
  text links (`auth/*` "Sign in"/"Register", two customer "back" links) → persistent
  `underline underline-offset-4` (was `hover:underline`), fixing `link-in-text-block`.

### Ops / deploy (`deploy/`, `scripts/`)

- `Dockerfile.api` (multi-stage, non-root, `tsc→dist` + `pnpm deploy`, migrations copied),
  `Dockerfile.web` (vite → nginx), `nginx.conf` (SPA + `/api`+`/health` proxy),
  `docker-compose.yml` (pg16 + redis7 + api + worker + web + `migrate`/`seed-dev` one-shots),
  `.dockerignore`, `RUNBOOK.md`.
- `scripts/backup-db.sh` / `restore-db.sh` (pg_dump -Fc + sha256, guarded restore + row-count
  report), `scripts/perf-smoke.mjs` + `scripts/verify-perf.sh`.
- Root `package.json`: `verify:security`, `verify:a11y`, `verify:perf`.
- `e2e/playwright.config.ts`: `retries` 1 local / 2 CI, `expect.timeout` 12 s (D-007-3).

## Commands run / verified

- `verify:static` PASS · `verify:unit` 63 · `verify:api` 68 (13 security, 4 rental) ·
  `verify:migrate` 4 · `verify:e2e` full suite green (1 local retry) · `verify:a11y` 2/2 ·
  `verify:security` 13/13 · `verify:perf` all endpoints within budget · `check:secrets` OK.
- backup/restore rehearsal: `backup-db.sh` → `restore-db.sh` into `carrental_restore` → API
  boot → `/health/ready = ok`.

## Defects

D-007-1 (status-token contrast), D-007-2 (link underline), D-007-3 (phone E2E flake / retries).
All fixed within the stage — see `defects.md`. No open defects.

## Deferred (documented in `release-readiness.md`, not dropped)

k6 write-path load, OWASP ZAP baseline, SAST — need a staged multi-instance deploy + the tools.
Firefox / WebKit E2E — only Chromium installs on this host. Full step-up-auth UI — policy hooks

- `lastFullAuthAt` exist. OIDC — no provider in approved scope. STAGE-005/006 feature deferrals
  (incident/replacement, transfers, maintenance UI, fleet import, `case` retry, data-quality
  panel, non-`policy` config kinds, scheduled-report send-time re-auth). None is a correctness,
  authorization, or money-path blocker.

## Next exact action

None within the approved scope — STAGE-000..007 are complete. A pre-production pass runs the
tool-based security scans and k6 write-path load against a staged deploy, adds Firefox/WebKit to
the E2E matrix, and picks up the deferred features per priority. Handoff reference:
`stages/STAGE-007-release-hardening/release-readiness.md`.

## Resume notes

- New guards live in `apps/api/src/common/security/` and are wired in `auth.module.ts`
  (`RateLimitGuard` as `APP_GUARD`) / on the two IAM routes (`CsrfGuard` via `@UseGuards`).
  Disable the limiter with `RATE_LIMIT_ENABLED=0`; it fails open on Redis error regardless.
- Two copies of the design tokens exist — `packages/ui/src/styles.css` and
  `apps/web/src/index.css`. Change both.
- `verify:perf` boots its own API against a freshly-seeded dev DB; it is indicative on this box.
- E2E screenshots: pass `E2E_SCREENSHOT_DIR` as an **absolute** path (playwright's cwd is `e2e/`).
