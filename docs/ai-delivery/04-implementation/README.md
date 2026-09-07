# Implementation Control — Car Rental System

This folder is the persistent implementation history. It lets a fresh session resume safely.
These are control artifacts, **not** replacements for the three source specifications
(Functional Requirements, UI/UX Design and Flow Plan, SRS).

## Status vocabulary

Stages in `implementation-roadmap.md` use: `PLANNED`, `READY`, `IN_PROGRESS`, `BLOCKED`,
`VERIFYING`, `COMPLETED`, `DEFERRED`. Normally only one stage is `IN_PROGRESS`.

Traceability rows use: `NOT_STARTED`, `IN_PROGRESS`, `IMPLEMENTED` (code path exists, not fully
verified), `COMPLETED` (passing evidence recorded), `DEFERRED` (out of approved scope).

## Evidence rules

- A screen/flow is not "done" because it renders. It is done when its applicable states
  (loading, empty, no-results, validation, failure, success, unavailable, permission-denied,
  stale, offline, pending, expired) are implemented and evidenced.
- User-facing work needs screenshots at the three responsive classes (phone ~390px,
  tablet ~820px, laptop ~1440px) plus console/network assertions.
- Server-changing work needs DB state assertions and, where relevant, outbox/audit assertions.
- Do not weaken assertions or hide failures to make a gate pass.

## Approved scope (summary)

**IN:** Customer Web (APP-CWEB), Operations/Admin Dashboard (APP-OPS), and the complete shared
backend (REST API, domain, persistence, auth, workers, provider simulators, observability) — the
same backend that also serves the mobile app.

**DEFERRED:** Customer Mobile (APP-CMOB) **frontend** only (React Native UI) — this machine cannot
build or test it. Its backend/API contract is fully in scope and implemented.

See `selected-scope.md` for the authoritative detail.

## Fresh-session bootstrap order

1. Repository instructions: root `AGENTS.md` / `CLAUDE.md` if present, `README.md`.
2. `docs/ai-delivery/manifest.md`.
3. This file.
4. `source-manifest.md` and the three referenced source versions.
5. `selected-scope.md`.
6. `current-state.md`.
7. `implementation-roadmap.md` and `dependency-map.md`.
8. Active stage's `plan.md`, `checkpoint.md`, `test-evidence.md`, `defects.md`.
9. `decisions.md` entries relevant to the active stage.
10. `lookup-registry.md` and `localization-registry.md` entries relevant to the active stage.
11. Relevant FR / SRS / SCREEN / COMPONENT / FLOW / STATE / LOOKUP sections by stable ID.
12. Repository status, active files, migrations, configuration, existing tests.

Then run `pnpm verify:quick` (see repo `README.md`) and reconcile history with reality before
continuing only previously approved scope.
