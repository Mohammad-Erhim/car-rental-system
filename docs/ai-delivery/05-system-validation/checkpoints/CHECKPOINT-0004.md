# CHECKPOINT-0004 — Phase 3 fix loop batch 2 (outbox + CR line + matrix note)

- **Timestamp:** 2026-09-08
- **Repo:** branch `implementation`, base `1efea67`. ~28 tracked files modified (Stage 7 fixes,
  **uncommitted**) + `docs/ai-delivery/05-system-validation/` (new).
- **Stage status:** `IN_PROGRESS` / `AWAITING_USER_DECISION`. All defect repair done + verified.
  Remaining = net-new feature builds (`decision-list.md` D-1/D-2/D-3/D-4/D-6) + the `S7-Q-014`
  matrix re-status that depends on their outcomes.

## Done since CHECKPOINT-0003

- **`S7-DEF-002` FIXED + VERIFIED** (per "continue with best practices" = `decision-list.md` D-5,
  option a):
  - `apps/api/src/common/outbox/outbox-relay.ts` (new) — `runOutboxRelay()`: claim
    (`for update skip locked`, `seq` order) → dispatch to a `registerOutboxHandler` registry →
    `delivered_at` / exponential backoff (`available_at`) / dead-letter at `maxAttempts` → prune
    delivered rows past `retentionMs`. Ships a `cache-invalidation` handler
    (`lookup.invalidated.v1` / `catalogue.changed.v1` / `config.translation.published` → durable
    `INCR cachever` + `PUBLISH cache:invalidate`, a backstop for in-process `CacheBus`). External
    fan-out = documented extension point, explicitly deferred.
  - `apps/api/src/worker.ts` — 15 s `outbox-relay` repeatable job → dead-letters to `housekeeping-dlq`.
  - `apps/api/src/observability/metrics.ts` — `outbox_backlog` gauge instantiated + `setOutboxBacklog`.
  - `apps/api/src/observability/health.service.ts` — `readiness()` refreshes the gauge (best-effort).
  - `apps/api/test/outbox.spec.ts` (new) — 4 tests (deliver+backlog→0; backoff→dead-letter+`onDeadLetter`;
    retry-while-attempts-remain + `available_at` push; retention prune). **4/4.**
  - **`verify:api` full re-run: 16 files / 107 tests PASS.** Worker runtime-verified
    (`outbox relay tick claimed:6 delivered:6 backlog:0`). No migration needed (schema already had
    `attempts` / `last_error` / `available_at`).
- `S7-Q-014` decision-independent bits: fixed the "e2e green" claim in
  `CR-20260907-001/verification.md`; added the `S7-DEF-007` warning header to
  `04-implementation/traceability-matrix.md`.

## Gate status (all host-runnable) — current

`static` ✓ · `i18n` ✓ 778 · `theme` ✓ · `unit` ✓ 89 · **`api` ✓ 107** · `migrate` ✓ 4 ·
`security` ✓ 13 · `seo` ✓ · `e2e` ✓ (full) · `a11y` ✓ · `perf` ✓.

## Fix ledger (working tree, uncommitted)

| ID            | Status       | Evidence                                              |
| ------------- | ------------ | ----------------------------------------------------- |
| S7-DEF-001    | FIXED        | `verify:static` PASS incl. `openapi:check`            |
| S7-DEF-002    | **VERIFIED** | `outbox.spec` 4/4 · `verify:api` 107 · worker runtime |
| S7-DEF-003    | VERIFIED     | full `verify:e2e` green                               |
| S7-DEF-004 p1 | VERIFIED     | `booking.spec` 8/8 + runtime evidence                 |
| S7-DEF-005    | VERIFIED     | `auth-and-reference`+`smoke` e2e 9/9                  |
| S7-OPT-001    | IMPLEMENTED  | `check:secrets` + `verify:static`                     |

## Open — needs the user (`decision-list.md`)

| Ref        | Item                                                       | Recommendation                                                   |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| D-1        | extras/protection feature (FR-ADM-006)                     | minimal vertical slice                                           |
| D-2        | customer records (FR-ADM-001/002)                          | build read-side; defer merge/restrictions to a CR                |
| D-3        | locations editor (FR-ADM-007)                              | defer to a CR                                                    |
| D-4        | notification-template editor (SCREEN-OPS-033 / FR-ADM-011) | build content+preview+publish-gate slice; defer event-rules half |
| ~~D-5~~    | ~~outbox scope~~                                           | **DONE** (option a)                                              |
| D-6        | unified search (FR-ADM-003)                                | defer to a CR                                                    |
| D-7        | CR-20260907-001 acceptance                                 | after D-1..D-4 + `S7-Q-014`                                      |
| S7-DEF-006 | reference-data usage-count (LOW)                           | bundle with D-2..D-4                                             |
| S7-DEF-007 | traceability re-status                                     | `S7-Q-014`, after D-1..D-6                                       |

## Exact next action

On the user's D-1..D-4/D-6 answers: implement approved slices + regression tests; then `S7-Q-014`
(finish `traceability-matrix.md` — customer paths + FR-ADM row status + a v1.0-FR delivery
appendix); then the deep per-branch Phase-3 audit over the full surface set; then `pnpm verify:all`
green → `final-report.md` non-DRAFT → `pipeline-state.md` Stage 07 `COMPLETED` → `manifest.md`
`latest_system_validation` → session → `sessions/completed/`.

## Resume reading order

`README.md` → `current-state.md` → `work-queue.md` → `decision-list.md` → `defects.md` →
`cr-reconciliation.md` → this file. Datastores: `DEV_UP_FORCE_NATIVE=1 pnpm dev:up`.
Dev/test accounts: dev `{admin,manager,agent,fleet,finance,customer}@example.test` / `DevPassw0rd!`;
test `test-{admin,agent,finance,manager,customer}@example.test` / `Test-Passw0rd!`.
