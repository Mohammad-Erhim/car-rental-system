# CR-20260907-001 — plan.md

**Status:** not yet planned in detail — this is a placeholder pending the approval decision
described in `request.md` and `resume-handoff.md`.

Two viable execution paths, either acceptable, to be decided by the user at the next stage gate:

1. **Dedicated backfill pass.** Run `01_CREATE_FUNCTIONAL_REQUIREMENTS.md` /
   `03_CREATE_UI_UX_DESIGN_PLAN.md` / `05_CREATE_SRS.md` (via their CR/change-control entry
   points, i.e. treating the enhancement program as `<OPTIONAL_USER_ADDITIONS>` /
   `<OPTIONAL_IMPLEMENTATION_INSTRUCTION>`) specifically to backfill v1.1 documentation for
   already-shipped behavior, in propagation order FR → Design → SRS, before Stage 7 runs.
2. **Reconciled during Stage 7.** Start `07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md`, which is
   explicitly authorized to detect code-ahead-of-documentation drift, open exactly this kind of
   CR itself, and propagate it to FR/Design/SRS as part of its four-way reconciliation — closing
   CR-20260907-001 as part of (not before) the Stage 7 gates.

`pipeline-state.md` / `resume-handoff.md` recommend path 2 (Stage 7 first) because Stage 7 is
independently required regardless of this CR (see `pipeline-state.md` note C), and its protocol
already contains the correct mechanism for closing exactly this kind of gap.
