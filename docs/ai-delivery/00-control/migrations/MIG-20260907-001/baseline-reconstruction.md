# Baseline Reconstruction (Phase 5) — MIG-20260907-001

Evidence order used, per migration-task instructions: (1) explicit durable user acceptance/decision records → (2) authoritative manifest pointers with valid hashes → (3) internal document version/source cross-links → (4) implementation history/checkpoints → (5) repository/runtime evidence → (6) filenames/timestamps as supporting clues only. No layer below was decided by filename or mtime alone.

## Functional Requirements → v1.0

- No manifest existed yet (this migration creates the first one), so evidence order (2) is not available; fell back to (3): `ui-ux-design-plan-v1.0.md` and `srs-v1.0.md` both explicitly cite `functional-requirements-v1.0.md` version 1.0 as their functional source, and only one version of this file exists in the repository (no `v1.1`, `v2`, or duplicate). Header self-declares "Version 1.0."
- Accepted despite "Draft baseline for independent scoring" status wording, because the pipeline's own rule (`00_README.md`) is: a "No" answer to "Refine now?" means "preserve the document and proceed to the next pipeline stage" — and downstream documents' explicit "Stage 2 explicitly skipped by user" statement is exactly that durable decision record (evidence order (1)).

## UI/UX Design and Flow Plan → v1.0

- Same reasoning: `srs-v1.0.md` §1 cites `ui-ux-design-plan-v1.0.md` version 1.0 as its UI/UX source; only one version exists; downstream evidence (1) records "Phase 4 scoring... skipped by explicit user direction."

## SRS → v1.0

- Self-declared "Version 1.0," "Implementation-ready baseline." Only one version exists. No downstream document exists yet to cross-cite it (Stage 6 hasn't started), so this rests on evidence order (3)/(6): internal self-declaration plus the fact that it is the single, most-recently-added, internally coherent document with an explicit "implementation-ready" status claim — consistent with, not solely determined by, its later commit timestamp.

## Implementation roadmap/history → none

- No implementation history exists (evidence order (5): repository inspection found zero source files of any kind).

## Source code/schema/configuration revision → none

- Same finding; commit `514ae21ad3e18b44427a91ea3a008100fdde0882` is the current HEAD and contains no application code.

## Tests and validation evidence → none

- Same finding; `srs-v1.0.md` §22 is a specification of a *future* test strategy, not evidence of tests having been run.

## Ambiguity handling

No competing/duplicate candidate documents were found for any layer (each of FR/UI-UX/SRS exists in exactly one version), so the "preserve every candidate, ask only if it changes the resume stage" procedure was not needed. No user question was required for baseline reconstruction.
