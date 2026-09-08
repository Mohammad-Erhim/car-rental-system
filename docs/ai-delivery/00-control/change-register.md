# Change Register

Append-only. One row per change request, in creation order. Never renumber or delete a row.

| CR ID           | Date       | Title                                                                                                         | Classification | Status  | Affected layers                                 | Record                                |
| --------------- | ---------- | ------------------------------------------------------------------------------------------------------------- | -------------- | ------- | ----------------------------------------------- | ------------------------------------- |
| CR-20260907-001 | 2026-09-07 | Propagate Enhancement Program (STAGE-008..013) scope into Functional Requirements, UI/UX Design Plan, and SRS | Change Request | `DRAFT` | Functional Requirements, UI/UX Design Plan, SRS | `00-control/changes/CR-20260907-001/` |

Created during pipeline-adoption migration `SESSION-20260907-185415-PIPELINE-ADOPTION`
(`00-control/migrations/MIG-20260907-001/`) to make pre-existing, real documentation drift
traceable. See `baseline-alignment.md` and
`migrations/MIG-20260907-001/alignment-gap-register.md` for full evidence. This CR was not
created by the migration to authorize new work — it records a change that was already
implemented under direct user mandate (`04-implementation/enhancement-program.md`) but never
formally propagated to the specification documents.
