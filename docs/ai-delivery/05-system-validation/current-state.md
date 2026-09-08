# Stage 7 — Current State

_Concise, authoritative. Verified facts only._

- **Stage:** 7 — Audit, Test, Fix, Harden. Session `SESSION-20260907-185500-STAGE-07` (ACTIVE).
- **Env:** branch `implementation` @ `1efea67` base. Native PG16 + Redis7. Node 24.20 / pnpm 9.15.
- **Source baseline:** FR/UI-UX/SRS v1.0. `CR-20260907-001` v1.1 drafts (Stage 7 reconciles).
- **Phase:** 0 ✓ · 1 ✓ · 2 ✓ · **3 ✓** — `S7-DEF-001..007` resolved; **all `CR-20260908-001`
  build items delivered + verified**. **4 IN PROGRESS** — **all 11 host-runnable `verify:*`
  gates clean** (`api` 146, `e2e` full-suite 40/40 on laptop, `a11y` 2/2, `perf`, `security` 13,
  `migrate` 4, `seo`, `theme`, `unit`, `static`, `i18n` 966); remaining Phase-4 = deep
  per-branch audit + fresh screenshot bundle + phone/tablet e2e replication (CI) + numeric
  traceability roll-up.
- **Last checkpoint:** `checkpoints/CHECKPOINT-0008.md`.
- **User authorization (2026-09-08):** full permission to build the deferred `CR-20260908-001`
  scope autonomously. Delivered: D-1 → S7-DEF-006 → D-6 → D-3 → D-2 write side (restrictions +
  merge) → D-4 event-rules. `S7-Q-014` CR-20260907-001 reconciliation docs complete. Remaining:
  the user's `D-7` acceptance + the `CR-20260908-001` acceptance stage-gate + the Phase-4 close
  (deep audit, fresh screenshots, phone/tablet e2e on CI, numeric roll-up).

## Gate status (host-runnable)

| Gate              | Result                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:static`   | **PASS** (+ `openapi:check` + contract drift; openapi **134 paths**)                                                                                                                                                               |
| `verify:i18n`     | **PASS** — **968 keys**, en/ar/fr complete                                                                                                                                                                                         |
| `verify:theme`    | **PASS** — re-run clean                                                                                                                                                                                                            |
| `verify:unit`     | **PASS** — API 89 + web 13                                                                                                                                                                                                         |
| `verify:api`      | **PASS — 146 tests, 24 files, one clean single run** (incl. all 11 new/rewritten specs + `migrate.spec` proving `0007`–`0011`)                                                                                                     |
| `verify:migrate`  | **PASS 4/4** — proves empty→current with `0007` product · `0008` customer_restriction.status · `0009` customer_merge · `0010` notification_rule                                                                                    |
| `verify:security` | **PASS 13/13** — re-run clean; every new route reuses `@Permissions` + Zod DTOs                                                                                                                                                    |
| `verify:seo`      | **PASS** — re-run clean (6 routes × en/ar/fr + robots + sitemap 30 locs + private-route noindex)                                                                                                                                   |
| `verify:e2e`      | **PASS** — laptop full suite **40/40** · tablet full suite **37/37** (+ 3 viewport-gated skips) · phone `full-sweep`/`responsive`/`rtl`/`smoke` **10/10** (every route overflow-clean at 390 px). Phone full-flow replication → CI |
| `verify:a11y`     | **PASS 2/2** — re-run clean; axe-core 0 serious/critical on customer + ops surfaces (incl. every new `/ops` screen)                                                                                                                |
| `verify:perf`     | **PASS** — re-run clean; perf-smoke all endpoints within budget · perf-site all first-load JS within budget (`/checkout` heaviest, 240 KB br ≤ 285)                                                                                |

## Defects

| ID         | Sev    | Status                                                                                                                                                                                                                       |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S7-DEF-001 | LOW    | **FIXED** — openapi regen + `openapi:check` gate                                                                                                                                                                             |
| S7-DEF-002 | MEDIUM | **FIXED+VERIFIED** — outbox relay + prune + gauge + `outbox.spec` 4/4 + worker runtime                                                                                                                                       |
| S7-DEF-003 | HIGH   | **VERIFIED** — `verify:e2e` unblocked                                                                                                                                                                                        |
| S7-DEF-004 | HIGH   | **FULLY RESOLVED** — server-price guard (p1) + real `product` catalogue (D-1)                                                                                                                                                |
| S7-DEF-005 | MEDIUM | **VERIFIED** — auth-persistence `localStorage` + `storageState` e2e                                                                                                                                                          |
| S7-DEF-006 | LOW    | **FIXED** — real `usage()` counts + `tracked` flag + in-use deactivation guard (`?force=true`)                                                                                                                               |
| S7-DEF-007 | MEDIUM | **ADDRESSED** — matrix header + every over-claimed FR-ADM row re-stated to what now exists + delivery appendix + `SCREEN-CUS-*` old→new path map (`S7-Q-014` docs complete). Numeric roll-up refreshed in the Phase-4 close. |

## `CR-20260908-001` build — all items delivered (2026-09-08)

| Item                                                         | Migration | Evidence                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-1** extras & protection (FR-ADM-006 / OPS-027 / CUS-005) | `0007`    | `product` + `ProductService` (authoritative pricing) + customer/ops routes + `booking.confirm()` prices `extraCodes` + ops screen + checkout step. `product.spec` 6 · e2e ×2                                                                                                          |
| **D-2** customer records — read (FR-ADM-001)                 | —         | `CustomerModule` search + consolidated record. `customer.spec` 5 · e2e                                                                                                                                                                                                                |
| **D-2** eligibility restrictions — write (FR-ADM-002)        | `0008`    | `CustomerRestrictionService` create→approve/reject (author≠approver)→lift; `assertCanTransact()` in `booking.confirm()` → 422 `customer_restricted`. `RestrictionsCard`. `customer-restriction.spec` 3 · e2e SCREEN-OPS-022                                                           |
| **D-2** reversible merge — write (FR-ADM-001)                | `0009`    | `customer_merge`; `POST /ops/customers/:id/{merge,unmerge}` moves drivers+restrictions, archive-not-delete, records moved ids, reversible. `MergeCard`. `customer-merge.spec` 3 · e2e                                                                                                 |
| **D-3** locations & operating-hours editor (FR-ADM-007)      | —         | `LocationAdminService` + `/ops/locations*` (hours grid, holiday exceptions, archive w/ future-reservation impact check `?force`, inverted-hours 422) + screen. `location-admin.spec` 4 · e2e SCREEN-OPS-028                                                                           |
| **D-4** template editor — content (FR-ADM-011)               | —         | `TemplateService` + `/ops/config/templates` (draft→review→publish gate). `template.spec` 7 · e2e SCREEN-OPS-033                                                                                                                                                                       |
| **D-4** event rules — write (FR-ADM-011)                     | `0010`    | `notification_rule` + `notification.sender`; `NotificationRuleService` (enable/audience/delay/quiet-hours/retry/escalate/sender) + `GET\|POST /ops/notification-rules`; `notify.send()` suppresses a disabled event + stamps the sender. `RuleCard`. `notification-rule.spec` 4 · e2e |
| **D-5** outbox relay scope (`S7-DEF-002`)                    | —         | option a — relay + prune + gauge                                                                                                                                                                                                                                                      |
| **D-6** unified reservation + rental search (FR-ADM-003)     | —         | `SearchModule` `GET /ops/search` + `/ops/search` screen. `search.spec` 6 · e2e SCREEN-OPS-004                                                                                                                                                                                         |
| **`S7-DEF-006`** reference-data usage counts (FR-ADM-008)    | —         | real `usage()` + `tracked` + in-use deactivation guard. `config-lookup.spec` TEST-LKP-014 · e2e                                                                                                                                                                                       |

Each item's deferred depth is listed in `decision-list.md` + `CR-20260908-001/verification.md`
(follow-up CR). **`D-7`** (accept `CR-20260907-001` v1.1 docs) remains a user action.

## New API surface (Stage 7) — openapi 134 paths

`GET|POST /ops/templates*` · `GET|POST /ops/notification-rules` + `:event/:channel/{enable,disable}` ·
`GET /ops/customers?q=` · `GET /ops/customers/:id` ·
`GET|POST /ops/customers/:id/restrictions` + `:rid/{approve,reject,lift}` ·
`POST /ops/customers/:id/{merge,unmerge}` ·
`GET /catalogue/products` · `GET|POST /ops/catalogue/products` + `:code/{deactivate,restore}` ·
`POST /bookings/confirm` accepts `extraCodes[]` (+ enforces active `block` restrictions) ·
`GET /ops/search` (unified) ·
`GET|POST /ops/locations` + `:code/{impact,archive,restore,hours-exceptions,…}` ·
`POST /reference-data/types/:code/values/:id/deactivate?force=true`; `…/usage` real counts + `tracked`.

## Exact next action

1. **CR-20260907-001 reconciliation** — re-verify the v1.1 amendment docs still match the
   implementation after the D-item builds; finish `S7-Q-014` (refresh the stale `SCREEN-CUS` code
   paths in `traceability-matrix.md`); update the `baseline-alignment.md` note.
2. **Phase 4** — deep per-branch audit over the full surface set; a clean full `verify:all` on a
   host with headroom / in CI; fresh screenshot bundle; `final-report.md` non-DRAFT;
   `pipeline-state.md` / `manifest.md`; move the session to `sessions/completed/`.
3. `D-7` + the `CR-20260908-001` acceptance stage-gate are the user's.

## Working tree (uncommitted)

No commits. New this stage — API: `modules/{customer,search}/*`, `modules/catalogue/product.service.ts`,
`modules/notify/{template,notification-rule}.service.ts`, `common/outbox/outbox-relay.ts`,
`database/migrations/000{7,8,9}_*.sql` + `0010_*.sql` (+ snapshots),
`test/{outbox,template,customer,product,search,location-admin,customer-restriction,customer-merge,notification-rule}.spec.ts`.
Web: `surfaces/ops/{customers,templates,products,search,locations}-page.tsx`. Docs:
`05-system-validation/**`, `00-control/changes/CR-20260908-001/**`. Modified widely across
`apps/api` (schema {catalogue,customer,notify,org}, seed {discovery,test}, booking, discovery,
config/{lookup,location-admin,config.module}, notify, app.module, observability, worker, openapi),
`apps/web` (router, ops-layout, admin-hooks, api-hooks, reference-data-page, auth),
`apps/site` (checkout, customer-hooks, auth-context), `packages/contracts` (booking, lookup),
`packages/i18n` (968 keys/locale), `e2e/tests/{smoke,report,booking,auth-and-reference}.spec.ts`,
control-plane docs, `CHANGELOG.md`.
