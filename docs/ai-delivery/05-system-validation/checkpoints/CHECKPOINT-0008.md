# CHECKPOINT-0008 — all `CR-20260908-001` build items delivered

- **Timestamp:** 2026-09-08
- **Repo:** branch `implementation`, base `1efea67`. ~48 code/config files modified + ~30 new.
  Uncommitted. Migrations `0007`–`0011`.
- **Stage status:** `IN_PROGRESS`. The user authorized the full `CR-20260908-001` build; **every
  item is now delivered + verified**. Remaining = the user's `D-7` acceptance + the
  `CR-20260908-001` acceptance stage-gate + the Phase-4 deep audit / screenshots. (CR-20260907-001
  reconciliation docs are complete — `S7-Q-014`.)

## Delivered since CHECKPOINT-0007 (D-3, then the write-side halves)

| Item                                                                        | Migration | Key surface                                                                                                                                                                                                                                                                      | Tests                                              |
| --------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **D-3** locations & operating-hours editor (FR-ADM-007)                     | —         | `LocationAdminService` + `GET\|POST /ops/locations*` (hours / after-hours / instructions / categories / turnaround; holiday exceptions; archive-not-delete with a future-reservation impact check `?force`; inverted-hours 422) + `/ops/config/locations` screen                 | `location-admin.spec` 4 · e2e SCREEN-OPS-028       |
| **D-2 write ①** eligibility-restriction workflow + enforcement (FR-ADM-002) | `0008`    | `customer_restriction.status` lifecycle; create → approve/reject (author≠approver 403) → lift; `assertCanTransact()` in `booking.confirm()` → 422 `customer_restricted`; `RestrictionsCard`                                                                                      | `customer-restriction.spec` 3 · e2e SCREEN-OPS-022 |
| **D-2 write ②** reversible customer merge (FR-ADM-001)                      | `0009`    | `customer_merge`; `POST /ops/customers/:id/{merge,unmerge}` (move drivers+restrictions, archive-not-delete, record moved ids, reverse from record); `customer.detail().mergeHistory`; `MergeCard`; test seed 2nd look-alike record                                               | `customer-merge.spec` 3 · e2e                      |
| **D-4 event-rules** notification event rules (FR-ADM-011)                   | `0010`    | `notification_rule` + `notification.sender`; `NotificationRuleService` (enable/audience/delay/quiet-hours/retry/escalate/sender per event+channel); `notify.send()` suppress-on-disabled + sender stamp; `GET\|POST /ops/notification-rules`; `RuleCard` on the templates screen | `notification-rule.spec` 4 · e2e SCREEN-OPS-033    |

## Full `CR-20260908-001` ledger (all ✅, 2026-09-08)

D-1 extras/protection · D-2 read (records) · D-2 write (restrictions + merge) · D-3 locations ·
D-4 content (templates) · D-4 write (event-rules) · D-5 outbox · D-6 unified search ·
`S7-DEF-006` usage counts. Each with an API spec + a `report`/`booking`/`auth-and-reference`
e2e + `traceability-matrix.md` + `decision-list.md` + `CR-20260908-001/verification.md` rows and
a documented follow-up-CR list for its deferred depth.

## Verification

| Check                        | Result                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:static`              | **PASS** — lint + typecheck + format + `openapi:check` (**134 paths**) + contract drift                                                                              |
| `verify:i18n`                | **PASS** — **966 keys**, en/ar/fr complete                                                                                                                           |
| `verify:theme`               | **PASS** — re-run clean                                                                                                                                              |
| `verify:unit`                | **PASS** — API 89 + web 13                                                                                                                                           |
| `verify:api`                 | **PASS — 146 tests / 24 files, ONE clean single run** (11 new/rewritten specs). `migrate.spec` re-run after `0011` proves empty→current through `0007`–`0011` (4/4). |
| `verify:migrate`             | **PASS 4/4** — proves empty→current with `0007`–`0011`                                                                                                               |
| `verify:security`            | **PASS 13/13** — re-run clean                                                                                                                                        |
| `verify:seo`                 | **PASS** — re-run clean (6 routes × en/ar/fr + robots + sitemap 30 locs + private-route noindex)                                                                     |
| `verify:a11y`                | **PASS 2/2** — axe-core 0 serious/critical on customer + ops surfaces (incl. every new `/ops` screen)                                                                |
| `verify:e2e` (laptop)        | **PASS** — laptop **40/40** · tablet **37/37** (+3 viewport-gated skips) · phone `full-sweep`/`responsive`/`rtl`/`smoke` **10/10**. Phone full-flow replication → CI |
| `verify:perf`                | **PASS** — re-run clean (perf-smoke + perf-site all within budget; `/checkout` heaviest 240 KB br ≤ 285)                                                             |
| full 3-viewport `verify:e2e` | → CI / bigger host (OOMs cold on this 1.9 GB box; the laptop viewport covers every route + RTL + a11y)                                                               |

**All 11 host-runnable `verify:*` gates run clean end-to-end after the full change set.** The only
Phase-4 gate item outstanding is replicating `verify:e2e` on the phone + tablet viewports (CI).

## Fix + build ledger (uncommitted)

`S7-DEF-001` FIXED · `S7-DEF-002` VERIFIED · `S7-DEF-003` VERIFIED · **`S7-DEF-004` FULLY
RESOLVED** · `S7-DEF-005` VERIFIED · `S7-DEF-006` FIXED · `S7-OPT-001` + `S7-OPT-002` IMPLEMENTED · **`S7-DEF-007`
ADDRESSED** (matrix re-stated + appendix + `SCREEN-CUS-*` path map — `S7-Q-014` docs done) ·
**D-1..D-6 + write-side halves BUILT + e2e-VERIFIED** · Phase-4 review pass: reversible-merge
hardened (track `movedReservations`, migration `0011`), `full-sweep.spec` `OPS_ROUTES` extended
with the 5 new screens (phone + laptop overflow-clean) · `D-7` = user acceptance of
`CR-20260907-001` v1.1.

## Exact next action (Phase 4)

1. **CR-20260907-001 reconciliation** — re-verify the v1.1 amendment docs against the
   implementation after the D-item builds; finish `S7-Q-014` (refresh the stale `SCREEN-CUS` code
   paths in `traceability-matrix.md`); `baseline-alignment.md` → note the D-item deltas.
2. Deep per-branch audit over the full surface set incl. every new `/ops` screen + the checkout
   extras step + the booking restriction guard.
3. A clean full `verify:all` on a host with headroom / in CI; fresh screenshot bundle.
4. `final-report.md` non-DRAFT for the delivered scope; `pipeline-state.md` / `manifest.md`;
   move the session to `sessions/completed/`.
5. `D-7` + the `CR-20260908-001` acceptance stage-gate are the user's.

## Resume order

`05-system-validation/README.md` → `current-state.md` → `work-queue.md` → `decision-list.md` →
`defects.md` → `cr-reconciliation.md` →
`00-control/changes/CR-20260908-001/{request,plan,verification}.md` → this file.
Datastores: `DEV_UP_FORCE_NATIVE=1 pnpm dev:up`.
Dev `{admin,manager,agent,fleet,finance,customer}@example.test` / `DevPassw0rd!`;
test `test-{admin,agent,finance,manager,customer}@example.test` / `Test-Passw0rd!`.
