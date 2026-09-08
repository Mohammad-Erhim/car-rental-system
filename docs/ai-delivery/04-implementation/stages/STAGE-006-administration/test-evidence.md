# STAGE-006 — test evidence

Stage: **Administration & reporting — configuration versioning, reports hub, audit viewer.**
Date: 2026-09-07. Branch `implementation`.

## Verification gates

| Gate              | Command               | Result                                                                                                                                             |
| ----------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static            | `pnpm verify:static`  | PASS — lint + typecheck + prettier + `openapi:generate` (86 paths) + contract drift (0 unknown error codes)                                        |
| Unit              | `pnpm verify:unit`    | PASS — 63 (contracts 4, i18n 11, api 42, ui 4, web 2); STAGE-006 logic is covered by API integration tests                                         |
| API integration   | `pnpm verify:api`     | PASS — **54** (`report` **7 new**, `reservation-ops` 6, `booking` 7, `iam` 9, `rental` 3, `discovery` 7, `config-lookup` 5, `migrate` 4, `meta` 6) |
| Migration         | `pnpm verify:migrate` | PASS — 4; migration `0006` (`config_version`, `report_definition`, `report_run`, `report_schedule`) empty→current                                  |
| E2E (3 viewports) | `pnpm verify:e2e`     | PASS — **81** (27 × phone/tablet/laptop); **9 new** for STAGE-006; 0 console errors, 0 unexpected failed requests                                  |

## What shipped

### Configuration versioning (FR-ADM-005..007, SCREEN-OPS-033/034)

- `config_version` is **append-only**: `(kind, key, revision)` is unique; a published revision is
  never edited. "Current" is the highest-`revision` row in state `published` — a pointer, not a
  mutable record.
- Workflow: `draft` → `submit` (→ `in_review`) → `approve` (→ `published`, supersede the prior
  `published` row in the same transaction, emit `config.version.published.v1`) or `reject`
  (→ `rejected`). The domain validator runs on **draft, submit and approve**.
- **Separation of duties (FR-ADM-006):** `approve()` refuses when `row.createdBy === actor.accountId`
  → `approval_required` (403), `params.reason = author_cannot_approve`. Both actor ids are written
  to the audit record (`approvedBy`, `authoredBy`).
- `policy` config drives real behaviour now: the **cancellation** fee (`freeCancelHours`,
  `lateFeeBps`) and the **fuel recharge** rate (`minorPerPct`) are read from the current published
  revision via `ConfigVersionService.policy()`, falling back to built-in `POLICY_DEFAULTS`.
  `reservation-ops.cancel()` and `rental.returnRental()` were switched off their hard-coded
  constants.
- `preview(kind, payload)` is a pure projection — validates then returns worked examples; no row
  is written.

### Reports (FR-RPT-001..004, SCREEN-OPS-035)

- `report_definition` rows are seeded (system seed): `reservations_by_state`,
  `revenue_by_category`, `fleet_utilisation`, `refunds`, `open_cases`. Each maps a `queryKind` to
  a **hard-coded aggregate** in `report.service` — there is no free-SQL path.
- `run(actor, code, params)` checks `def.minPermission` against `actor.permissions`, applies the
  operator's **location scope** (`actor.locationScope` → `WHERE reservation.pickup_location_code
IN (...)`), stores a `report_run` (params, row count, result blob, `scopeNote`), and audits
  `report.run`. Every result carries the scope it used.
- `exportCsv(runId)` renders the stored result as CSV (`text/csv`, `Content-Disposition`
  attachment). The scope is applied at **query** time, never in the formatter.
- `schedule(...)` / `listSchedules()` persist a `report_schedule` (cron + recipients); gated on
  `report.export`.

### Audit viewer (FR-ADM-009, SCREEN-OPS-038)

- `GET /ops/audit` (perm `audit.read`) reads `audit_event` filtered by action / target type /
  date, newest 200, returning the **masked** `beforeSafe` / `afterSafe` snapshots. Read-only —
  there is no write path through this surface.

## API integration tests — `apps/api/test/report.spec.ts` (7)

- **TEST-ADM-001** draft → preview (`examples` mention the `24h` window) → submit (`in_review`);
  the **author's** approve is refused `403 approval_required` / `author_cannot_approve`; a second
  publisher (`test-manager`) approves → `published`, `approvedBy != createdBy`, `effectiveFrom`
  set.
- **TEST-ADM-002** a second published revision: `revision` is `2`; listing shows `rev 1 =
superseded`, `rev 2 = published`; a booking ~20 days out (inside the new 1000 h late-fee
  window) is cancelled and charged **exactly** `round(totalMinor × 1000 / 10000)` — i.e. the
  cancel flow reads the just-published policy.
- **TEST-ADM-003** an invalid policy payload (`lateFeeBps 20000` > 10000; `freeCancelHours -4`
  < 0) is rejected `422` **before** any row is created.
- **TEST-RPT-001** location scope: with a booking at `TST1` and one at `TST2`, the `TST1`-scoped
  finance user's `reservations_by_state` run reports `scopeNote "Scoped to TST1"` and a strictly
  smaller total than the org-wide manager's `"All locations"` run — the `TST2` row is absent for
  the scoped user.
- **TEST-RPT-002** `fleet_utilisation` run → CSV export is `text/csv`, first line `state,units`,
  line count == `rowCount + 1`.
- **TEST-RPT-003** permission gating: `test-agent` (no `report.read`) → `403` on `GET /ops/reports`
  and on a run; `open_cases` (needs `audit.read`) → `403` for a `report.read`-only user.
- **TEST-ADM-004** the audit trail contains `config.version.drafted`, `.submitted`, `.approved`
  for the workflow above, each with an actor label.

Seed additions for the tests: `test-manager@example.test` (`manager`, a second `config.publish`
holder) and `test-scoped@example.test` (`finance_staff`, `locationScope: ['TST1']`).

## E2E — `e2e/tests/report.spec.ts` (3 × phone/tablet/laptop = 9)

- **SCREEN-OPS-033/034** — admin opens `/ops/config`, fills a cancellation draft, **Preview
  effect** (asserts the `36h` example), **Save draft**, **Submit** (row → `in_review`); signs
  out, signs in as a _different_ publisher (`manager@example.test`), **Approve & publish** (row →
  `published`).
- **SCREEN-OPS-035** — admin runs `fleet_utilisation`, sees the scope badge ("All locations") and
  the results table, **Export CSV** → the inline preview contains `state,units`.
- **SCREEN-OPS-038** — admin filters the audit viewer to `config_version` and sees
  `config.version.approved` + `config.version.drafted`.

Also extended: `responsive.spec.ts` now sweeps `/ops/config`, `/ops/insights`, `/ops/audit` for
horizontal-overflow at all three viewports; `rtl.spec.ts` adds an Arabic screenshot of the
configuration-versioning editor with a no-overflow assertion.

## Screenshots — `stages/STAGE-006-administration/screenshots/`

New scenarios (× phone/tablet/laptop): `ops-config-preview`, `ops-config-in-review`,
`ops-config-published`, `ops-report-result`, `ops-report-csv`, `ops-audit-log`,
`rtl-ops-config-versioning`.

### Analysis

- **Append-only holds visually:** after publish, revision 1 is shown as `superseded` and
  revision 2 as `published` in the same history table — the old payload is still there, not
  overwritten.
- **Separation of duties is visible and enforced end-to-end:** the author's browser never
  reaches a successful approve; a second staff account completes it; the audit row names both.
- **Scope is shown with every result:** the report screen renders the `scopeNote` badge next to
  the row count; a `TST1`-scoped operator sees fewer rows than an org-wide one (API test) and
  the same badge text on screen.
- **Masked diffs only:** the audit viewer's expandable before/after render `beforeSafe` /
  `afterSafe` — the same masked JSON the API returns; there is no control that writes.
- All three new screens render without horizontal overflow at 390 / 820 / 1440 and right-to-left
  in Arabic (config editor).

## Deferred within STAGE-006 (noted, not silently dropped)

Folded into STAGE-007 (release hardening) or a later pass — none affect the stage's core
invariants:

- **`case` retry action** — `recovery_case` / `reconciliation_exception` already have
  list + resolve (STAGE-004); a `retry` that re-emits the outbox event / re-runs the reconcile
  is a small add on top.
- **Data-quality runner + SCREEN-OPS-039 panel** — lookup-completeness drift is already checked
  in `/health/ready`; orphan / referential checks + their panel are additive.
- **Fleet import wizard + maintenance schedule form (SCREEN-OPS-017..020)** — carried from
  STAGE-005's deferred list; `vehicle_block` model exists.
- **`pricing` / `product` / `location` config kinds** — the versioning engine is kind-agnostic;
  only `policy` has a domain validator + consumer wired so far. `rate_plan` (STAGE-002) remains
  the pricing implementation.
- **Scheduled-delivery recipient re-authorization at send time** — there is no scheduler process
  in this environment; the `report_schedule` row + `lastSkipReason` column are in place for it.

## Defects

D-006-1 … D-006-4 — see `defects.md`. All found and fixed within the stage. No open defects.
