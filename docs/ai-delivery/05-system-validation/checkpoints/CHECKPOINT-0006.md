# CHECKPOINT-0006 — D-2 + D-4 e2e-verified; autonomous stretch complete

- **Timestamp:** 2026-09-08
- **Repo:** branch `implementation`, base `1efea67`. ~29 code/config files modified + 8 new +
  `05-system-validation/` + `CR-20260908-001/`. Uncommitted.
- **Stage status:** `IN_PROGRESS`. All defect repair + the 2 bounded FR-ADM slices done and
  **verified end-to-end**. Remaining = `CR-20260908-001` (per-item decision) + `D-7`.

## This interval — D-2/D-4 e2e fixes

The API specs (`template.spec` 7, `customer.spec` 5) were green from the start; the e2e run
surfaced 4 UI-layer issues, all fixed:

1. `ops.tpl.bodyHint` i18n string held a literal `{{variable}}` → `intl-messageformat`
   `MALFORMED_ARGUMENT` → the templates route crashed to the RouteError boundary. Reworded
   (no braces), 3 locales.
2. `report.spec` customer test: `getByRole('heading', { name: 'Customers' })` strict-mode
   violation (matched `<h1>` + `<h3>Search customers`). → `exact: true`.
3. `report.spec` template test assumed the seeded `reservation_confirmed` template had no
   declared vars — it has `reference` + `total`. Test body reworked to introduce only `{{terms}}`.
4. `TemplateService.get()` only returned `draft`/`published` rows → after **submit** (status →
   `in_review`) the editor fell back to the published row and the Publish button vanished. Fixed:
   `get()` treats `draft` **or** `in_review` as the open revision; `publish()` bumps past the max
   existing version (retired rows included). Also `templates-page.tsx`: the form re-sync + a
   `preview.reset()` moved off the `detail.data.id` effect (which fires on save → new draft row)
   onto the template-selection handler, so a save no longer wipes an in-flight preview.

## Verification

| Check                                                   | Result                                                                                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:static`                                         | **PASS** (openapi 112, `openapi:check` gate)                                                                                                                                       |
| `verify:i18n`                                           | **PASS** — 822                                                                                                                                                                     |
| `verify:unit`                                           | **PASS** — 89                                                                                                                                                                      |
| `verify:api`                                            | **PASS** — 119 (clean run; a concurrent-load run's `rental.spec` PG-kill was transient, green alone)                                                                               |
| `template.spec` + `customer.spec`                       | 7 + 5, re-run green after the `get()` fix                                                                                                                                          |
| `verify:e2e` `report` (laptop)                          | **5/5 PASS** — incl. `report.spec.ts:113` (D-4) and `:150` (D-2)                                                                                                                   |
| `verify:e2e` full (partial runs)                        | phone + tablet green for all pre-existing specs (`btwth6rm1`); laptop 13/14 (`by5x4ed47`, the 1 fail was the now-fixed D-4 test); `rental.spec` flaky-passes-on-retry on this host |
| `verify:migrate` / `security` / `seo` / `a11y` / `perf` | baseline green; Phase-4 re-sweep with the 2 new screens                                                                                                                            |

## Fix + build ledger (uncommitted)

`S7-DEF-001` FIXED · `S7-DEF-002` VERIFIED · `S7-DEF-003` VERIFIED · `S7-DEF-004` p1 VERIFIED ·
`S7-DEF-005` VERIFIED · `S7-OPT-001` IMPLEMENTED · **D-2 read side BUILT + e2e-VERIFIED** ·
**D-4 content half BUILT + e2e-VERIFIED** · `S7-DEF-006` / `D-1` / `D-3` / `D-6` / D-2·D-4
write-side halves → `CR-20260908-001` (`PROPOSED`) · `D-7` = user acceptance of `CR-20260907-001` v1.1.

## Blocking Stage 7 sign-off (user)

- **`CR-20260908-001`** — per-item build vs. scope-out for D-1 (extras/protection, money path),
  D-3 (locations editor), D-6 (unified search), + the write-side halves + `S7-DEF-006`.
- **`D-7`** — accept the `CR-20260907-001` FR / UI-UX / SRS v1.1 amendment documents.

## Exact next action (Phase 4, after the user's calls)

1. Per `CR-20260908-001`: build approved items → propagate FR/UI-UX/SRS → tests → traceability.
2. Finish `S7-Q-014` (`SCREEN-CUS-*` path refresh in `traceability-matrix.md`).
3. Deep per-branch audit over the full surface set incl. `/ops/customers` + `/ops/config/templates`;
   full `verify:all` green; fresh screenshot bundle.
4. `final-report.md` non-DRAFT for the verified scope; `pipeline-state.md` / `manifest.md` / move
   session to `completed/`.

## Resume order

`README.md` → `current-state.md` → `work-queue.md` → `decision-list.md` → `defects.md` →
`cr-reconciliation.md` → `00-control/changes/CR-20260908-001/request.md` → this file.
Datastores: `DEV_UP_FORCE_NATIVE=1 pnpm dev:up`.
