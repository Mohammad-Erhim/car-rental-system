# CHECKPOINT-0002 — Phase 3 fix loop (batch 1)

- **Timestamp:** 2026-09-08
- **Repo:** branch `implementation`, base `1efea67`; working tree has the Stage 7 fixes below
  (uncommitted) + `docs/ai-delivery/05-system-validation/` (new).
- **Active queue item:** S7-Q batch-1 fixes applied; next = `verify:api` re-run result, then
  `S7-DEF-002` (pending user scope approval) or `S7-Q-014` CR reconciliation.

## Fixes applied + verified this interval

| ID                  | Sev    | What changed                                                                                                                                                                                                                                                    | Verified                                                                                 |
| ------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| S7-DEF-003          | HIGH   | `e2e/tests/smoke.spec.ts:59` rewritten to assert the real SCREEN-OPS-002 KPI dashboard (`ops-dash-stats`, `ops-dash-fleet`, health drill); removed dead `ops.dash.metricPending` i18n key (3 locales, 778 now)                                                  | **Full `verify:e2e` GREEN** — phone / tablet 29 / laptop 32                              |
| S7-DEF-004 (part 1) | HIGH   | `zConfirmBookingRequest.extras` (client `{code,label,amountMinor}`) → `extraCodes: string[]`; `booking.service` no longer moves money from the request body — total == authoritative quote; non-empty `extraCodes` → 422 (no catalogue yet); controller updated | **`test/booking.spec.ts` 8/8** incl. new tamper test                                     |
| S7-DEF-005          | MEDIUM | session restore hint `sessionStorage` → `localStorage` in `apps/web/src/lib/auth.tsx` + `apps/site/src/lib/auth-context.tsx` (persistent + cross-tab, matching the persistent `carrental_rt` cookie)                                                            | **e2e `auth-and-reference`+`smoke` laptop 9/9** incl. new `storageState` regression test |
| S7-DEF-001          | LOW    | regenerated `apps/api/openapi.json` (+`/ops/dashboard`); new `--check` mode in `apps/api/src/openapi.ts` + `openapi:check` script wired into `verify:static` (git-independent staleness gate)                                                                   | **`verify:static` PASS**                                                                 |
| S7-OPT-001          | —      | one dev DB password `carrental_dev_pw` across native + Docker: `compose.yaml`, `.env.example`, `scripts/dev-up.sh` message                                                                                                                                      | `pnpm check:secrets` PASS; static PASS                                                   |

## Gate re-runs after the fixes

`verify:static` PASS · `verify:i18n` PASS (778) · `verify:theme` PASS · `verify:unit` PASS (89) ·
`verify:e2e` PASS (full, 3 viewports) · `verify:api` **re-running** (`bfmaak9u7`) ·
`verify:migrate`/`security`/`seo`/`a11y`/`perf` unchanged since CHECKPOINT-0001 (green), to be
re-swept in Phase 4.

## Still open

| ID                                                                 | Sev    | Disposition                                                                                   |
| ------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------- |
| S7-DEF-002                                                         | MEDIUM | outbox relay/drain — `decision-list.md` D-5; recommended option (a), pending user OK on scope |
| S7-DEF-006                                                         | LOW    | reference-data usage-count stub — queued, low priority                                        |
| S7-GAP-EXTRAS / CUSTOMERS / LOCATIONS / TEMPLATES / UNIFIED-SEARCH | —      | `decision-list.md` D-1..D-6 — material scope, need user calls                                 |
| CR-20260907-001                                                    | —      | `S7-Q-014` reconciliation not started                                                         |

## Phase 3 audit still to do (S7-Q-005..010, 015)

Core business-flow runtime audit, validation round-trips, dynamic-data/lookup propagation,
i18n/RTL deep sweep, responsive/a11y deepening, security direct-API authz, technical runtime
(server logs / console / DB effects). API + security suites already cover much of this at the
integration level; Stage 7 adds the runtime + cross-layer confirmation.

## Resume pointer

`current-state.md` → `work-queue.md` → `defects.md` → `decision-list.md` → this file. Datastores:
`DEV_UP_FORCE_NATIVE=1 pnpm dev:up`. Dev accounts `{admin,manager,agent,fleet,finance,customer}@example.test`
/ `DevPassw0rd!`. Nothing committed — `git stash list` empty; fixes are live in the working tree.
