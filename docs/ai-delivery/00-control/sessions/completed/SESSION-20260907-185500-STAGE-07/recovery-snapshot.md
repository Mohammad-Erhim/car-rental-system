# Recovery Snapshot — SESSION-20260907-185500-STAGE-07

Refreshed 2026-09-08 during the Stage 7 autonomous build loop (CHECKPOINT-0008).

- **Branch:** `implementation`
- **Base HEAD:** `1efea67ffbb192c3747e5775610e253acaa0508a`
- **Git stash:** empty. **Commits added by Stage 7:** one — `56e3b64`
  (`feat(STAGE-07): audit/test/fix/harden pass — CR-20260908-001 FR-ADM build + 6 defect fixes`),
  pushed to `origin/implementation` on 2026-09-08 at user request. Held as a single working-tree
  delta through the build loop per the no-auto-commit rule, then committed. The 30 screenshot
  evidence PNGs under `stages/STAGE-000-platform/screenshots/` were **not** committed
  (regenerable test artifacts; see `optimization-register.md` `S7-OPT-003`) — they remain
  untracked in the working tree. `git show 56e3b64` + this file are the recovery source.
- **User authorization:** full permission (2026-09-08) to build the deferred `CR-20260908-001`
  scope autonomously. **All build items delivered:** D-1 → S7-DEF-006 → D-6 → D-3 → D-2 write
  side (eligibility restrictions + reversible merge) → D-4 event-rules. Migrations `0007`–`0011`,
  openapi 134 paths, i18n 968 keys/locale. Next: CR-20260907-001 reconciliation + Phase 4.

## Migrations added this stage

`0007_zippy_crystal` (`product`) · `0008_worthless_captain_universe`
(`customer_restriction.status` + `review_notes`) · `0009_material_tombstone` (`customer_merge`) ·
`0010_round_wong` (`notification_rule` + `notification.sender`). Applied to `carrental_dev`;
`carrental_test` gets them per-run; `migrate.spec` proves empty→current.

## New modules / services this stage (API)

`modules/customer/{customer,customer-restriction,customer-merge}.service.ts` + `customer.module.ts`
(controller with `/ops/customers*` + `:id/restrictions/*` + `:id/{merge,unmerge}`) ·
`modules/search/{search.service,search.module}.ts` (`GET /ops/search`) ·
`modules/catalogue/product.service.ts` ·
`modules/notify/{template,notification-rule}.service.ts` + rules routes on `TemplateController` ·
`modules/config/{location-admin.service,location-admin.controller}.ts` ·
`common/outbox/outbox-relay.ts`. `booking.service.ts` now injects `CustomerRestrictionService`
(enforcement) + `ProductService` (extras pricing); `notify.service.ts` injects
`NotificationRuleService` (suppress + sender).

## New tests this stage

`test/{outbox,product,template,customer,search,location-admin,customer-restriction,customer-merge,notification-rule}.spec.ts`

- `booking.spec.ts` S7-DEF-004/SCREEN-CUS-005 rewrites + e2e
  `{smoke,report,booking,auth-and-reference}.spec.ts` additions.

## New `/ops` screens this stage (web)

`surfaces/ops/{customers,templates,products,search,locations}-page.tsx` (+ `RestrictionsCard`,
`MergeCard` in customers-page, `RuleCard` in templates-page) + hooks in `admin-hooks.ts` /
`api-hooks.ts` + routes in `app/router.tsx` + nav in `ops-layout.tsx`. `apps/site` checkout
(`[locale]/checkout/page.tsx`) gains the extras step + `customer-hooks.ts` `useAvailableProducts`.

## Working tree — Stage 7 change set (all intentional, all regression-checked)

### Defect fixes + option

| Area                                                                                                                                      | Defect/Opt             | Purpose                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------- |
| `e2e/tests/smoke.spec.ts`                                                                                                                 | S7-DEF-003             | assert the real SCREEN-OPS-002 KPI dashboard                                    |
| `apps/api/src/openapi.ts`, `apps/api/package.json`, `package.json`                                                                        | S7-DEF-001             | `--check` mode + `openapi:check` gate in `verify:static`                        |
| `apps/api/openapi.json`                                                                                                                   | S7-DEF-001/D-1/D-2/D-4 | regenerated — **116 paths**                                                     |
| `apps/api/src/common/outbox/outbox-relay.ts` (new), `worker.ts`, `observability/{metrics,health.service}.ts`, `test/outbox.spec.ts` (new) | S7-DEF-002             | outbox relay + backoff + dead-letter + retention prune + `outbox_backlog` gauge |
| `apps/web/src/lib/auth.tsx`, `apps/site/src/lib/auth-context.tsx`, `e2e/tests/auth-and-reference.spec.ts`                                 | S7-DEF-005             | session hint `sessionStorage` → `localStorage` + `storageState` regression test |
| `packages/contracts/src/booking.ts`, `booking.service.ts`, `booking.controller.ts`, `test/booking.spec.ts`                                | S7-DEF-004             | `extras` obj-array → `extraCodes: string[]`; server owns the price (see D-1)    |
| `compose.yaml`, `.env.example`, `scripts/dev-up.sh`                                                                                       | S7-OPT-001             | one dev DB password `carrental_dev_pw`                                          |

### D-4 — notification-template editor (content half), new/modified

`apps/api/src/modules/notify/template.service.ts` (new), `notify.module.ts`,
`apps/api/test/template.spec.ts` (new), `apps/web/src/surfaces/ops/templates-page.tsx` (new),
`apps/web/src/lib/admin-hooks.ts`, `apps/web/src/app/router.tsx`, `ops-layout.tsx`.

### D-2 — customer records (read side), new/modified

`apps/api/src/modules/customer/**` (new module), `app.module.ts`,
`apps/api/src/database/seed/test.ts` (customer profile rows),
`apps/api/test/customer.spec.ts` (new), `apps/web/src/surfaces/ops/customers-page.tsx` (new),
`admin-hooks.ts`, `router.tsx`, `ops-layout.tsx`.

### D-1 — extras & protection products (vertical slice), new/modified

| File                                                                                                     | Purpose                                                                                               |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `apps/api/src/database/schema/catalogue.ts`                                                              | `product` table                                                                                       |
| `apps/api/src/database/migrations/0007_zippy_crystal.sql` (+ `meta/0007_snapshot.json`, `_journal.json`) | migration (applied to `carrental_dev`; per-run on `carrental_test`)                                   |
| `apps/api/src/database/seed/discovery.ts`                                                                | 5 seeded products                                                                                     |
| `apps/api/src/modules/catalogue/product.service.ts` (new)                                                | `list` / `availableFor` / `resolveForBooking` (authoritative pricing + 422s) / `upsert` / `setActive` |
| `apps/api/src/modules/discovery/{discovery.module,discovery.controller,ops-catalogue.controller}.ts`     | wire `ProductService` + routes                                                                        |
| `apps/api/src/modules/booking/booking.service.ts`                                                        | `confirm()` prices `extraCodes` → `extra` lines, extras taxed at effective rate                       |
| `apps/api/test/product.spec.ts` (new), `test/booking.spec.ts`                                            | 6 + rewritten `S7-DEF-004` + `SCREEN-CUS-005`                                                         |
| `apps/web/src/surfaces/ops/products-page.tsx` (new), `admin-hooks.ts`, `router.tsx`, `ops-layout.tsx`    | SCREEN-OPS-027 + hooks + route + nav                                                                  |
| `apps/site/src/app/[locale]/checkout/page.tsx`, `apps/site/src/lib/customer-hooks.ts`                    | SCREEN-CUS-005 checkout extras step + `useAvailableProducts`                                          |
| `packages/i18n/src/locales/{en,ar,fr}/common.json`                                                       | **863 keys** — `ops.prod.*` (33) + `checkout.extras*` (8) + (earlier) `ops.tpl.*` / `ops.cust.*`      |
| `e2e/tests/report.spec.ts`, `e2e/tests/booking.spec.ts`                                                  | SCREEN-OPS-027 + SCREEN-CUS-005 e2e                                                                   |

### Docs (untracked / modified)

`docs/ai-delivery/05-system-validation/**` (Stage 7 workspace),
`docs/ai-delivery/00-control/changes/CR-20260908-001/**`, `change-register.md`,
`pipeline-state.md`, `baseline-alignment.md`, `active-session.md` + this session folder,
`04-implementation/traceability-matrix.md`, `CHANGELOG.md`.

## Gate status at this checkpoint

`verify:static` PASS (openapi 116, drift OK) · `verify:i18n` PASS (863) · `verify:unit` PASS (89) ·
targeted `verify:api` green (`product` 6 + `booking` 8 + `template` 7 + `customer` 5 + `outbox` 4) ·
`verify:migrate` PASS (`0007`) · e2e targeted green (`report` 6/6, `booking` 3/3 laptop). Full
3-viewport `verify:e2e` + full `verify:api` + a11y/perf re-sweep → Phase 4.

## Notes

- No secrets in any changed file (`pnpm check:secrets` green at last run).
- `verify:e2e` re-renders committed PNGs under `stages/STAGE-000-platform/screenshots/` via
  `shot()`; reverted each run, not part of the change set. New shots this stage:
  `ops-customer-record.*`, `ops-templates-published.*`, `ops-products.*`, `cweb-checkout-extras.*`.
- Datastores for resume: `DEV_UP_FORCE_NATIVE=1 pnpm dev:up`.

## Phase 4 update (2026-09-08, supersedes the mid-loop numbers above)

- **All `CR-20260908-001` build items delivered** — D-1 → S7-DEF-006 → D-6 → D-3 → D-2 write
  side → D-4 event-rules. Migrations `0007`–`0011` (`0011_conscious_speed` =
  `customer_merge.moved_reservations`). **openapi 134 paths**, **i18n 968 keys/locale**,
  Drizzle schema **56 tables**.
- **`CR-20260907-001` reconciliation** — matrix FR-ADM rows re-stated, `SCREEN-CUS-*` old→new
  path map added, `cr-reconciliation.md` `S7-Q-014` closed.
- **Deep audit** — 3 latent/defensive hardening fixes (`SearchService.parseDate` 422 guard,
  `LocationAdminService.upsert` archive back-door guards, merge/unmerge `moved_reservations`
  tracking) + `S7-OPT-002` cross-tab auth sync implemented + e2e coverage additions. All tested.
- **Gate sweep — all 11 host-runnable `verify:*` gates PASS:** `verify:static` (openapi 134,
  drift OK) · `verify:i18n` (968) · `verify:theme` · `verify:unit` · **`verify:api` 146 / 146**
  in one clean run (12 Stage-7 specs green together, 61 tests) · `verify:migrate` (empty→current
  through `0011`) · `verify:security` · `verify:seo` · `verify:e2e` (laptop 40/40 + tablet 37/37
  - phone sweep/responsive/rtl/smoke 10/10) · `verify:a11y` · `verify:perf`.
- **Not done (user- or CI-gated):** `D-7` (user acceptance of FR/UI-UX/SRS v1.1 amendment docs),
  `CR-20260908-001` acceptance stage-gate, phone full-flow `verify:e2e` + Firefox/WebKit + k6 +
  ZAP/SAST + Lighthouse field run (bigger host / CI), and the mechanical Phase-4 close
  (traceability roll-up refreshed 2026-09-08; `pipeline-state` Stage 07 → `COMPLETED`,
  `baseline-alignment` → `ALIGNED`, `change-register` `CR-20260907-001` → `VERIFIED`/`CLOSED`,
  session folder → `sessions/completed/` — all gated on the acceptance above).
