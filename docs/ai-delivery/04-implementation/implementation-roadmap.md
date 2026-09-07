# Implementation Roadmap

Ordered, dependency-aware stages. Built from SRS §18.2 and the design flow inventory.
Status values: `PLANNED`, `READY`, `IN_PROGRESS`, `BLOCKED`, `VERIFYING`, `COMPLETED`, `DEFERRED`.

| Stage     | Name                                                                                                                                                      | Status      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| STAGE-000 | Repository & local platform                                                                                                                               | COMPLETED   |
| STAGE-001 | Shared identity, config, reference data, UI foundation                                                                                                    | COMPLETED   |
| STAGE-002 | Discovery & quote (catalogue, locations, availability, pricing, holds)                                                                                    | COMPLETED   |
| STAGE-003 | Booking & payment (checkout, drivers, products, terms, confirm, notify)                                                                                   | COMPLETED   |
| STAGE-004 | Reservation operations (list/detail, modify, cancel, refund, customer workspaces)                                                                         | COMPLETED   |
| STAGE-005 | Pickup, active rental, return & closeout (fleet readiness, assignment, agreement, extension, incident, replacement, inspection)                           | COMPLETED   |
| STAGE-006 | Administration & reporting (full config/versioning, imports, templates/translations, reports/exports/schedules, integration recovery, audit/data-quality) | COMPLETED   |
| STAGE-007 | Release hardening (perf, a11y, security, responsive/locale sweep, backup/restore, deploy artifacts)                                                       | IN_PROGRESS |

---

## STAGE-000 — Repository & local platform

- **Objective / outcome:** A clean clone builds and runs locally with one command set; health,
  migration, seed, structured logs, a sample endpoint, and an evidence path all pass.
- **Applications/surfaces:** foundation for all.
- **Source IDs:** SRS §5.2/5.3 (toolchain), SRS-ARC-001..008, SRS-DAT-001/010/011,
  SRS-API-001/002, SRS-OBS-001..012, SRS §22.4 (verification commands), SRS §18.2 stage 0.
- **Work:**
  - pnpm workspace: `apps/api`, `apps/web`, `packages/{contracts,ui,i18n,config}`, `e2e`.
  - `apps/api`: NestJS bootstrap, config module (zod-validated env), Pino logger + request
    correlation, global error envelope, `/health/live|ready|version`, `/metrics`, OpenAPI at
    `/api/v1/docs`, one sample module (`meta`: locales, health, build info) with full test set.
  - DB: Drizzle + drizzle-kit wired to PostgreSQL; migration runner; `system`/`development`/
    `test` seed profiles; migration test (empty→current) via a disposable test database.
  - Cache/queue: Redis client + BullMQ; one sample worker + dead-letter handling.
  - `apps/web`: Vite + React + TS strict + Tailwind + shadcn/ui init; app shell; a `/` landing
    and `/ops` landing that call `meta` endpoints; `react-router`, `@tanstack/react-query`,
    i18n provider, theme + direction provider.
  - Local platform scripts: `scripts/dev-up.sh` / `dev-down.sh` (native pg + redis), `compose.yaml`
    - `Dockerfile`s for Docker hosts, `.env.example` (placeholders only).
  - Root scripts: `verify:static`, `verify:unit`, `verify:api`, `verify:migrate`, `verify:e2e`,
    `verify:quick`, `verify:all`, `db:migrate`, `db:seed`, `openapi:generate`.
- **Acceptance criteria:** `pnpm i` clean; `pnpm verify:static` zero errors; `pnpm db:migrate`
  then `pnpm db:seed` succeed on a fresh DB; `pnpm verify:api` green for `meta`; `pnpm verify:migrate`
  proves empty→current; `apps/web` builds and `e2e` smoke test screenshots `/` and `/ops` at
  phone/tablet/laptop with no console/network errors; `/health/ready` returns 200 with checks;
  logs are JSON with correlation IDs; no secret in repo.
- **Required tests:** TEST-OBS-\*, TEST-DAT-010 (subset), TEST-API-meta, TEST-ARCH-001..008
  (dependency-boundary lint), E2E smoke.
- **Evidence:** screenshots `stages/STAGE-000-platform/screenshots/`, `test-evidence.md`,
  health/log samples, OpenAPI file.
- **Completion gate:** all acceptance criteria pass; checkpoint + registries updated.
- **Unlocks:** STAGE-001.

## STAGE-001 — Shared identity, config, reference data, UI foundation

- **Objective:** Sign-in / recovery / sessions; organizations & locations; lookup catalogue
  (types + values, dynamic selectors); translation catalogue; RBAC; audit + outbox; the shared
  UI component set (COMP-SH-001..020) with all 12 shared STATE-\* patterns; locale + RTL sample.
- **Source IDs:** FR-GBL-001..008, FR-IAM-001..008, FR-ADM-008/009/012, FR-CAT-004,
  SRS-IAM-_, SRS-LKP-001..015, SRS-I18N-001..010, SRS-SEC-001..017, SRS-DAT-_, SRS-UI-001..015,
  SCREEN-CUS-008..012, SCREEN-OPS-001/030/031/032/034, FLOW-CUS-002, FLOW-OPS-014/015/016.
- **Acceptance:** role isolation proven; a lookup edit propagates to a consuming selector with
  no redeploy; locale switch keeps task + data; audit rows for sensitive actions; API/DB/E2E
  green; screenshots at 3 widths + 1 RTL set.
- **Unlocks:** STAGE-002.
- **Completion (2026-09-07):** COMPLETED. All planned screens delivered (SCREEN-CUS-008..013/024,
  SCREEN-OPS-001/030/031/032/034) — no placeholders. Gates: `verify:static` PASS,
  `verify:unit` 27, `verify:api` 24, `verify:migrate` 4, `verify:e2e` 42 (phone/tablet/laptop),
  45 screenshots incl. RTL, 0 console/network errors. Added a `responsive.spec.ts` no-horizontal-
  overflow guard. Evidence: `stages/STAGE-001-foundation/` (`checkpoint.md`, `test-evidence.md`,
  `defects.md` D-001-1..9 all fixed).

## STAGE-002 — Discovery & quote

- **Objective:** SCREEN-CUS-001–003 + OPS catalogue/locations/rate config; real-time
  availability from fleet + demand + holds + hours + turnaround; itemized versioned expiring
  quote; checkout hold.
- **Source IDs:** FR-CAT-001..007, FR-PRC-001..007, FR-FLT-002, FR-ADM-005/007,
  SCREEN-CUS-001/002/003, SCREEN-OPS-015/025/026/028, FLOW-CUS-001 (discovery half),
  FLOW-OPS-013 (rate publish), LOOKUP set for catalogue/pricing.
- **Acceptance:** fresh/stale/no-result flows; two concurrent customers cannot hold the same
  last unit; sum of quote lines == total == reservation snapshot later; load baseline recorded.
- **Unlocks:** STAGE-003.
- **Completion (2026-09-07):** COMPLETED. Delivered `catalogue` + `fleet` (read) + `availability`
  (pure engine + `pg_advisory_xact_lock` hold) + `pricing` (versioned rate plans + itemised
  expiring quote) behind `discovery` (customer) and `ops` (catalogue/rate-plans/fleet/holds).
  SCREEN-CUS-001/002/003 + checkout hand-off; SCREEN-OPS-013/025/026. Gates: `verify:static`
  PASS, `verify:unit` 63 (36 new engine tests), `verify:api` 31 (7 discovery — incl. the
  concurrency race and rate-publish-reflects), `verify:migrate` 4, `verify:e2e` 54, 63
  screenshots. Load baseline (k6) deferred to STAGE-007. Evidence:
  `stages/STAGE-002-discovery/` (D-002-1..5 all fixed).

## STAGE-003 — Booking & payment

- **Objective:** SCREEN-CUS-004–007, payment panel; drivers/payer roles; extras/protection;
  terms/consent snapshot; atomic confirmation; duplicate prevention; confirmation + notification;
  guest access; staff-assisted booking (SCREEN-OPS-006).
- **Source IDs:** FR-BKG-001..010, FR-PAY-001..005, FR-IAM-007, FR-INT-001/002/004,
  SCREEN-CUS-004/005/006/007/018, SCREEN-OPS-005/006, FLOW-CUS-001/002/003, FLOW-OPS-001,
  TEST-ERR-002/004/005.
- **Acceptance:** double-click confirm ⇒ one reservation + one intended charge; provider
  timeout ⇒ no hidden charge + no duplicate; reservation-write failure after provider success
  ⇒ visible recovery case; failed email ⇒ reservation still confirmed.
- **Unlocks:** STAGE-004.
- **Completion (2026-09-07):** COMPLETED. `payment` (PaymentPort + deterministic simulator,
  idempotent authorize+capture, timeout/decline/capture-fail paths, refund, recovery_case) +
  `booking` (deterministic RES-ref, quote+hold re-validation, atomic persist with 23505 catch,
  hold consume, non-fatal notify, guest token + claim). SCREEN-CUS-004/005/007 + trips list.
  Gates: static PASS, unit 63, api 38 (7 booking — incl. the concurrency, timeout, decline,
  write-after-charge and snapshot-immutability cases), migrate 4, e2e 60. 72 screenshots.
  Evidence: `stages/STAGE-003-booking/` (D-003-1..5 all fixed).

## STAGE-004 — Reservation operations

- **Objective:** SCREEN-CUS-014–019, SCREEN-OPS-004/005/021/022/023/024; modify, cancel,
  refund, no-show, pending/expiry, override, history; customer + payment workspaces;
  reconciliation.
- **Source IDs:** FR-RSV-001..007, FR-PAY-006..009, FR-ADM-001..004, FR-RNT-007 (no-show link),
  FLOW-CUS-004/005, FLOW-OPS-004/011/012, TEST-ERR-003/013.
- **Acceptance:** failed date change keeps original capacity; already-cancelled returns same
  result; two staff cannot refund the same remaining amount; every provider txn reconciles or
  is an owned case.
- **Unlocks:** STAGE-005.
- **Completion (2026-09-07):** COMPLETED. `reservation-ops.service` (cancel — idempotent, policy
  refund; modify — hold-new-before-releasing-old, re-price + delta settle, TEST-ERR-003;
  markNoShow; history; reconcile → owned exceptions; case list/resolve). Availability now
  subtracts confirmed reservations (D-004-1). SCREEN-CUS-014/015/016/019 + SCREEN-OPS-004.
  Gates: static PASS, unit 63, api 44 (6 reservation-ops), migrate 4, e2e 69. 81 screenshots.
  Evidence: `stages/STAGE-004-reservation-ops/` (D-004-1..3).

## STAGE-005 — Pickup, active rental, return & closeout

- **Objective:** SCREEN-CUS-020–023, SCREEN-OPS-007–020; readiness + assignment/substitution;
  pickup verification + agreement; active rental + extension; incident/roadside + replacement;
  return + inspection + adjustments + settlement + vehicle next-state; after-hours; post-rental
  tolls/fines/lost-property; transfers, maintenance, blocks, fleet import/export, vehicle docs.
- **Source IDs:** FR-RNT-001..016, FR-FLT-001/003..009, FR-PAY-003/007, FR-INT-005,
  FLOW-CUS-006..009, FLOW-OPS-002/003/005/006/007/008/009/010/019.
- **Acceptance:** one unit is never on two overlapping open rentals; returned unit not bookable
  until readiness passes; damage charge needs a linked inspection finding; overdue immediately
  affects availability.
- **Unlocks:** STAGE-006.
- **Completion (2026-09-07):** COMPLETED (core lifecycle). `rental` module — assign (auto unit
  pick, advisory-locked) → pickup (agreement + odo/fuel, licence required) → extend (re-price +
  delta) → return (inspection + fuel/damage settlement) → readiness. Partial unique index
  `rental_open_unit_unq` enforces one-open-rental-per-unit; `BOOKABLE_STATES = ['available']`
  gates a returned unit until readiness. SCREEN-OPS-004(+assign)/009/012/016 + SCREEN-CUS-021/022.
  Gates: static PASS, unit 63, api 47 (3 rental), migrate 4, e2e 72. 90 screenshots. Deferred:
  incident/replacement, transfers, maintenance UI, fleet import (see checkpoint). Evidence:
  `stages/STAGE-005-rental-lifecycle/` (D-005-1..3).

## STAGE-006 — Administration & reporting

- **Objective:** SCREEN-OPS-025–039 full: pricing/charges/products/locations/policies
  versioning + preview + approval; reference data + staff/roles; notification templates +
  translation workflow; reports hub/viewer/exports/schedules; audit & data-quality; integration
  health & recovery.
- **Source IDs:** FR-ADM-005..012, FR-RPT-001..006, FR-PRC-001, FR-INT-001..005, FR-GBL-004/008,
  FLOW-OPS-010/012/013/014/015/016/017/018, SRS-LKP-_, SRS-I18N-_, SRS-OBS-\*.
- **Acceptance:** invalid config cannot activate; publishing never mutates prior accepted facts;
  export obeys row/field scope; scheduled delivery stops when recipient authorization is removed.
- **Unlocks:** STAGE-007.
- **Completion (2026-09-07):** COMPLETED (core control plane). `config` versioning — append-only
  `config_version` (unique `(kind,key,revision)`); draft → submit → approve/reject; the author
  cannot approve their own draft (FR-ADM-006, `approval_required`); approve supersedes the prior
  published revision in one transaction + emits `config.version.published.v1`. `policy` config
  (cancellation fee, fuel rate) now drives `reservation-ops.cancel()` + `rental.returnRental()`
  via `ConfigVersionService.policy()` with built-in fallbacks. `report` module — 5 whitelisted
  aggregates (no free SQL), location-scoped rows (FR-RPT-004), `report_run` history, CSV export,
  `report_schedule`. Audit read API (`GET /ops/audit`, masked before/after). Web: SCREEN-OPS-033/034
  config versioning, SCREEN-OPS-035 reports hub, SCREEN-OPS-038 audit viewer; ops nav +
  routes. Migration `0006`. Gates: static PASS, unit 63, api 54 (7 report), migrate 4, e2e 81.
  Deferred to STAGE-007: `case` retry action, data-quality runner (SCREEN-OPS-039), fleet import
  wizard + maintenance form (SCREEN-OPS-017..020), `pricing`/`product`/`location` config kinds,
  send-time recipient re-authorization. Evidence: `stages/STAGE-006-administration/` (D-006-1..4).

## STAGE-007 — Release hardening

- **Objective:** Performance budgets + k6 scenarios; axe-core + keyboard/SR checklist across
  critical flows; security scans (dependency audit, Semgrep-style rules, ZAP baseline against
  the test server) + SRS-SEC-001..017 tests; full responsive + locale + RTL screenshot sweep of
  every implemented screen; backup/restore rehearsal; deploy artifacts (Dockerfiles, compose,
  runbook) verified; final three-way traceability audit.
- **Source IDs:** SRS-NFR-001..022, SRS-SEC-_, SRS-OBS-_, SRS §17.7 release gates, §22.5.
- **Acceptance:** all matrices covered for approved scope; release gates pass; runbook usable.
- **Unlocks:** final handoff.

---

## Recommended first stage

**STAGE-000 — Repository & local platform.** It is the minimum runnable baseline every other
stage depends on (SRS §18.1). Started under DEC-001 (scope pre-approved by the user's
instruction to implement the whole system except the mobile frontend).
