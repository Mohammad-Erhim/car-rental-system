# Pipeline State

Authoritative, verified pipeline status. Reconstructed 2026-09-07 during pipeline-adoption
migration `SESSION-20260907-185415-PIPELINE-ADOPTION`
(`00-control/migrations/MIG-20260907-001/`). Never inferred from filename sorting alone —
statuses below are backed by `manifest.md`, `04-implementation/*`, and repository/git evidence.

| Stage                      | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Latest session (legacy convention)                                            | Latest artifact                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 01 Functional Requirements | `COMPLETED` (see note A)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | none (predates new session protocol)                                          | `01-functional-requirements/functional-requirements-v1.0.md`                                                                    |
| 02 Score/Refine FR         | `COMPLETED` — `SKIPPED_BY_USER` (per `manifest.md`: "Skipped by user")                                                                                                                                                                                                                                                                                                                                                                                                                            | none                                                                          | n/a — no audit file exists under `01-functional-requirements/audits/`                                                           |
| 03 UI/UX Design Plan       | `COMPLETED` (see note A)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | none                                                                          | `02-ui-ux-design/ui-ux-design-plan-v1.0.md`                                                                                     |
| 04 Score/Refine UI/UX      | `COMPLETED` — `SKIPPED_BY_USER` (per `manifest.md`: "Skipped by user")                                                                                                                                                                                                                                                                                                                                                                                                                            | none                                                                          | n/a — no audit file exists under `02-ui-ux-design/audits/`                                                                      |
| 05 SRS                     | `COMPLETED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                                                          | `03-srs/srs-v1.0.md`                                                                                                            |
| 06 Implement System        | `COMPLETED` for the roadmap scope (STAGE-000..007) **plus** an unversioned scope extension (STAGE-008..013, "Enhancement Program") delivered under the same stage without a formal CR — see note B                                                                                                                                                                                                                                                                                                | none (predates new session protocol; legacy "Session 01" in `session-log.md`) | working tree at current git revision (branch `implementation`, clean; see `migrations/MIG-20260907-001/repository-snapshot.md`) |
| 07 Audit/Test/Fix/Harden   | `IN_PROGRESS` — started 2026-09-08 (`SESSION-20260907-185500-STAGE-07`). Phases 0–2 done; Phase 3: `S7-DEF-001..006` fixed (+ `S7-OPT-001`), `verify:e2e` was RED on a clean checkout and is now green. User authorized the full `CR-20260908-001` build — **all items delivered** (D-1..D-6 + write-side halves; migrations `0007`–`0011`; openapi 134; i18n 968). Phase 4 (deep audit + full `verify:all` + report) + sign-off pending, plus `D-7` (accept `CR-20260907-001` v1.1). See note C. | `SESSION-20260907-185500-STAGE-07`                                            | `05-system-validation/` (workspace, `final-report.md` = DRAFT/`IN_PROGRESS`, `CHECKPOINT-0008.md`)                              |

## Note A — Stages 1 & 3 unscored by explicit user choice

`manifest.md` records Stage 1 and Stage 3 as "Accepted (unscored)" with Stage 2/4 "Skipped by
user." This migration treats that as a valid, evidenced `SKIPPED_BY_USER` decision, not a gap to
silently re-run. If the user wants Stage 2/4 scoring performed now, that is a separate, explicit
follow-up request — this migration does not perform it (out of the migration boundary).

## Note B — Enhancement Program scope extension

STAGE-008 through STAGE-013 (project-local numbering; see
`04-implementation/enhancement-program.md`) added material product scope beyond SRS v1.0:
system-wide theming/branding, a complete i18n architecture (en/ar/fr), a new Next.js public site
(`apps/site`) replacing the customer half of `apps/web`, full technical SEO, and an operations
dashboard UX overhaul. This was executed under direct user mandate but **without** the formal
CR → FR → Design → SRS propagation this new pipeline pack requires. It is registered as
`CR-20260907-001` (draft) in `00-control/changes/CR-20260907-001/` and reflected as
`UPDATE_REQUIRED` in `baseline-alignment.md`. See
`migrations/MIG-20260907-001/alignment-gap-register.md` for full evidence.

## Note C — Stage 7 status

**Started 2026-09-08** (`SESSION-20260907-185500-STAGE-07`, prompt
`07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md`). The `docs/ai-delivery/05-system-validation/` workspace
now exists — inventories (application/role, screen ×63, interface/job, database/lookup, flow),
`coverage`/`work-queue`/`decision-list`/`cr-reconciliation`/`final-report` (DRAFT), 5 checkpoints,
and evidence.

**Phases 0–2 done.** Phase 0 re-ran every gate from a clean checkout and found `verify:e2e`
**RED** at `1efea67` (`S7-DEF-003` — a stale `smoke.spec.ts` assertion after the SCREEN-OPS-002
dashboard commit; the implementation stage's "e2e 91 green" pre-dated it). Phase 1 reconciled the
63 design screens and surfaced that several v1.0 **FR-ADM** operations/admin surfaces were never
built while `traceability-matrix.md` over-claimed 4 of them `COMPLETED` (`S7-DEF-007`).

**Phase 3 (in progress):** defect batch fixed + verified — `S7-DEF-001` (stale `openapi.json` +
`openapi:check` gate), `S7-DEF-002` (transactional outbox was write-only → relay + prune + gauge),
`S7-DEF-003` (`verify:e2e` unblocked), `S7-DEF-004` **fully resolved** (booking trusted
client-supplied extra prices → codes-only + server-priced against a real `product` catalogue,
see D-1), `S7-DEF-005` (persistent-login lost on browser restart → `localStorage`), `S7-OPT-001`
(one dev DB password).

**`CR-20260908-001` — user authorized the full build (2026-09-08); built autonomously with API +
e2e tests + doc propagation, one item at a time. All build items are delivered:**

- **D-1** extras & protection (FR-ADM-006) — `product` table + authoritative pricing + ops
  screen + `apps/site` checkout step (migration `0007`).
- **D-2** customer records — search + consolidated record; **eligibility restrictions**
  (`pending_review`→`active`→`lifted`, author≠approver, enforced in `booking.confirm()` → 422
  `customer_restricted`, migration `0008`); **reversible merge** (`customer_merge`, archive-not-
  delete, `unmerge`, migration `0009`). FR-ADM-001/002.
- **D-3** locations & operating-hours editor (FR-ADM-007) — hours / instructions / after-hours /
  holiday exceptions / archive with a future-reservation impact check.
- **D-4** notification templates — content editor + **event rules** (`notification_rule`:
  enable / audience / delay / quiet-hours / retry / escalate / sender; `notify.send()` applies
  the enable gate + sender, migration `0010`). FR-ADM-011.
- **D-5** outbox relay (option a). **D-6** unified reservation + rental search (`GET /ops/search`,
  FR-ADM-003). **`S7-DEF-006`** real reference-data usage counts + in-use deactivation guard
  (FR-ADM-008).

Each item's deferred depth (governance/scheduler/detection layers) is recorded as a follow-up CR
in `decision-list.md` + `CR-20260908-001/verification.md`. openapi 134 paths, i18n 968 keys.

**Committed 2026-09-08 (user request):** the whole Stage 7 delta is `56e3b64`
(`feat(STAGE-07): audit/test/fix/harden pass — CR-20260908-001 FR-ADM build + 6 defect fixes`,
126 files), pushed to `origin/implementation`. Screenshot evidence PNGs were not committed
(regenerable; `S7-OPT-003`). Committing does not change the stage status — it stays `IN_PROGRESS`
until sign-off.

**Blocking sign-off:** `D-7` (accept the `CR-20260907-001` FR/UI-UX/SRS v1.1 amendment
documents), the `CR-20260908-001` acceptance stage-gate, and Phase 4 completion (deep audit +
clean full `verify:all` + `final-report.md` non-DRAFT). Environment-blocked items (Firefox/WebKit
E2E, k6, ZAP/SAST, Lighthouse field run) are `BLOCKED`, not downgraded.
