# STAGE-006 — checkpoint

- **Status:** COMPLETED (2026-09-07).
- **Objective met:** the internal control plane — versioned configuration with preview +
  separation-of-duties approval + publish (publishing never mutates a prior accepted fact); a
  reports hub (definitions → runs → CSV export → schedules) whose rows obey the operator's
  location scope; a read-only, masked audit viewer.

## Completed work

### API (`apps/api/src`)

- **`modules/config/config-version.service.ts`** — `ConfigVersionService`:
  - `list` / `current(kind,key)` — "current" = highest `revision` in state `published`.
  - `policy(key, field)` — numeric policy reader with built-in `POLICY_DEFAULTS` fallback
    (`cancellation.freeCancelHours/lateFeeBps`, `fuel_rate.minorPerPct`).
  - `draft` → `submit` (→ `in_review`) → `approve` (→ `published`; in one transaction: supersede
    the prior published row, set `approvedBy`/`approvedAt`/`effectiveFrom`, emit
    `config.version.published.v1`) / `reject` (→ `rejected`). Validator runs on draft, submit,
    approve.
  - **FR-ADM-006:** `approve()` throws `approval_required` (`params.reason =
author_cannot_approve`) when `row.createdBy === actor.accountId`; the audit record carries
    both `approvedBy` and `authoredBy`.
  - `preview(kind, payload)` — validates + returns worked examples; writes nothing.
- **`modules/report/report.service.ts`** — `ReportService`: `listDefinitions`,
  `run(actor, code, params)` (permission check vs `def.minPermission`; location-scope filter
  `actor.locationScope` → `inArray(reservation.pickupLocationCode, scope)`; stores `report_run`;
  audits `report.run`), `getRun`, `exportCsv(runId)` (`text/csv`), `schedule` / `listSchedules`,
  `listRuns`. Five `queryKind`s, each a hard-coded aggregate: `reservations_by_state`,
  `revenue_by_category`, `fleet_utilisation`, `refunds`, `open_cases`.
- **`modules/report/report.controller.ts`** — `@Controller({ path: 'ops', version: '1' })`:
  `GET /ops/reports`, `GET /ops/reports/runs`, `POST /ops/reports/:code/run`,
  `GET /ops/reports/runs/:runId/export`, `GET|POST /ops/reports/schedules`;
  `GET|POST /ops/config/versions`, `POST /ops/config/versions/preview`,
  `POST /ops/config/versions/:id/{submit,approve,reject}` (approve/reject need `config.publish`);
  `GET /ops/audit` (`audit.read`; filter action/targetType/from/to; masked `beforeSafe`/`afterSafe`).
- **schema** — `config_version` (unique `config_version_kind_key_rev_unq (kind,key,revision)`;
  index on `(organization_id,kind,key,state)`), `report_definition`, `report_run`,
  `report_schedule`. Migration `0006_flat_lady_bullseye`.
- **policy wiring** — `reservation-ops.cancel()` reads `cancellation.freeCancelHours` +
  `.lateFeeBps`; `rental.returnRental()` reads `fuel_rate.minorPerPct`. Hard-coded constants
  removed; `booking.module` + `rental.module` import the config module.
- **seed** — `system.ts` seeds the 5 `report_definition` rows. `test.ts` adds
  `test-manager@example.test` (`manager` — a second `config.publish` holder) and
  `test-scoped@example.test` (`finance_staff`, `locationScope: ['TST1']`).

### Web (`apps/web/src`)

- `lib/admin-hooks.ts` — `useConfigVersions`, `useConfigPreview`, `useDraftConfigVersion`,
  `useConfigVersionTransition`; `useReportDefinitions`, `useReportRuns`, `useRunReport`,
  `useReportSchedules`, `useScheduleReport`, `fetchReportCsv`; `useAuditLog`.
- **SCREEN-OPS-033/034** `config-versions-page.tsx` at `/ops/config` — area/setting pickers,
  revision-history table (state badge, payload, note, effective-from), a draft form with
  **Preview effect**, per-row **Submit** / **Approve & publish** / **Reject** (publish actions
  only for `config.publish` holders), a separation-of-duties error surface.
- **SCREEN-OPS-035** `reports-page.tsx` at `/ops/insights` — report picker + **Run**, a result
  table with the `scopeNote` badge + row count, **Export CSV** (inline preview + file download),
  recent-runs list, schedules list + new-schedule form (`report.export` only).
- **SCREEN-OPS-038** `audit-log-page.tsx` at `/ops/audit` — action / target-type filter, a
  newest-first table (masked before/after via an expandable **Diff**), rendered slice capped at
  120 with a "narrow the filter" hint.
- Ops nav: "Insights" → **Reports**; new **Audit log** item; "Configuration" now a real screen.
  Routes wired with `RequirePermission` (`config.read|config.publish`, `report.read`,
  `audit.read`). Icon-only "Sign out" button got an `aria-label`.

### E2E

- `e2e/tests/report.spec.ts` — 3 scenarios × 3 viewports: config draft→preview→submit→(second
  admin) approve&publish; run a report + export CSV; filter the audit viewer.
- `responsive.spec.ts` sweeps `/ops/config`, `/ops/insights`, `/ops/audit` for horizontal
  overflow; `rtl.spec.ts` adds an Arabic config-editor screenshot.

## Commands run / verified

- `pnpm db:generate` → `0006_flat_lady_bullseye`; `pnpm db:reset` (dev + test) applies it.
- `verify:static` PASS · `verify:unit` 63 · `verify:api` 54 (7 report) · `verify:migrate` 4 ·
  `verify:e2e` 81 (phone/tablet/laptop), 0 console/network errors.

## Defects

D-006-1 … D-006-4 — see `defects.md`. No open defects.

## Deferred within STAGE-006 (noted, not silently dropped)

- `case` **retry** action (re-emit outbox / re-run reconcile) — list + resolve already exist
  (STAGE-004).
- Data-quality check runner + **SCREEN-OPS-039** panel — lookup drift already in `/health/ready`.
- Fleet **import wizard** + **maintenance schedule** form (SCREEN-OPS-017..020) — carried from
  STAGE-005; `vehicle_block` model exists.
- `pricing` / `product` / `location` config **kinds** — the versioning engine is kind-agnostic;
  only `policy` has a validator + consumer wired. `rate_plan` (STAGE-002) stays the pricing impl.
- Scheduled-delivery **recipient re-authorization at send time** — no scheduler process in this
  environment; `report_schedule.lastSkipReason` is in place for it.

All are folded into STAGE-007. None touch the stage's core invariants (append-only versioning,
separation of duties, scoped reports, masked audit) which are complete and tested.

## Next exact action

Begin **STAGE-007 — Release hardening**. See `stages/STAGE-007-release-hardening/plan.md`:
performance budgets + k6; axe-core + keyboard/SR pass on the critical flows; security scans +
SRS-SEC tests; a full responsive + locale + RTL screenshot sweep of every implemented screen;
backup/restore rehearsal; deploy artifacts (Dockerfiles, compose, runbook); the final three-way
traceability audit. Fold in the STAGE-005/006 deferred items where they fit.

## Resume notes

- Config is **append-only**: never `UPDATE` a published `config_version` payload — always a new
  `revision`. `current()` is a read of the newest `published` row.
- New policy knobs go through `ConfigVersionService` + `POLICY_DEFAULTS`, never a new constant.
- Reports must filter by `actor.locationScope` **at query time** (`report.service`), never in the
  CSV formatter. New report kinds = a new `queryKind` branch + a `report_definition` seed row.
- The audit surface is read-only; there is no write path and there must never be one.
