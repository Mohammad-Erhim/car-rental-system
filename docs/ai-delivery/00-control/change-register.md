# Change Register

Append-only. One row per change request, in creation order. Never renumber or delete a row.

| CR ID           | Date       | Title                                                                                                                                                                                                                                 | Classification | Status                        | Affected layers                                                       | Record                                |
| --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| CR-20260907-001 | 2026-09-07 | Propagate Enhancement Program (STAGE-008..013) scope into Functional Requirements, UI/UX Design Plan, and SRS                                                                                                                         | Change Request | `DRAFT`                       | Functional Requirements, UI/UX Design Plan, SRS                       | `00-control/changes/CR-20260907-001/` |
| CR-20260908-001 | 2026-09-08 | Complete the deferred FR-ADM operations/admin scope (extras/protection, locations editor, unified search, customer-records + eligibility-restrictions + reversible-merge, template content + event-rules, reference-data usage count) | Change Request | `BUILT — awaiting acceptance` | Functional Requirements, UI/UX Design Plan, SRS, Code/Database, Tests | `00-control/changes/CR-20260908-001/` |

## Notes

**CR-20260907-001** — created during pipeline-adoption migration
`SESSION-20260907-185415-PIPELINE-ADOPTION` (`00-control/migrations/MIG-20260907-001/`) to make
pre-existing, real documentation drift traceable. See `baseline-alignment.md` and
`migrations/MIG-20260907-001/alignment-gap-register.md` for full evidence. It records a change
that was already implemented under direct user mandate
(`04-implementation/enhancement-program.md`) but never formally propagated to the specification
documents.

**CR-20260908-001** — raised by the Stage 7 audit (`S7-DEF-007`) to gather the deferred v1.0
FR-ADM operations/admin scope. The user gave **full authorization to build** (2026-09-08); Stage 7
then delivered **all items**, one at a time, each with an API spec + an e2e + FR/UI-UX-status +
`decision-list.md` propagation and a **named follow-up CR** for its deferred depth:

- D-1 extras & protection (FR-ADM-006, migration `0007`); D-2 customer records + eligibility
  restrictions (`0008`) + reversible merge (`0009`) (FR-ADM-001/002); D-3 locations &
  operating-hours editor (FR-ADM-007); D-4 template content editor + notification event rules
  (`0010`) (FR-ADM-011); D-5 outbox relay (`S7-DEF-002`); D-6 unified reservation + rental
  search (FR-ADM-003); `S7-DEF-006` reference-data usage counts (FR-ADM-008).

Status `BUILT — awaiting acceptance`: the code + tests + docs are in place; the CR moves to
`VERIFIED` then `CLOSED` after the user's acceptance stage-gate + the Phase-4 full `verify:all`.
See `00-control/changes/CR-20260908-001/verification.md` for the per-item evidence.
