# STAGE-007 — Release hardening · plan

## Objective / outcome

Take the implemented system (STAGE-000..006, full scope minus APP-CMOB frontend) through the
SRS §17.7 release gates: performance budgets, accessibility, security, a full responsive +
locale + RTL screenshot sweep of every screen, backup/restore rehearsal, deploy artifacts, and a
final three-way traceability audit. Also land the items explicitly deferred from earlier stages
where they fit the hardening pass.

## Source IDs

SRS-NFR-001..022, SRS-SEC-001..017, SRS-OBS-001..012, SRS §17.7 release gates, §22.5;
FR items carried from 005/006 (see "Deferred intake" below).

## Workstreams

### 1. Performance budgets + load

- Define budgets (SRS-NFR): API p95 per critical endpoint (search, quote, confirm, assign,
  return, report run), web route TTI / bundle size, DB query time ceilings.
- `k6` (or autocannon on this host) scenarios: discovery search + quote under concurrency, the
  confirm race, a report run. Record numbers vs. budget in `perf/`.
- API `tsc → dist` build path (`start:dist`) verified and used for the perf run (not
  `@swc-node/register`).
- Web: production build analysis; code-split the ops surface from the customer surface if the
  single bundle exceeds budget.

### 2. Accessibility

- `axe-core` (via `@axe-core/playwright`) assertion added to the critical E2E journeys: home,
  search, vehicle detail, checkout, trips, reservation detail; ops sign-in, dashboard,
  reservations, rentals, config versioning, reports, audit.
- Keyboard-only + screen-reader checklist (focus order, visible focus, skip links, form labels,
  live-region announcements for async results, dialog focus trap) — documented pass in
  `a11y/checklist.md` with the axe run as machine evidence.
- Fix violations found; re-run.

### 3. Security

- Dependency audit (`pnpm audit`), a Semgrep-style ruleset (or `eslint-plugin-security`), and a
  ZAP baseline scan against the running test server; triage + record in `security/`.
- SRS-SEC-001..017 test suite (`apps/api/test/security.spec.ts`): authz on every ops route,
  scope-violation cannot be bypassed via param tampering, refresh reuse/rotation, idempotency
  replay, rate-limit, CORS allowlist, cookie flags, no PII in logs, error envelope leaks nothing,
  audit cannot be written through, report/CSV cannot exceed scope.
- Step-up / CSRF double-submit / rate-limit hardening if not already sufficient.

### 4. Responsive + locale + RTL full sweep

- One Playwright spec (`e2e/tests/full-sweep.spec.ts`) that visits **every** implemented route at
  phone / tablet / laptop and in `en` + `ar`, asserts no horizontal overflow + `guards.assertClean()`
  - `axe`, and captures a screenshot. This is the "every screen" evidence bundle for §22.5.
- Fix any overflow / clipping / RTL mirroring defects found.

### 5. Backup / restore rehearsal

- `pg_dump` of a seeded + exercised DB → drop → `pg_restore` → run `verify:api` against the
  restored DB → green. Redis is a cache (documented as rebuildable). Script + evidence in
  `ops/backup-restore.md`.

### 6. Deploy artifacts

- `Dockerfile` (api), `Dockerfile` (web static + a tiny server), `docker-compose.yml`
  (api + web + postgres + redis), `.env.example`, and a `RUNBOOK.md` (bootstrap, migrate, seed,
  health, rollback, backup/restore, common incidents). "Verified" = compose up on this host (if
  Docker becomes available) OR a documented dry-run of each step against the native services.

### 7. Final traceability audit

- Walk `traceability-matrix.md` end to end: every in-scope FR / SCREEN / FLOW / SRS family row
  has code + a passing test + (where UI) a screenshot, or an explicit `DEFERRED` with a reason.
- Close the `PARTIAL` rows (SRS-API per-endpoint, SRS-DAT invariants, SRS-UI COMP-SH-\*,
  SRS-SEC hardening, SRS-I18N document/email locale) or restate them as scoped deferrals.
- Produce `release-readiness.md` (gate-by-gate PASS/【defer】 with evidence links).

## Deferred intake (from earlier stages)

- **STAGE-006:** `case` **retry** action (re-emit outbox / re-run reconcile); data-quality check
  runner + **SCREEN-OPS-039** panel; `pricing` / `product` / `location` **config kinds** on the
  versioning engine; scheduled-report **recipient re-authorization at send time**
  (`report_schedule.lastSkipReason`).
- **STAGE-006:** report **parameter forms** (date-range params for `revenue_by_category` etc.)
  and per-column selection on export.
- **STAGE-005:** incident / roadside + replacement flow; vehicle **transfers**; **maintenance**
  workflow UI (`vehicle_block`); **fleet import/export** wizard (SCREEN-OPS-017..020); vehicle
  documents; after-hours return specifics; post-rental tolls / fines / lost-property.
- **STAGE-002:** k6 load baseline for discovery.
- **STAGE-005:** `markOverdue()` **worker wiring** (the function exists; schedule it).

Bring these in where they share a hardening surface (e.g. fleet import gets its own small E2E +
screenshots in the full sweep; the overdue worker gets a scheduled job + a test). Anything that
does not fit the release window is restated as an explicit, reasoned deferral in
`release-readiness.md` — never silently dropped.

## Acceptance / gates

- `verify:static | unit | api | migrate | e2e` all green (unchanged).
- New: `verify:perf` (budgets met or a documented waiver), `verify:a11y` (0 axe violations on the
  critical set), `verify:security` (SEC suite green + scan triage clean/waived).
- Full-sweep screenshot bundle present for every in-scope screen at 3 viewports + RTL.
- `pg_restore` → `verify:api` green.
- `RUNBOOK.md` steps each executed (or dry-run documented).
- `traceability-matrix.md` has no un-annotated gap for in-scope IDs; `release-readiness.md`
  written.

## Risks / notes

- This host has ~1.9 GB RAM and no Docker — perf numbers are indicative, not production-grade;
  ZAP / Semgrep may need lightweight substitutes. Record the substitution and its limits rather
  than skipping the gate.
- The full-sweep spec will be the longest-running E2E — keep it a single spec, one screenshot per
  route/viewport/locale, and allow it to run last.
- Do not regress any STAGE-001..006 behaviour: the hardening pass adds tests and artifacts, it
  does not rewrite domain logic. Any domain fix needed for a gate is a scoped defect with its own
  entry.
