# Pipeline State — Car Rental System

Reconstructed by migration `MIG-20260907-001` from durable file evidence (no prior `pipeline-state.md` existed). See `00-control/migrations/MIG-20260907-001/baseline-reconstruction.md` for full reasoning.

| Stage | Prompt | Status | Latest session | Latest artifact |
|---|---|---|---|---|
| 1 — Functional Requirements | `01_CREATE_FUNCTIONAL_REQUIREMENTS.md` | `COMPLETED` | unknown (pre-dates session protocol; no session record exists) | `functional-requirements-v1.0.md` |
| 2 — Score & Refine Functional Requirements | `02_SCORE_AND_REFINE_FUNCTIONAL_REQUIREMENTS.md` | `SKIPPED_BY_USER` | unknown (pre-dates session protocol) | none — `ui-ux-design-plan-v1.0.md` §1 records "Stage 2 explicitly skipped by user"; `srs-v1.0.md` §1.1 records "Phase 2 ... scoring were skipped by explicit user direction" |
| 3 — UI/UX Design and Flow Plan | `03_CREATE_UI_UX_DESIGN_PLAN.md` | `COMPLETED` | unknown (pre-dates session protocol) | `ui-ux-design-plan-v1.0.md` |
| 4 — Score & Refine UI/UX Design Plan | `04_SCORE_AND_REFINE_UI_UX_DESIGN_PLAN.md` | `SKIPPED_BY_USER` | unknown (pre-dates session protocol) | none — `srs-v1.0.md` §1.1 records "Phase 4 scoring ... skipped by explicit user direction" |
| 5 — Create SRS | `05_CREATE_SRS.md` | `COMPLETED` | unknown (pre-dates session protocol) | `srs-v1.0.md` (status: "Implementation-ready baseline") |
| 6 — Implement System | `06_IMPLEMENT_SYSTEM.md` | `NOT_STARTED` | `SESSION-20260907-1839xx-STAGE-06` (successor session, `RECOVERY_REQUIRED`) | none — no source code, package manifest, database migration, or test suite exists anywhere in the repository |
| 7 — Audit, Test, Fix, and Harden | `07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md` | `NOT_STARTED` | none | none — cannot start before Stage 6 produces an implementation. The legacy prompt library did not even include a Stage 7 prompt. |

## Confidence note

Stages 1, 3, and 5 are marked `COMPLETED` on the strength of an accepted, versioned, internally-consistent document existing on disk with a header explicitly claiming baseline/implementation-ready status, cross-referenced by the next stage's document. No chat history or session record survives from when they were produced (they pre-date the session protocol entirely), so their *process* (e.g., exact review steps taken) is `UNKNOWN`, but their *output* is treated as the accepted baseline per the attached README's rule that saved artifacts and repository state — not chat history — are the source of truth.
