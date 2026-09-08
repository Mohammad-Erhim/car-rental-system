# Baseline Alignment

Reconstructed 2026-09-07 by migration `SESSION-20260907-185415-PIPELINE-ADOPTION`. States are
evidence-backed, not optimistic. Valid states: `ALIGNED`, `UPDATE_REQUIRED`, `IN_PROGRESS`,
`BLOCKED`, `NOT_APPLICABLE`. **Updated 2026-09-08** — the enhancement program's implementation
is complete (STAGE-009..013 residuals + the STAGE-005/006 deferred features) and v1.1 amendment
documents are drafted for FR / UI-UX / SRS; formal acceptance and the `ALIGNED` transition
remain a Stage-gate / Stage-7 decision.

| Layer                       | Version/Revision                                                      | Included CR IDs                                                  | Alignment Status                                                                                                                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional Requirements     | v1.0 + **v1.1 amendment drafted** (`functional-requirements-v1.1.md`) | `CR-20260907-001` (propagation drafted, not yet accepted)        | `IN_PROGRESS`                                                                                                                                                              | v1.1 amendment adds FR-BRD-_ (branding/theming), FR-SEO-_ (public-site SEO), FR-IAM-009 (step-up), resolves the deferred §14 decisions, and carries a delivery-status appendix for the FR IDs the enhancement program implemented. Moves to `ALIGNED` on acceptance.                                                                                                                                                                                                                                                                                                                    |
| UI/UX Design                | v1.0 + **v1.1 amendment drafted** (`ui-ux-design-plan-v1.1.md`)       | `CR-20260907-001`                                                | `IN_PROGRESS`                                                                                                                                                              | v1.1 amendment adds SCREEN-OPS-040..044 (branding editor, SEO settings, languages admin, recovery & reconciliation, data quality) + SCREEN-SHARED-STEP-UP, the `apps/site` surface, and the `DataTable`/command-palette/breadcrumb ops contract. Moves to `ALIGNED` on acceptance.                                                                                                                                                                                                                                                                                                      |
| SRS                         | v1.0 + **v1.1 amendment drafted** (`srs-v1.1.md`)                     | `CR-20260907-001`                                                | `IN_PROGRESS`                                                                                                                                                              | v1.1 amendment adds SRS-SITE-_ (Next.js customer surface + SEO + perf), SRS-BRAND-_ (`branding`/`seo` config kinds + asset upload), SRS-SEC-018 (step-up), the SRS-UI-011 `DataTable` extension, and extends §18.2 with STAGE-009..013. Moves to `ALIGNED` on acceptance.                                                                                                                                                                                                                                                                                                               |
| Code/Database/Configuration | branch `implementation` HEAD, clean working tree                      | implements `CR-20260907-001` intent; v1.1 docs now transcribe it | `IN_PROGRESS` → `ALIGNED` on v1.1 acceptance                                                                                                                               | Implementation is complete for the enhancement program and the STAGE-005/006 deferred features; `test:api` 101, `verify:static/unit/i18n/theme/seo/a11y` green, `verify:e2e` customer + ops flows green. The v1.1 amendments now describe what the code does.                                                                                                                                                                                                                                                                                                                           |
| Automated Tests             | `verify:all` suite                                                    | n/a                                                              | `IN_PROGRESS`                                                                                                                                                              | `verify:static / unit / i18n (+--strict) / theme / api (101) / migrate / seo / a11y` green. `verify:e2e` runs the ported customer + ops specs against the single-origin `apps/site` stack (green when `apps/site` is rebuilt against a running API — a stale/API-down site build bakes soft-404s for data-backed routes, see `srs-v1.1.md` SRS-SITE-001). `verify:perf` for `apps/site` scaffolded (`perf-site.mjs`), not yet part of a recorded evidence run. Firefox/WebKit E2E, k6 write-path load, ZAP, SAST remain environment-blocked (need a staged multi-instance deploy / CI). |
| Stage 7 Validation          | none                                                                  | n/a                                                              | `NOT_APPLICABLE` — no independent Stage 7 report has run under this pipeline pack. The v1.1 amendments and the green `verify:*` suites are inputs to it, not a substitute. |

## Reading this table

`CR-20260907-001` is still `DRAFT`. The v1.1 amendment documents drafted on 2026-09-08
(`functional-requirements-v1.1.md`, `ui-ux-design-plan-v1.1.md`, `srs-v1.1.md`) are **path 1**
of the CR's `plan.md` — a dedicated backfill of documentation for already-shipped, tested
behaviour. They renumber and reinterpret nothing in v1.0. Formal acceptance of v1.1, moving
these rows to `ALIGNED`, and the independent Stage-7 four-way audit remain for the user at the
next stage gate (the CR's `plan.md` path 2). No behaviour changed to produce the amendments;
the `verify:*` suites were re-run green.

## Stage 7 note (2026-09-08 — `SESSION-20260907-185500-STAGE-07`)

Stage 7 started and is `IN_PROGRESS` (`AWAITING_USER_DECISION`). It **verified** the v1.1
amendment drafts are accurate for the Enhancement-Program scope, but found the alignment is **not**
yet complete:

- `verify:e2e` was **RED** at `1efea67` (`S7-DEF-003` — a stale test; the "e2e green" line in
  `CR-20260907-001/verification.md` pre-dated the SCREEN-OPS-002 commit). Fixed + re-verified green.
- `04-implementation/traceability-matrix.md` **over-claims** `COMPLETED` for FR-ADM-001/002/006/007
  (mapped to unrelated or partial features) and carries stale pre-STAGE-011 customer paths
  (`S7-DEF-007`). "Code/Database" alignment cannot read `ALIGNED` until these are corrected and the
  unbuilt FR-ADM surfaces (`05-system-validation/decision-list.md` D-1..D-6) are resolved
  (built or an accepted scoped-out CR amendment).
- Stage 7 applied 5 code/test fixes (S7-DEF-001/003/004p1/005 + S7-OPT-001), **uncommitted**; the
  SRS v1.1 draft should also record the `openapi:check` gate and the `extraCodes` contract shape.

Rows stay `IN_PROGRESS`. They move to `ALIGNED` when Stage 7 closes (`05-system-validation/final-report.md`
non-DRAFT + `verify:all` green + the v1.1 docs accepted).

## Stage 7 update 2 (2026-09-08 — batch 3)

Stage 7 built the cleanly-bounded FR-ADM slices autonomously ("continue with best practices"):

- **FR-ADM-011 / SCREEN-OPS-033** — notification-template editor (content half): `TemplateService`
  - `/api/v1/ops/templates*` + `/ops/config/templates`. `template.spec` 7. Event-rules half → `CR-20260908-001`.
- **FR-ADM-001/002 / SCREEN-OPS-021/022** — customer records read side: `CustomerModule` +
  `GET /ops/customers[?q=|/:id]` + `/ops/customers`. `customer.spec` 5. Merge + restriction
  write-workflow → `CR-20260908-001`.
- `S7-DEF-002` outbox relay fixed.

**`CR-20260908-001`** gathered the remaining deferred FR-ADM scope.

## Stage 7 update 3 (2026-09-08 — `CR-20260908-001` full build)

The user gave full authorization to build; **all `CR-20260908-001` items are delivered**:

- **D-1** FR-ADM-006 / SCREEN-OPS-027 / SCREEN-CUS-005 — `product` catalogue + authoritative
  booking-time pricing + ops screen + `apps/site` checkout extras step (migration `0007`).
- **D-2** FR-ADM-001/002 — customer records; **eligibility restrictions** write side
  (`pending_review`→`active`→`lifted`, author≠approver, enforced in `booking.confirm()`,
  migration `0008`); **reversible merge** (`customer_merge`, archive-not-delete, `unmerge`,
  migration `0009`).
- **D-3** FR-ADM-007 / SCREEN-OPS-028 — locations & operating-hours editor (hours / instructions
  / holiday exceptions / archive with future-reservation impact check).
- **D-4** FR-ADM-011 / SCREEN-OPS-033 — template content editor + **event rules**
  (`notification_rule`; `notify.send()` applies the enable gate + sender, migration `0010`).
- **D-5** `S7-DEF-002` outbox relay. **D-6** FR-ADM-003 / SCREEN-OPS-004 unified search.
  **`S7-DEF-006`** FR-ADM-008 real reference-data usage counts.

Each item's deferred depth (config-version governance / timing scheduler / duplicate detection /
one-way-route pricing …) is recorded as a follow-up CR in `decision-list.md` +
`CR-20260908-001/verification.md`. `traceability-matrix.md` FR-ADM rows re-stated + delivery
appendix + `SCREEN-CUS-*` old→new path map added (`S7-Q-014` docs complete).

**Gates:** `verify:static` (openapi 134) + `verify:i18n` (968) + `verify:unit` (89) green;
targeted `verify:api` green per feature; `report` e2e 9/9 + `booking` 3/3 + `auth-and-reference`
5/5 on laptop. Full single-run `verify:api` + full 3-viewport `verify:e2e` → Phase 4 (host RAM).

Code/Tests rows stay `IN_PROGRESS`. They move to `ALIGNED` when `CR-20260907-001` is accepted
(`D-7`), the `CR-20260908-001` acceptance stage-gate passes, and the Phase-4 full `verify:all`
runs clean on a host with headroom / in CI.
