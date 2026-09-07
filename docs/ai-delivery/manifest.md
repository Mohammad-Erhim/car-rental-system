# AI Delivery Manifest — Car Rental System

Authoritative pointer to the latest **accepted** version of every pipeline layer. Never determine "latest" by filename sorting or modification time alone — see `00-control/migrations/MIG-20260907-001/baseline-reconstruction.md` for how each row below was derived.

| Layer | Canonical path | Version | Status | SHA-256 | Notes |
|---|---|---|---|---|---|
| Project brief / input baseline | *not found in repository* | — | `MISSING` | — | `functional-requirements-v1.0.md` cites a source brief at `00-input/project-brief-v1.0.md`, but no such file, and no `00-input/` directory, exists anywhere in the repository or git history. Informational gap only — see `alignment-gap-register.md`. Does not block Stage 6. |
| Functional Requirements | `functional-requirements-v1.0.md` (repo root) | 1.0 | `ACCEPTED_UNSCORED` | `02bf737d41d727db4de7b9e4d53c0ffdec094c8be5eba1c72238dbe94b725eb3` | Header status: "Draft baseline for independent scoring." Stage 2 scoring was explicitly skipped by the user (evidence recorded in downstream documents; see below). Treated as the accepted baseline per `00_README.md`'s rule that a "No" refine answer means "preserve the document and proceed." |
| UI/UX Design and Flow Plan | `ui-ux-design-plan-v1.0.md` (repo root) | 1.0 | `ACCEPTED_UNSCORED` | `a0a8d184d025c4acad863152a51644fc4433b9241bdb633a95c9088068df7c67` | Its own header states: "Functional source status: Accepted unscored; Stage 2 explicitly skipped by user." Stage 4 scoring was likewise explicitly skipped by the user (evidence in SRS document, see below). |
| Software Requirements Specification (SRS) | `srs-v1.0.md` (repo root) | 1.0 | `ACCEPTED` | `b8eb084f421d6b6a77c21832969981cbff59301a2e07e079ce6baf3d0de97bbd` | Header status: "Implementation-ready baseline." States explicitly: "Phase 2 and Phase 4 scoring were skipped by explicit user direction... both version 1.0 inputs are treated as accepted, unscored sources." |
| Implementation source revision / control state | *no application source exists* | — | `NOT_STARTED` | n/a | No package manifest, source tree, database migration, or test suite exists anywhere in the repository at commit `514ae21ad3e18b44427a91ea3a008100fdde0882` (the branch HEAD at migration time). Stage 6 has not begun. |
| Stage 7 validation report | *does not exist* | — | `NOT_STARTED` | n/a | Cannot start until Stage 6 produces an implementation to audit. The prior (legacy) prompt library did not even contain a Stage 7 prompt. |
| Active approved change set | none | — | `NONE` | n/a | `00-control/change-register.md` is empty; no CR has been opened. |

## Non-canonical / legacy artifact note

The recommended structure in `docs/ai-delivery/README.md` shows requirements/design/SRS documents nested under `01-functional-requirements/`, `02-ui-ux-design/`, `03-srs/`. This migration deliberately **left the three accepted documents at their existing repository-root paths** rather than moving them, to avoid an unforced reorganization of the legacy project's file layout (see Decision D1 in the migration session's `decisions.md`). This manifest's canonical paths reflect their real, current locations. A future stage may relocate them under a formal Change Request if the user wants the recommended layout adopted.

## Legacy prompt-library note

A pre-existing `prompts/` directory at the repository root (Stages 00–06 only, missing Stage 07, without the session/change-control protocol) is superseded by `docs/ai-delivery/prompt-library/current/` but has been left in place unmodified. See `00-control/migrations/MIG-20260907-001/legacy-prompt-inventory.md`.
