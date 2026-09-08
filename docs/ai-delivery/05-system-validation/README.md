# Stage 7 — System Validation Workspace

Independent audit, test, fix, and hardening of the complete car-rental system.
Governing prompt: `docs/ai-delivery/prompt-library/current/07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md`.
Global session: `SESSION-20260907-185500-STAGE-07` (`00-control/sessions/active/`).

## Purpose

The implementation stage (STAGE-000..013 + the STAGE-005/006 deferred features) reports itself
complete with all `verify:*` gates green. Stage 7 does **not** trust that. It rebuilds a verified
inventory from specifications + source + runtime, tests the real running system across every
in-scope dimension, repairs every reproducible in-scope defect at the root cause, and repeats
until the Stage 7 completion gates in the governing prompt are satisfied.

This is a long-running execution-and-repair task, resumable in a fresh session from these files.

## Status vocabulary

- **Work-queue item:** `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `FIXING`, `RETESTING`, `COMPLETED`.
- **Coverage row:** `NOT_RUN`, `PASS`, `FAIL`, `BLOCKED`, `NOT_APPLICABLE` (with reason).
- **Defect:** `OPEN`, `IN_PROGRESS`, `FIXED`, `VERIFIED`, `WONT_FIX` (with reason), `DEFERRED` (with owner).
- **Optimization (`OPT-*`):** `PROPOSED`, `ACCEPTED`, `IMPLEMENTED`, `VERIFIED`, `REJECTED`, `BLOCKED`.
- **CR:** `PROPOSED`, `ANALYZING`, `AWAITING_DECISION`, `APPROVED`, `IN_PROGRESS`, `BLOCKED`, `VERIFIED`, `CLOSED`, `REJECTED`, `DEFERRED`.
- **Gate:** `PASS`, `FAIL`, `BLOCKED` (external dependency), `NOT_RUN`.

## ID conventions

| Prefix                                  | Meaning                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| `S7-Q-NNN`                              | Stage 7 work-queue item                                           |
| `S7-DEF-NNN`                            | Stage 7 defect (distinct from the implementation-stage `D-0NN-*`) |
| `S7-OPT-NNN`                            | Stage 7 optimization assessment                                   |
| `S7-GAP-NNN`                            | Specification gap needing a decision                              |
| `S7-CP-NNNN`                            | Stage 7 checkpoint                                                |
| `RT-SCREEN-*` / `RT-EL-*` / `RT-FLOW-*` | Runtime-discovered object with no design ID                       |
| `CR-YYYYMMDD-NNN`                       | Formal change request (shared with `00-control/`)                 |

## Evidence requirements

- Every `PASS` on a user-facing screen/flow needs a runtime artifact (screenshot, trace,
  network/console capture, DB query result, or machine-readable test report) under `evidence/`.
- Secrets, tokens, cookies, auth headers, and personal data are redacted from every artifact.
- No test password/token/cookie/connection secret is committed to any file in this tree.
- Screenshots are named `APP-SCREEN__ROLE__STATE__LOCALE__VIEWPORT__TEST-ID.png` or
  `FLOW-ID__STEP-NN__OUTCOME__TEST-ID.png`.

## Checkpoint policy

Write a checkpoint (`checkpoints/CHECKPOINT-NNNN.md`) after: environment+inventory init; each
coherent screen/flow cluster; before and after any shared/risky fix; each completed
application/surface; before an expected context boundary; immediately on a blocker; before final
regression. A checkpoint records verified facts only — never "planned" or "implemented but not
tested" as complete. Mirror each into the global session checkpoint.

## Resume reading order (fresh session)

1. Repository instructions; `docs/ai-delivery/README.md`; `manifest.md`.
2. `00-control/pipeline-state.md`, `active-session.md`, `baseline-alignment.md`, `change-register.md`, open CRs.
3. Global session `SESSION-20260907-185500-STAGE-07/` — state, input manifest, queue, checkpoint, decisions, change-log, artifact-index.
4. `04-implementation/` — README, source-manifest, current-state, roadmap, decisions, traceability, registries.
5. This `README.md`.
6. `audit-source-manifest.md`.
7. `current-state.md` and `work-queue.md`.
8. The inventories and `coverage-matrix.md` for the active queue item.
9. Open entries in `defects.md`, `optimization-register.md`, `decisions.md`.
10. Latest checkpoint under `checkpoints/`.
11. Source-document sections named by the active item's FR/SRS/SCREEN/FLOW/STATE/CR/TEST IDs.
12. `git status` / `git diff`, actual changed files, current schema/migrations/config, existing test results.
13. Runtime health: datastores, API health, browser automation, required sandboxes.

History is navigation, not proof. Re-run a small health/auth check before trusting a prior `PASS`.

## How completion is determined

Only when every applicable gate in the governing prompt's "Stage 7 completion gates" section
passes: full inventory/traceability reconciled; all in-scope functional/business/auth/UI-UX/
validation/data/technical branches pass; every approved in-scope CR `VERIFIED`/`CLOSED` and every
baseline-alignment row `ALIGNED`; every optimization resolved; no open in-scope defect; final
full regression green after the last fix. External-dependency blockers are reported as `BLOCKED`
with completed internal evidence, never downgraded.
