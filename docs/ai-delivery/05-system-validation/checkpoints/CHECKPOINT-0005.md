# CHECKPOINT-0005 — Phase 3 fix loop batch 3: outbox + 2 FR-ADM slices + CR-20260908-001

- **Timestamp:** 2026-09-08
- **Repo:** branch `implementation`, base `1efea67`. ~24 modified + 8 new files (uncommitted) +
  `05-system-validation/` + `CR-20260908-001/`.
- **Stage status:** `IN_PROGRESS`. All defect repair done + verified. The two cleanly-bounded
  FR-ADM slices are built + verified. The rest is `CR-20260908-001` (`PROPOSED`) + `D-7`.

## Built + verified since CHECKPOINT-0004

### S7-DEF-002 — outbox relay (option a) — VERIFIED

`common/outbox/outbox-relay.ts` (new), 15 s `outbox-relay` worker job, `outbox_backlog` gauge
(metrics + readiness refresh), `test/outbox.spec.ts` 4/4. Worker runtime-verified.

### D-4 — notification-template editor (content half) — BUILT + VERIFIED

- `apps/api/src/modules/notify/template.service.ts` + `TemplateController` in `notify.module.ts`
  — `GET /ops/templates` (grouped, per-locale status, missing-locale flags), `.../:key/:channel/:locale`,
  `.../:key/:channel/readiness`, `POST .../draft` (structural gate), `.../preview`, `.../:id/submit`,
  `.../:id/publish` (publish gate: required legal vars must appear; version bump + supersede;
  emits `notify.template.published.v1`).
- `apps/web/src/surfaces/ops/templates-page.tsx` + hooks + route `/ops/config/templates` + nav +
  41 i18n keys (en/ar/fr).
- `test/template.spec.ts` 7/7. e2e in `report.spec.ts`.

### D-2 — customer records (read side) — BUILT + VERIFIED

- `apps/api/src/modules/customer/{customer.service,customer.module}.ts` — `GET /ops/customers?q=`
  (min-2, masked list, restriction badge), `GET /ops/customers/:id` (consolidated: contact,
  drivers, reservations, rentals, balance, open cases, active `customer_restriction` rows).
  `customer.read` gates both.
- `apps/web/src/surfaces/ops/customers-page.tsx` + hooks + route `/ops/customers` + nav + i18n.
- `apps/api/src/database/seed/test.ts` — now creates a `customer` profile row.
- `test/customer.spec.ts` 5/5. e2e in `report.spec.ts`.

### S7-Q-014 (partial)

- `traceability-matrix.md` — header warning; FR-ADM-001/006/007 rows re-stated `PARTIAL` with
  the real picture; a "Stage 7 delivery-status appendix" added (FR-ADM-001/002/003/006/007/008/011).
- `CR-20260907-001/verification.md` — "e2e green" line corrected.
- `SCREEN-CUS-*` path-column refresh — still pending.

### CR-20260908-001 (new, `PROPOSED`)

`request.md` + `impact-analysis.md` + stubs; `change-register.md` + `baseline-alignment.md` note.
Gathers D-1 (extras/protection), D-3 (locations editor), D-6 (unified search), the write-side
halves of D-2/D-4, and `S7-DEF-006` for a per-item build-vs-scope-out decision.

## Gate status

`static` ✓ (openapi 112) · `i18n` ✓ **822** · `theme` ✓ · `unit` ✓ 89 · **`api` ✓ 119** (clean
re-run — the prior run's `rental.spec` failure was a transient PG connection-kill under concurrent
load) · `migrate` ✓ 4 · `security` ✓ 13 · `seo` ✓ · `e2e` full ✓ (pre-D2/D4); **ops e2e
`report`+`smoke` re-run in flight** (`bnvr3t9ri`) · `a11y` / `perf` baseline ✓, Phase-4 re-sweep.

## Fix + build ledger (uncommitted)

| ID                                                | Status                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| S7-DEF-001                                        | FIXED                                          |
| S7-DEF-002                                        | VERIFIED                                       |
| S7-DEF-003                                        | VERIFIED                                       |
| S7-DEF-004 p1                                     | VERIFIED                                       |
| S7-DEF-005                                        | VERIFIED                                       |
| S7-OPT-001                                        | IMPLEMENTED                                    |
| D-2 read side                                     | BUILT + `customer.spec` 5 + `verify:api` 119   |
| D-4 content half                                  | BUILT + `template.spec` 7 + `verify:api` 119   |
| S7-DEF-006 / D-1 / D-3 / D-6 / D-2·D-4 write side | → `CR-20260908-001` (`PROPOSED`)               |
| D-7                                               | user acceptance of `CR-20260907-001` v1.1 docs |

## Exact next action

1. Read `bnvr3t9ri` (ops e2e) result; fix any UI test issue.
2. Finish `S7-Q-014` path refresh; full `verify:all` (or a11y/perf re-sweep with the 2 new screens).
3. `final-report.md`: `RELEASE-READY` for the built + verified scope; `BLOCKED` for full FR sign-off
   on `CR-20260908-001` + `D-7`.
4. Update `pipeline-state.md` (Stage 07 `IN_PROGRESS` — audit + repair done, scope-completion CR
   open), session `checkpoint.md` / `session-state.md`.

## Resume order

`README.md` → `current-state.md` → `work-queue.md` → `decision-list.md` → `defects.md` →
`cr-reconciliation.md` → `00-control/changes/CR-20260908-001/request.md` → this file.
Datastores: `DEV_UP_FORCE_NATIVE=1 pnpm dev:up`.
