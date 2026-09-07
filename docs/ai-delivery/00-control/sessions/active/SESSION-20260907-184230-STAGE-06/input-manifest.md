# Input Manifest — SESSION-20260907-184230-STAGE-06

## Canonical accepted baselines (imported from migration `MIG-20260907-001`)

| Layer | Path | Version | SHA-256 |
|---|---|---|---|
| Functional Requirements | `functional-requirements-v1.0.md` (repo root) | 1.0 | `02bf737d41d727db4de7b9e4d53c0ffdec094c8be5eba1c72238dbe94b725eb3` |
| UI/UX Design and Flow Plan | `ui-ux-design-plan-v1.0.md` (repo root) | 1.0 | `a0a8d184d025c4acad863152a51644fc4433b9241bdb633a95c9088068df7c67` |
| SRS | `srs-v1.0.md` (repo root) | 1.0 | `b8eb084f421d6b6a77c21832969981cbff59301a2e07e079ce6baf3d0de97bbd` |
| Stage 6 prompt to follow | `docs/ai-delivery/prompt-library/current/06_IMPLEMENT_SYSTEM.md` | installed copy, hash-verified against attached source | `5f1d63e0fc2574b439e97385eb66a640000fe57ed2756f828019f5d64ce2020d` |

Before trusting the table above, re-verify each hash against the file currently on disk — if the repository has changed since this session was created, treat any mismatch as `UNRECONCILED_WORK` per `docs/ai-delivery/README.md`'s new-chat startup behavior, not as a reason to proceed blindly.

## Imported legacy history/evidence links

- `docs/ai-delivery/00-control/migrations/MIG-20260907-001/` — full migration record explaining how the baseline above was reconstructed.
- `docs/ai-delivery/00-control/sessions/completed/SESSION-20260907-183834-PIPELINE-ADOPTION/` — the migration session itself, once moved to `completed/`.
- Stage 2/4 skip evidence: `ui-ux-design-plan-v1.0.md` §1 and `srs-v1.0.md` §1.1 (quoted in `alignment-gap-register.md`).

## Repository revision and changed/untracked snapshot

Captured at migration hand-off; see the migration session's `recovery-snapshot.md` for the exact before/after state. No untracked files existed before or after the migration's additive commit.

## Exact implemented/partial/unverified scope

- Completed IDs: **none**.
- Remaining IDs: the complete FR/APP/SCREEN/FLOW/STATE/SRS/API/DATA/TEST ID space defined across FR v1.0, UI/UX v1.0, and SRS v1.0 (104+ FR IDs across `APP-CWEB`, `APP-CMOB`, `APP-OPS` per the UI/UX document's own count).

## Open CR/spec-gap/defect/alignment items

- G1 (`SPECIFICATION_GAP`, non-blocking): missing `00-input/project-brief-v1.0.md` provenance file. See `alignment-gap-register.md`.
- No open CRs (`change-register.md` is empty).

## Affected dependencies and stale evidence

None — no implementation exists yet, so nothing can be stale relative to it.

## Last safe commands/results

The migration session's file-creation and hash-verification commands (see `SESSION-20260907-183834-PIPELINE-ADOPTION/checkpoint.md`). No build/run/test command has been executed yet, and none was applicable (no package manifest exists).

## Exact next safe action

Begin Stage 6 using `docs/ai-delivery/prompt-library/current/06_IMPLEMENT_SYSTEM.md`.
