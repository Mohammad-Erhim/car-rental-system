# AI Delivery Pipeline — Prompt Library

This library turns a project brief into an implemented and independently validated system that can be resumed safely in a fresh AI session.

## Pipeline

1. `01_CREATE_FUNCTIONAL_REQUIREMENTS.md`
2. `02_SCORE_AND_REFINE_FUNCTIONAL_REQUIREMENTS.md` — repeat as needed
3. `03_CREATE_UI_UX_DESIGN_PLAN.md`
4. `04_SCORE_AND_REFINE_UI_UX_DESIGN_PLAN.md` — repeat as needed
5. `05_CREATE_SRS.md`
6. `06_IMPLEMENT_SYSTEM.md` — start, resume, or report status
7. `07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md` — independent full-system validation, repair, and hardening

The refinement prompts use a strict two-turn gate:

1. Score the current document before changing it.
2. Show the score, evidence, and important gaps.
3. Ask the user: **Refine now? Yes or No?**
4. Stop and wait.
5. Refine only after **Yes**. If the answer is **No**, preserve the document and proceed to the next pipeline stage.

The refined output is not automatically given an inherited or optimistic score. To decide whether to refine it again, run the same refinement prompt on the new version. That begins a new independent score-before-refine cycle.

## Recommended project artifact structure

The prompts use this structure when filesystem access is available:

```text
docs/ai-delivery/
├── README.md
├── manifest.md
├── CHANGELOG.md
├── 00-control/
│   ├── pipeline-state.md
│   ├── active-session.md
│   ├── baseline-alignment.md
│   ├── change-register.md
│   ├── sessions/
│   │   ├── active/
│   │   │   └── SESSION-YYYYMMDD-HHMMSS-STAGE-XX/
│   │   │       ├── session-state.md
│   │   │       ├── input-manifest.md
│   │   │       ├── work-queue.md
│   │   │       ├── checkpoint.md
│   │   │       ├── recovery-snapshot.md
│   │   │       ├── decisions.md
│   │   │       ├── change-log.md
│   │   │       ├── artifact-index.md
│   │   │       └── drafts/
│   │   ├── paused/
│   │   ├── completed/
│   │   └── abandoned/
│   └── changes/
│       └── CR-YYYYMMDD-NNN/
│           ├── request.md
│           ├── impact-analysis.md
│           ├── plan.md
│           └── verification.md
├── 00-input/
│   └── project-brief-v1.0.md
├── 01-functional-requirements/
│   ├── functional-requirements-v1.0.md
│   └── audits/
├── 02-ui-ux-design/
│   ├── ui-ux-design-plan-v1.0.md
│   └── audits/
├── 03-srs/
│   └── srs-v1.0.md
├── 04-implementation/
│   ├── README.md
│   ├── source-manifest.md
│   ├── selected-scope.md
│   ├── dependency-map.md
│   ├── implementation-roadmap.md
│   ├── current-state.md
│   ├── decisions.md
│   ├── traceability-matrix.md
│   ├── session-log.md
│   └── stages/
│       └── STAGE-001-short-name/
│           ├── plan.md
│           ├── checkpoint.md
│           ├── test-evidence.md
│           ├── defects.md
│           └── screenshots/
└── 05-system-validation/
    ├── README.md
    ├── audit-source-manifest.md
    ├── environment-matrix.md
    ├── screen-inventory.md
    ├── ui-element-inventory.md
    ├── field-validation-matrix.md
    ├── flow-inventory.md
    ├── coverage-matrix.md
    ├── work-queue.md
    ├── current-state.md
    ├── defects.md
    ├── checkpoints/
    └── evidence/
```

`manifest.md` is the authoritative pointer to the latest accepted versions. Never determine “latest” by filename sorting alone.

## Mandatory session-continuity protocol

Every one of the seven stages must use `docs/ai-delivery/00-control/`. Chat history is optional context; the filesystem and verified repository state are the recovery source of truth.

### One active session by default

Use one active pipeline session unless the user explicitly authorizes parallel work. Give it an immutable ID:

```text
SESSION-YYYYMMDD-HHMMSS-STAGE-XX
```

`00-control/active-session.md` contains either:

```text
ACTIVE_SESSION: NONE
```

or the exact session ID, stage/prompt, status, folder, started/updated time, input baseline, current checkpoint, and next action.

The session folder stays under `sessions/active/` while its status is:

- `ACTIVE`;
- `AWAITING_USER_DECISION`;
- `BLOCKED`;
- `RECOVERY_REQUIRED`.

### What every session must persist

| File | Purpose |
|---|---|
| `session-state.md` | Stage, objective, status, completed/remaining work, blockers, and exact next action. |
| `input-manifest.md` | Exact input paths, versions, hashes, repository revision, and environment assumptions. |
| `work-queue.md` | Small ordered work items with stable IDs and status. |
| `checkpoint.md` | Last verified safe point, commands/actions, results, affected files, and resume instructions. |
| `recovery-snapshot.md` | Repository branch/HEAD, status, changed/untracked-file inventory, safe diff summary/hashes, and optional authorized checkpoint commit/patch reference. |
| `decisions.md` | Decisions and assumptions with rationale and affected IDs. |
| `change-log.md` | Append-only record of mutations performed during this session. |
| `artifact-index.md` | Draft/final artifacts, evidence, and their status/hash. |
| `drafts/` | In-progress output that is not yet accepted as a pipeline baseline. |

Never keep the only copy of analysis, generated document content, coverage work, or next steps in chat.

### Checkpoint timing

Create or refresh a checkpoint:

- immediately after resolving inputs and scope;
- after building the initial inventory/work queue;
- after each coherent section, screen cluster, implementation unit, audit unit, or repaired defect;
- immediately before and after every user decision gate;
- before changing shared schemas, authentication, permissions, global UI, lookup, localization, or infrastructure behavior;
- before an expected context/tool/session boundary;
- immediately when blocked or when the environment becomes unhealthy;
- after final validation but before publishing/accepting the result.

A checkpoint records verified facts only. “Planned” and “implemented but not tested” must never be recorded as completed.

For code-changing stages, also refresh `recovery-snapshot.md`. If the user and repository policy explicitly permit local checkpoint commits, record the commit hash. Otherwise do not commit automatically: preserve the working tree and record status, changed/untracked paths, hashes, and a sanitized recoverable patch/archive when safe. Never capture secrets, dependency directories, generated build output, or private environment files. Chat loss alone does not remove code from the workspace; verify the files before taking any recovery action.

### New-chat startup behavior

At the start of every prompt:

1. Read repository instructions, this README, `manifest.md`, `pipeline-state.md`, `active-session.md`, and `baseline-alignment.md`.
2. Inspect repository status/diff and relevant artifacts before changing anything.
3. Verify that the active-session pointer, session folder, hashes, current code, and artifact files agree.
4. If the user explicitly says `RESUME`, resume the matching verified session without another routine confirmation.
5. If an unfinished session exists and the user did not explicitly choose a mode, show its stage, objective, status, last checkpoint, completed/remaining work, changed files, blockers, and next action; then ask exactly:

> **An unfinished session exists. Continue it? Answer Yes to resume it, or No to move it to paused drafts and start a new session.**

6. On **Yes**, mark it `ACTIVE`, repair any stale pointer metadata, and resume the exact next verified work item.
7. On **No**, do not delete or revert its work. Mark it `PAUSED_DRAFT`, move the session folder from `sessions/active/` to `sessions/paused/`, clear the active pointer, then initialize the newly requested stage/session.
8. If the pointer is stale, recover from session folders, hashes, repository state, and artifacts. If more than one plausible unfinished session exists, ask the user to select; never merge or discard silently.

If repository files changed after the last checkpoint, label them `UNRECONCILED_WORK`, preserve them, inspect their diff and tests, and determine whether they belong to the active session, a user edit, or a separate change. Never erase unknown work to make the checkpoint look consistent.

Losing chat history is never permission to delete files, reset Git, discard uncommitted work, roll back migrations, or recreate the project. First recover and reconcile.

### Completed, paused, and abandoned sessions

- `COMPLETED`: validate the output, write the final checkpoint, update manifests/state, move the folder from `active/` to `completed/`, and set `ACTIVE_SESSION: NONE`.
- `PAUSED_DRAFT`: preserve all drafts and changes under `paused/`; it may be resumed later.
- `ABANDONED`: move the session record to `abandoned/` only after explicit user direction. This labels the session; it does not automatically delete/revert code or artifacts.

Do not delete completed sessions. “Remove the active session” means move it out of `active/` and clear the pointer. Historical cleanup is a separate explicit maintenance action.

### Crash-safe publication order

When finalizing a stage:

1. finish and validate the candidate artifact/code;
2. save hashes and verification evidence;
3. update traceability and alignment records;
4. publish the new immutable/versioned artifact;
5. atomically update `manifest.md` and `pipeline-state.md` to point to it;
6. write the final session checkpoint;
7. move the session to `completed/`;
8. clear `active-session.md`.

If interruption occurs before this sequence finishes, the older accepted manifest remains authoritative and the new work remains a recoverable draft.

## Pipeline state and aligned baseline

`00-control/pipeline-state.md` must show every stage as `NOT_STARTED`, `IN_PROGRESS`, `AWAITING_USER_DECISION`, `BLOCKED`, `COMPLETED`, `STALE`, or `SUPERSEDED`, plus its latest session and artifact.

`manifest.md` must include exact current accepted paths/versions/hashes for:

- project brief/input baseline;
- Functional Requirements;
- UI/UX Design and Flow Plan;
- SRS;
- implementation source revision and control state;
- Stage 7 validation report;
- active approved change set.

`00-control/baseline-alignment.md` must state which change requests are incorporated into each layer:

| Layer | Version/Revision | Included CR IDs | Alignment Status | Evidence |
|---|---|---|---|---|
| Functional Requirements | ... | ... | ... | ... |
| UI/UX Design | ... | ... | ... | ... |
| SRS | ... | ... | ... | ... |
| Code/Database/Configuration | ... | ... | ... | ... |
| Automated Tests | ... | ... | ... | ... |
| Stage 7 Validation | ... | ... | ... | ... |

Valid alignment states are `ALIGNED`, `UPDATE_REQUIRED`, `IN_PROGRESS`, `BLOCKED`, and `NOT_APPLICABLE` with a reason. Never call the system aligned while an approved change is missing from an affected layer.

## Mandatory change-control flow

Any instruction that changes an accepted baseline must enter the formal change flow. Do not implement a new request only in code and leave requirements/design/SRS stale.

### First classify the request

| Type | Meaning | Required handling |
|---|---|---|
| Defect | Implementation contradicts the accepted baseline. | Record a defect, fix code/tests, and keep source documents unless they are ambiguous or wrong. |
| Clarification | Makes existing intent explicit without changing behavior/scope. | Record a decision; version affected documents if wording/acceptance changes. |
| Change Request | Adds/removes/changes behavior, scope, flow, UI, data, rules, permissions, quality, or integrations. | Create a CR and update every affected layer in dependency order. |
| Technical Refactor | Changes implementation without changing externally observable behavior. | Record technical decision/change, update SRS only if architecture/constraints change, and run regression. |
| Emergency Fix | Urgent safe correction before full documentation alignment. | Record immediately, implement only if authorized, then backfill affected artifacts before closing the CR. |

### Create a change record

Assign `CR-YYYYMMDD-NNN` and create `00-control/changes/<CR-ID>/` containing:

- `request.md`: user request, source/date, motivation, desired outcome, acceptance intent, and status;
- `impact-analysis.md`: affected actors, applications, FR/SCREEN/FLOW/STATE/SRS/LOOKUP/locale/interface/data/security/test IDs, dependencies, compatibility, migration, and risks;
- `plan.md`: ordered artifact/code/test updates, rollback/recovery considerations, and verification plan;
- `verification.md`: evidence that every affected layer and flow was updated and retested.

Add the CR to the append-only `change-register.md` and user-facing `CHANGELOG.md`. The changelog summarizes accepted outcomes; it does not replace the detailed CR record.

Each `CHANGELOG.md` entry should include date/version or repository revision, CR/defect/decision IDs, concise user-visible outcome, affected artifact versions/applications, migration or compatibility note when relevant, and verification reference. Do not include incomplete work as released; label it `DRAFT` or `IN_PROGRESS` until verified.

### Change propagation order

Unless the classification proves a layer is not affected, propagate an approved change in this order:

```text
USER CHANGE REQUEST
→ FUNCTIONAL REQUIREMENTS
→ UI/UX DESIGN + FLOWS
→ SRS + ACCEPTANCE CRITERIA
→ IMPLEMENTATION ROADMAP / DATA MIGRATION PLAN
→ CODE + DATABASE + CONFIGURATION
→ AUTOMATED TESTS
→ STAGE 7 REGRESSION / EVIDENCE
→ ALIGNED BASELINE
```

For each unaffected layer, record `NOT_APPLICABLE` with a reason. Do not silently skip it.

Create new immutable document versions instead of overwriting accepted artifacts. Preserve stable IDs whose meanings remain unchanged; add new IDs for new concepts and explicitly retire/supersede removed behavior. Update `manifest.md` only after each new version is validated.

### Change decision gate

Automatically perform impact analysis. Ask the user only when the change has unresolved alternatives that materially affect business policy, scope, compatibility, security, compliance, cost, data migration, or external contracts. Low-risk source-consistent corrections may proceed under the prompt's existing authorization, but must still be recorded.

### Change received during an active downstream session

When a change arrives during design, SRS, implementation, or validation:

1. checkpoint the current session and mark affected work `UPDATE_REQUIRED`;
2. register and analyze the CR;
3. if the change affects an earlier pipeline layer, move the current session to `paused/` as `PAUSED_DRAFT` rather than discarding it;
4. start a change session tied to the CR at the earliest affected layer;
5. propagate and verify the change through every affected layer;
6. close the change session only when its alignment rows are current;
7. reactivate the paused downstream session, update its input hashes/baseline, invalidate affected completed work for retest, and resume from the first impacted queue item.

Do not attempt to continue downstream work against a baseline already known to be stale.

### Alignment and closure gate

A CR may be `PROPOSED`, `ANALYZING`, `AWAITING_DECISION`, `APPROVED`, `IN_PROGRESS`, `BLOCKED`, `VERIFIED`, `CLOSED`, `REJECTED`, or `DEFERRED`.

Close a CR only when:

- every affected document has the correct new accepted version;
- implementation, database/configuration, and migrations match it;
- permanent tests cover the changed main and edge behavior;
- affected screens, UI elements, roles, locales, devices, and flows are retested;
- traceability and baseline alignment are `ALIGNED`;
- `verification.md` and `CHANGELOG.md` are complete;
- no affected downstream artifact remains stale.

Stages 6 and 7 cannot report final completion while an approved in-scope CR is open, blocked, unverified, or missing from an affected layer.

## Recommended commands to the AI

- `START STAGE N` — start a new stage if no conflicting active session exists.
- `RESUME` — verify and continue the current active session.
- `STATUS` — report verified pipeline/session/change/alignment state without mutation.
- `PAUSE AS DRAFT` — checkpoint and move the active session to `paused/`.
- `RESUME SESSION <ID>` — reactivate a named paused session after conflict checks.
- `CHANGE: <description>` — register and propagate a new change request.
- `RETEST <ID/scope>` — rerun affected verification without creating unrelated scope.

## Version and history rules

- Never overwrite an accepted artifact.
- Preserve stable FR, SRS, SCREEN, COMPONENT, FLOW, STATE, and TEST IDs when their meanings have not changed.
- Save each replacement as a new version and update `manifest.md` only after the file is complete.
- Scores and audit notes stay outside the specification documents.
- Previous scores must not influence a new audit.
- Chat history is not a source of truth. Saved artifacts and verified repository state are.
- “100% coverage” means complete traceability against the declared input baseline and discovered design objects. It is not a mathematical guarantee that no unknown requirement or defect exists.
- Implementation-stage completion is provisional until the independent Stage 7 system audit and regression gates pass.

## Important vocabulary

- **System:** the complete product.
- **Application / surface:** a distinct user-facing interface, such as POS, KDS, Branch Manager, Customer App, or Rider App.
- **Functional area/domain:** orders, payments, inventory, notifications, authentication, and similar capabilities that may span several applications.
- **Screen/page:** one interface within an application.
- **Flow:** an end-to-end user or cross-system journey with entry, actions, decisions, outcomes, final state, and next action.

Implementation scope should normally be selected by **application/surface**, not by a cross-cutting functional domain.

## Cross-pipeline UI, lookup, and localization rules

- Choose UI controls from the user's task, option count, frequency, risk, device, and accessibility needs. Do not default every choice to a dropdown or every action to a modal.
- Optimize important flows for clarity, few unnecessary steps, visible system status, error prevention, and recovery.
- Load production business records, configurable lookup values, and organization settings dynamically from the authoritative database through the real backend. Do not bundle them as UI arrays, local JSON constants, local-storage truth, or sample records.
- Store and load every business/domain dropdown and option list through the database/backend. Classify it as configurable, constrained, system-fixed, externally managed, or entity-owned, and expose it in a professional Reference Data/Lookup catalogue or its clearly linked owning area.
- Make lookups editable by authorized users by default. When editing could break lifecycle logic, security, reporting, standards, or integrations, keep database-backed values system-managed and read-only in the dashboard with a clear reason.
- Review every critical flow for the minimum necessary user steps. Remove redundant screens, confirmations, and repeated entry without removing required security, clarity, consent, or recovery.
- Treat multilingual support as an end-to-end requirement: translated UI/content, locale-aware formatting, language preference and fallback, Unicode, localized lookup labels and messages, and RTL/LTR behavior when applicable.
