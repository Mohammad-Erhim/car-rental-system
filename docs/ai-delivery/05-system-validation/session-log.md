# Stage 7 — Session Log

Append-only narrative of Stage 7 execution. One block per working interval. Detail lives in the
inventories, `coverage-matrix.md`, `defects.md`, and `checkpoints/`.

---

## 2026-09-08 — Interval 1 — Phase 0 init

- **Mode:** `START` (see `S7-DES-001` for why the existing empty session is adopted, not recreated).
- Read governing prompt, `docs/ai-delivery/README.md`, `manifest.md`, `pipeline-state.md`,
  `active-session.md`, `baseline-alignment.md`, `change-register.md`, the global session folder,
  and `04-implementation/` control files.
- Brought up the stack: native PostgreSQL 16 + Redis 7 (`S7-DES-002`), `pnpm install`
  (up to date), `pnpm db:migrate` (up to date at `0006`), `pnpm db:seed` (system + development),
  `pnpm build:packages` (clean).
- Scaffolded `docs/ai-delivery/05-system-validation/` (README, audit-source-manifest,
  current-state, defects, decisions, optimization-register, session-log, work-queue, checkpoints/,
  evidence/).
- **Baseline gate run (host-runnable):** `verify:static` PASS · `verify:i18n` PASS (779) ·
  `verify:theme` PASS · `verify:unit` PASS · `verify:api` PASS (102) · `verify:migrate` PASS (4) ·
  `verify:security` PASS (13) · `verify:seo` PASS. `verify:e2e` running; `verify:a11y` / `verify:perf`
  pending.
- **Findings:** `S7-DEF-001` (stale committed `openapi.json`, LOW). `S7-OPT-001` (dev datastore
  password papercut).
- **Next:** finish Phase 0 gate collection → `CHECKPOINT-0001` → Phase 1 inventory.

## 2026-09-08 — Interval 2 — Phase 3 fix loop (batch 1)

- Completed the baseline gate sweep: `verify:e2e` was **RED** on a clean run (`S7-DEF-003`,
  stale `smoke.spec.ts` after the `1efea67` dashboard commit) — the implementation stage's
  "verify:e2e 91 green" predated that commit. `verify:a11y` / `verify:perf` green.
- Phase 1 inventory written (`application-and-role`, `screen`, `interface-and-job`,
  `database-and-lookup`, `flow` inventories). 63 design screens reconciled → 8 gap candidates.
- Deeper reads surfaced `S7-DEF-002` (outbox never relayed), `S7-DEF-004` (booking trusts
  client extra prices/labels), `S7-DEF-005` (persistent refresh cookie defeated by a
  `sessionStorage` hint), `S7-DEF-006` (usage-count stub), and a cluster of unbuilt FR-ADM
  surfaces with over-claimed traceability rows.
- **Fixed + verified:** S7-DEF-003 (full `verify:e2e` green), S7-DEF-004 part 1 (`booking.spec`
  8/8 + tamper test), S7-DEF-005 (`auth-and-reference` e2e 9/9 + `storageState` regression),
  S7-DEF-001 (`openapi:check` `--check` gate; `verify:static` green), S7-OPT-001 (dev password).
- **Regression sweep after the fixes:** static / i18n 778 / theme / unit 89 / api 103 / e2e
  full — all green.
- Wrote `decision-list.md` (D-1..D-7) for the material scope calls (extras/protection,
  customer records, locations, templates, outbox scope, unified search, CR acceptance).
- **Next:** `S7-Q-014` CR-20260907-001 reconciliation; targeted Phase-3 runtime spot-checks.

## 2026-09-08 — Interval 3 — Phase 3 fix loop (batch 2) + runtime spot-checks

- Runtime spot-checks (native stack, direct API): `S7-DEF-002` confirmed (7 undelivered
  `outbox_message` rows after bookings); `S7-DEF-004` confirmed fixed (`extraCodes` → 422, legacy
  `extras[]` stripped, total == quote, server log clean). Horizontal/vertical-authz probe —
  vertical (customer→ops = 403) + self-scoping solid; reservation horizontal authz code-verified
  (`assertOwnerOrStaff`). Evidence in `evidence/{database,network,security}/`.
- `S7-DEF-007` recorded — `traceability-matrix.md` over-claims 4 FR-ADM rows + stale customer paths.
- `S7-DEF-006` re-scoped down — the `…/usage` endpoint is dead (UI never calls it); LOW.
- **`S7-DEF-002` FIXED** (per "continue with best practices" — `decision-list.md` D-5 option a):
  new `apps/api/src/common/outbox/outbox-relay.ts` (claim `for update skip locked` → dispatch to a
  handler registry → `delivered_at` / exponential-backoff / dead-letter → retention prune), a 15s
  `outbox-relay` worker job, the `outbox_backlog` gauge wired (metrics + refreshed on readiness),
  and `apps/api/test/outbox.spec.ts` (4 tests). Worker runtime-verified: `outbox relay tick
claimed:6 delivered:6 backlog:0`.
- Wrote `final-report.md` (DRAFT), `cr-reconciliation.md`; updated all tracking docs +
  `baseline-alignment.md` (Stage 7 note) + the global session state.
- **Next:** `verify:api` full re-run (outbox); then per "continue with best practices" — D-4
  (notification-template editor, content+preview+publish-gate slice) and/or D-2 (customer records
  read-side); then `S7-Q-014` traceability corrections; deep audit; Phase 4.

## 2026-09-08 — Interval 4 — Phase 3 batch 3: build the bounded FR-ADM slices ("continue with best practices")

- User: "procced with best practices - that is long running" → executed the decision-list
  recommendations autonomously.
- **`S7-DEF-002` fixed** (option a) — `outbox-relay.ts` + worker job + `outbox_backlog` gauge +
  `outbox.spec` 4/4; worker runtime-verified. `verify:api` 111.
- **D-4 built** — notification-template editor (content half): `TemplateService` +
  `/api/v1/ops/templates*` + `/ops/config/templates` screen + 41 i18n keys + `template.spec` 7 +
  e2e. Event-rules half deferred.
- **D-2 built** — customer records read side: `CustomerModule` + `GET /ops/customers[?q=|/:id]` +
  `/ops/customers` screen + i18n + `customer.spec` 5 + e2e. Test seed now creates a `customer`
  row. Merge + restriction write-workflow deferred.
- `verify:api` clean re-run **119** (a prior run's `rental.spec` setup hit a transient PG
  connection-kill under concurrent load with `verify:static`; green alone).
- **`CR-20260908-001` raised** (`PROPOSED`) — gathers D-1 (extras/protection), D-3 (locations
  editor), D-6 (unified search), the write-side halves of D-2/D-4, and `S7-DEF-006`. D-1 is a
  money-path change with design latitude — not built on assumptions.
- **`S7-Q-014` progressed** — `traceability-matrix.md` header warning + FR-ADM-001/006/007 rows
  re-stated `PARTIAL` + a Stage 7 delivery appendix; `CR-20260907-001/verification.md` "e2e
  green" line corrected. `SCREEN-CUS-*` path refresh still pending.
- Docs: `CHANGELOG.md`, `final-report.md`, `current-state.md`, `work-queue.md`, `decision-list.md`,
  `CHECKPOINT-0005.md`, `change-register.md`, `baseline-alignment.md` note.
- **Next:** ops e2e (`report`+`smoke`) re-run result; Phase 4 (a11y/perf re-sweep + deep audit)
  after the `CR-20260908-001` disposition.

## 2026-09-08 — Interval 5 — D-2/D-4 e2e verification + fixes

- Full `verify:e2e` re-run after the D-2/D-4 builds surfaced 2 UI bugs in the new screens (the
  API specs — `template.spec` 7, `customer.spec` 5 — were already green):
  1. `ops.tpl.bodyHint` i18n string contained a literal `{{variable}}` → `intl-messageformat`
     `MALFORMED_ARGUMENT` crash → the templates route hit the RouteError boundary. **Fixed** —
     reworded the string (no braces) in all 3 locales.
  2. `report.spec` customer test used `getByRole('heading', { name: 'Customers' })` — strict-mode
     violation (matched `<h1>Customers` + `<h3>Search customers`). **Fixed** — `exact: true`.
  3. `report.spec` template test assumed the seeded `reservation_confirmed` template had no
     declared vars; it has `reference` + `total`, so the body's `{{name}}` stayed undeclared.
     **Fixed** — the test body now only introduces `{{terms}}`.
  4. `TemplateService.get()` only surfaced `draft`/`published` rows, so after **submit** (status
     → `in_review`) the editor fell back to the published row and the Publish button vanished.
     **Fixed** — `get()` now surfaces `draft` **or** `in_review` as the open revision; `publish()`
     bumps past the max existing version (retired rows included) to avoid a
     `(key,channel,locale,version)` collision. `template.spec` 7 + `customer.spec` 5 still green;
     full dev-server probe of the draft→submit→publish flow green on the phone viewport.
- `customer` e2e (`report.spec:145`) passed in the first full run; `rental.spec:62` is flaky on
  this host (fails then passes on retry #1) — pre-existing, not Stage 7 code.
- Clean full `verify:e2e` re-running (`b2nr6891c`).

## 2026-09-08 — Interval 6 — D-2/D-4 e2e green; autonomous stretch complete

- Fixed the 4 D-2/D-4 UI-layer issues (ICU `{{}}` crash, strict heading selector, stale test
  assumption, `TemplateService.get()` losing the `in_review` row after submit + `templates-page`
  re-sync/`preview.reset()` racing a save).
- `verify:e2e` `report` spec (laptop) — **5/5**, incl. `report.spec.ts:113` (D-4 template
  draft→submit→publish) and `:150` (D-2 customer search→record). `template.spec` 7 +
  `customer.spec` 5 re-run green. `verify:static` / `i18n` 822 / `unit` 89 / `api` 119 green.
- Full 3-viewport `verify:e2e` OOMs when run cold on this 1.9 GB host (site rebuild + servers +
  Chromium); coverage is complete across the partial runs (phone/tablet all pre-existing specs
  green in `btwth6rm1`; laptop `report`/`smoke`/`auth` green here). A single clean full run is a
  Phase-4 item once the host has headroom / in CI.
- **Autonomous stretch complete.** 6 defects fixed + verified, `S7-OPT-001` applied, D-2 + D-4 +
  D-5 built + verified, `CR-20260908-001` raised for the rest. Stage 7 stays `IN_PROGRESS` —
  `CR-20260908-001` per-item decision + `D-7` are the user's; Phase 4 (deep audit + full
  regression + report finalisation) follows.

## 2026-09-08 — Interval 7 — user authorized full build; D-1 extras & protection

- User message: _"procced with best practices - that is long running - i am giving you the full
  permission"_ → `CR-20260908-001` moves from "await per-item decision" to **build all items
  autonomously**. `plan.md` + `verification.md` updated with the per-item tracker + build order.
- **Built D-1 (extras & protection, FR-ADM-006 vertical slice):**
  - `product` table — org-scoped `code`, `kind` (extra|protection), `unitPriceMinor`, `currency`,
    `taxable`, `maxQuantity`, `categoryScope`/`locationScope` (empty = everywhere), `sortOrder`,
    `active`. Migration `0007_zippy_crystal`; `migrate.spec` proves empty→current each API run.
  - `ProductService` — `list` / `availableFor(cat,loc)` / `resolveForBooking({extraCodes,…})`
    (the one authoritative pricing path: rejects unknown / inactive / out-of-scope /
    currency-mismatch / qty-over-`maxQuantity` with a 422; folds repeats to a quantity) /
    `upsert` / `setActive`. 5 seeded products.
  - Routes: `GET /catalogue/products?category=&location=` (`@OptionalAuth`); `GET|POST
/ops/catalogue/products` + `:code/{deactivate,restore}` (`catalogue.manage` to write,
    `catalogue.read`/`config.read` to view). `booking.confirm()` resolves `extraCodes`
    server-side → snapshotted `extra` reservation lines, taxed at the quote's effective rate.
  - `/ops/catalogue/products` screen (SCREEN-OPS-027) — list + upsert form + activate/deactivate;
    hooks + route (`catalogue.read`/`catalogue.manage`/`config.read`) + nav (`Package` icon) +
    i18n (`ops.prod.*`, 33 keys × 3 locales).
  - `apps/site` checkout extras step (SCREEN-CUS-005) — `useAvailableProducts` hook; steppers /
    toggles by `maxQuantity`; client-side estimate only; sends `extraCodes`; i18n
    (`checkout.extras*`, 8 keys × 3 locales).
  - Tests: `product.spec.ts` (6) — catalogue CRUD, scope filtering, booking pricing, qty cap;
    `booking.spec.ts` `S7-DEF-004` rewritten (legacy `extras` still stripped; `extraCodes:['gps']`
    → priced line; unknown code → 422) + new `SCREEN-CUS-005` extras-at-checkout e2e;
    `report.spec.ts` `SCREEN-OPS-027` ops-screen e2e. openapi regenerated (116 paths).
  - `verify:static` (lint+typecheck+format+openapi:check+drift) green; `verify:i18n` 863/locale
    green. e2e: `report` 6/6 + `booking` 3/3 on laptop.
- **Deferred → follow-up CR** (documented in `decision-list.md` D-1 + `traceability-matrix.md`):
  `config_version` governance for `product` (draft/approve/effective-date/terms-version),
  localized product name/description, stock limits, agreement/receipt template line integration
  beyond the reservation line.
- **Next:** `S7-DEF-006` reference-data usage counts → D-6 unified search → D-3 locations editor
  → write-side halves → CR reconciliation + Phase 4.

## 2026-09-08 — Interval 8 — S7-DEF-006 reference-data usage counts (FR-ADM-008)

- **`lookup.service.ts`** — replaced the `usage()` stub (`count: 0` always) with `LOOKUP_CONSUMERS`,
  an explicit, schema-verified map of lookup type → real consumer column(s):
  `cancel_reason`→`reservation.cancel_reason_code`; `block_reason`/`transfer_reason`→
  `vehicle_block.reason_code` (split on `kind`); `document_type`→`driver_document.doc_type`;
  `licence_type`→`driver.licence_type`; `country`→`driver.licence_country`;
  `vehicle_feature`→`vehicle_feature.code` + `vehicle_category_feature.feature_code`.
  Generic `*_event.reason_code` columns are **excluded on purpose** — their code space spans
  several types by `type`, so a naive count would over-report (a wrong map is worse than an
  honest zero).
- `usage()` now runs a real `count(*)` per reference and returns
  `{ consumers:[{surface,count}], totalReferences, tracked }`; `tracked:false` for an unmapped
  type so a `0` is not read as "safe to delete".
- **In-use guard:** `setActive(…, false)` → `422 lookup_value_in_use` unless `?force=true`
  (`lookup.controller.ts` threads the flag). System-managed values already blocked; no
  hard-delete path exists. Implements FR-ADM-008 "destructive change blocked when used".
- `zLookupUsage.tracked` (optional); `apps/web` `useLookupUsage` hook + `reference-data-page`
  deactivate confirm shows the count and sends `force` when in use
  (`ops.ref.deactivateInUse` i18n, 3 locales → 864 keys).
- Tests: `config-lookup.spec.ts` `TEST-LKP-014` (6 total) — untracked→`tracked:false`;
  mapped-idle→`total 0`; create a `vehicle_block` with `reason_code=maintenance`→count ≥ 1;
  deactivate without `force`→422; with `?force=true`→201. e2e `auth-and-reference` SCREEN-OPS-031
  asserts the confirm renders the usage line. `verify:static` + `verify:i18n` green.
- **Next:** D-6 unified reservation + rental search.

## 2026-09-08 — Interval 9 — D-6 unified reservation + rental search (FR-ADM-003)

- **New `SearchModule`** (`apps/api/src/modules/search/`) — `GET /ops/search`
  (`@Permissions('reservation.read','rental.read')`, and the service 403s an actor with neither).
  `SearchService.search()` runs a reservations query and a rentals query, merges, sorts by pickup
  desc, caps at `limit` (≤ 100):
  - free text (`q`, min 2) → `ilike` OR across `reservation.reference` / `quote_reference` /
    primary-driver `full_name` / `licence_number`; for rentals also `rental.reference` /
    `reservation_reference` / `vehicle_unit.plate` / `vin`. `%`/`_` escaped.
  - filters: `kind` (reservation | rental), `status` (state), `locationCode` (pickup), `from` /
    `to` (pickup window).
  - each `SearchHit`: `kind`, `reference`, `reservationReference` (rental→its booking), `status`,
    `overdue` (rental past scheduled return, not yet returned), `driverName`, pickup/return
    location + dates, `categoryCode`, `plate`, money, and `href` → `/work?ref=` or `/rentals?ref=`.
- `app.module.ts` registers `SearchModule`. openapi regenerated → 117 paths.
- **`apps/web`:** `useOpsSearch` hook (`admin-hooks.ts`); `/ops/search` screen
  (`surfaces/ops/search-page.tsx`) — query box + kind + location selects + results `DataTable`
  with a kind/overdue badge and a `Link` per row; route `/search` (`reservation.read` |
  `rental.read`); nav entry (`Search` icon, top of the Operations group); `ops.search.*` +
  `ops.nav.search` i18n (21 keys × 3 → 885 keys).
- **Tests:** `search.spec.ts` (6) — customer 403; 1-char `q` → 422; find reservation by
  reference (`href` → `/work?ref=`); a shared driver name returns **both** kinds and the rental
  carries its `reservationReference`; `kind=reservation` filters to reservations only;
  `locationCode` narrows (TST1 → ≥ 2 hits, NOPE → 0). e2e `report.spec.ts` SCREEN-OPS-004 —
  screen loads, a no-match query shows `0 result(s)` with no console error, kind filter works.
- `verify:static` (openapi 117) + `verify:i18n` (885) green; `search` + `config-lookup` +
  `rental` API specs green (18); `report` e2e 7/7 on laptop.
- **Next:** D-3 — locations / operating-hours editor (SCREEN-OPS-028, FR-ADM-007).

## 2026-09-08 — Interval 10 — D-3 locations & operating-hours editor (FR-ADM-007)

- **New `LocationAdminService` + `LocationAdminController`** in the config module, routes under
  `/ops` (`config.publish` to write, `config.read` to view):
  - `GET /ops/locations` (all incl. draft/archived); `GET /ops/locations/:code` (+ hours
    exceptions); `GET /ops/locations/:code/impact` (count of `pending`/`confirmed` reservations
    with a future pickup that pick up **or** return here).
  - `POST /ops/locations` — upsert by code: name, timezone, address, contact, weekly
    `regularHours` (`[{day,open,close,closed}]`, validated: valid `HH:MM`, `open < close`,
    else 422 `hours_inverted`), `afterHoursReturn`, pickup/return instructions,
    `supportedCategoryCodes`, `turnaroundMinutes`, status.
  - `POST /ops/locations/:code/archive` — runs the impact check; > 0 future reservations → 422
    `location_has_future_reservations` unless `?force=true`. `…/restore` flips back to `active`.
    A location is **archived, never deleted** (`get` still returns an archived location).
  - `POST /ops/locations/:code/hours-exceptions` (holiday/closure) + `/:id/remove`.
  - Each mutation audits + emits `lookup.invalidated.v1` (scope `location`) + busts the
    `config:locations` cache namespace.
- **`apps/web`:** `useOpsLocations` / `useOpsLocation` / `useOpsLocationImpact` / `useUpsertLocation`
  / `useLocationStatus` / `useAddHoursException` / `useRemoveHoursException` hooks;
  `/ops/config/locations` screen (`surfaces/ops/locations-page.tsx`) — location list + editor
  with a 7-row weekly-hours grid, exceptions list + add form, and an archive `ConfirmDialog` that
  shows the impact count; route `/config/locations` (`config.read` | `config.publish`); nav
  entry (`MapPin`, Configuration group); `ops.loc.*` + `ops.nav.locations` i18n (37 keys × 3 →
  922 keys).
- **Tests:** `location-admin.spec.ts` (4) — list + rental-agent 403; create → edit → inverted
  hours 422; add/remove a holiday exception; **impact + archive**: a future booking at TST1 →
  `impact.futureReservations ≥ 1`, archive without force → 422, with `?force=true` → 201
  (`status: archived`), still retrievable, `restore` → `active`. e2e `report.spec.ts`
  SCREEN-OPS-028 — edit JFK hours + add/remove a closure.
- `verify:static` (openapi 124) + `verify:i18n` (922) green; `location-admin` + `config-lookup` +
  `search` API specs green (16); `report` e2e 8/8 on laptop.
- **Next:** the write-side halves — customer-restriction create/approve + a booking/pickup
  **enforcement** guard; reversible customer merge; notification-template event-rules.

## 2026-09-08 — Interval 11 — write-side halves (FR-ADM-002 / FR-ADM-001 / FR-ADM-011)

User: _"procced with best practices - that is long running"_ → the three remaining
`CR-20260908-001` write-side halves, built one at a time.

### D-2 write side ① — eligibility-restriction workflow + enforcement (FR-ADM-002)

- Migration `0008` — `customer_restriction.status` (`pending_review` → `active` | `rejected`;
  `active` → `lifted`; default `'active'` so seeded rows stay valid) + `review_notes`.
- `CustomerRestrictionService` — `create` (→ `pending_review`, `isActive:false`), `decide`
  (`approve`/`reject`; **the author cannot approve their own** → `AppError.forbidden` 403;
  approve → `active` + `isActive:true` + `approvedBy`), `lift` (`active` → `lifted`,
  `effectiveTo := now`). `assertCanTransact(customerId, {categoryCode, locationCode, at})` — the
  enforcement point: an `active` `block` whose scope (`all` | `category:x` | `location:x`) and
  effective window match → `AppError.businessRule` 422 `customer_restricted`. `review`
  restrictions never block.
- `booking.confirm()` — when `actor.kind === 'customer'`, resolve the `customer` by `accountId`
  and call `assertCanTransact()` before payment. Staff-assisted bookings show the badge in the
  record instead (driver identity not asserted).
- Routes `GET|POST /ops/customers/:id/restrictions` + `:rid/{approve,reject,lift}`
  (`customer.manage`). `customer.detail()` restrictions now carry `status` / `reviewNotes` /
  `createdBy` / `approvedBy`.
- `apps/web` — `RestrictionsCard` on `/ops/customers` (list with status badges + create form +
  approve/reject/lift; the approve button is hidden for the author). `ops.cust.rstr*` i18n.
- `customer-restriction.spec.ts` (3) — agent 403; create → self-approve 403 → admin approves →
  booking denied 422 → lift → booking OK; scope discrimination (`location:TST2` inert on a TST1
  booking, `category:economy` blocks it); `review` never blocks. e2e `report.spec.ts`
  SCREEN-OPS-022 (manager raises → admin approves → lifts).
- **Test fix:** each `book()` now uses a fresh non-overlapping window (`dayCursor += 3`) — the
  earlier repeated-window bookings hit an availability/holder collision, not a restriction bug.

### D-2 write side ② — reversible customer merge (FR-ADM-001)

- Migration `0009` — `customer_merge` (`survivorId`, `mergedId`, `reason`, `movedDrivers[]`,
  `movedRestrictions[]`, `reversedAt`, `reversedBy`). `customer.status` already had `merged`.
- `CustomerMergeService.merge(actor, survivorId, mergedId, reason?)` — a transaction: repoint
  `driver.customerId` + `customer_restriction.customerId` (capturing the moved ids) + any
  `reservation.customerId` from the duplicate to the survivor; set the duplicate `status:'merged'`
  - `mergedIntoId`; insert the `customer_merge` record. **Never deletes.** `unmerge(actor,
customerId)` finds the newest un-reversed merge touching that id and reverses it from the
    record. Guards: same-customer 422, survivor must be `active`, duplicate not already `merged`.
- `POST /ops/customers/:id/merge {intoId}` + `POST …/unmerge` (`customer.manage`).
  `customer.detail()` gains `mergedIntoId` + `mergeHistory` (survivor's absorbed records).
- `apps/web` — `MergeCard` on `/ops/customers` (merge form / undo / history). `ops.cust.merge*` i18n.
- Test seed — a second account-less **"Test Customer II"** (email `…dup@…`) so the flow has two
  look-alike records. The SCREEN-OPS-021 record test + the restriction test now pick the
  account-backed record by exact name (`fullName === 'Test Customer'`).
- `customer-merge.spec.ts` (3) — agent 403; same-customer 422; put a `block` restriction on the
  duplicate → merge → `movedRestrictions:1`, duplicate `merged` + `mergedIntoId`, survivor
  carries the restriction + a `mergeHistory` entry → `unmerge` → restriction back on the
  duplicate (now `active`), survivor's history row `reversedAt` set. e2e — the `cust-merge` card
  renders with the merge form for a manager.

### D-4 event-rules half — notification event rules (FR-ADM-011)

- Migration `0010` — `notification_rule` (one row per `event` + `channel`: `enabled`, `audience`,
  `delayMinutes`, `quietHours` `{start,end}`, `maxAttempts`, `retryBackoffMinutes`,
  `escalateAfterAttempts`, `senderIdentity`) + `notification.sender`.
- `NotificationRuleService` — `list()` (a row per templated event, saved-or-default),
  `get`/`resolve(event, channel)` (effective rule; `isDefault` when unsaved), `upsert`
  (HH:MM + range validation), `setEnabled`. Absence = built-in default (enabled, primary_renter,
  no delay, 3 attempts, 15-min backoff).
- `notify.send()` — `resolve()` the rule: a **disabled** event still persists the `notification`
  row but as `deliveryState:'suppressed'` + `lastError:'rule_disabled'` and skips the send; the
  `senderIdentity` is stamped on `notification.sender` regardless. Delay / quiet-hours /
  escalation are stored + surfaced — a scheduler enforcing them is a documented follow-up.
- Routes on the templates controller: `GET|POST /ops/notification-rules` +
  `:event/:channel/{enable,disable}` (`config.publish`).
- `apps/web` — `RuleCard` below the template editor for the selected event+channel (toggle,
  audience, sender, delay, quiet hours, retry, escalate). `ops.rule.*` i18n.
- `notification-rule.spec.ts` (4) — list defaults; agent 403; malformed quiet hours 422; disable
  → the confirmation notification is `suppressed`/`rule_disabled`; re-enable + `senderIdentity`
  → next send is not suppressed and carries `sender:'bookings'`. e2e SCREEN-OPS-033 extended.

### Gates

`verify:static` (openapi **134**, drift OK) + `verify:i18n` (**966**) green after each half.
Targeted `verify:api` green per feature (restriction 3 · merge 3 · notification-rule 4, plus no
regression in `booking` 8 · `customer` 5 · `template` 7 · `outbox` 4 · `rental` 6 · `search` 6 ·
`location-admin` 4). `report` e2e **9/9** + `booking` 3/3 + `auth-and-reference` 5/5 on laptop.

### Autonomous build complete

Every `CR-20260908-001` item is delivered + verified. Stage 7 stays `IN_PROGRESS` for Phase 4
(deep audit + full regression + report finalisation) and the user's `D-7` / CR acceptance.

- **Next:** CR-20260907-001 reconciliation (`S7-Q-014` `SCREEN-CUS-*` path refresh) → Phase 4.

## 2026-09-08 — Interval 12 — CR-20260907-001 reconciliation + Phase-4 gate sweep

### `S7-Q-014` — CR-20260907-001 reconciliation (docs complete)

- `traceability-matrix.md`: header warning rewritten; **every** over-claimed FR-ADM row
  (001/002/003/006/007/008/011) re-stated to describe what now exists after the
  `CR-20260908-001` builds, each with a `PARTIAL` note + follow-up-CR pointer; the Stage 7
  delivery-status appendix carries an **old→new `SCREEN-CUS-*` code-path map**
  (`apps/web/src/surfaces/customer/*` + pre-split routes → `apps/site/src/app/[locale]/**`),
  verified against the `apps/site` tree.
- `cr-reconciliation.md` blockers 1–3 cleared (matrix corrections; D-1..D-6 built; outbox done).
  Blocker 4 (uncommitted) is by design. `S7-DEF-007` → ADDRESSED.
- `baseline-alignment.md` "Stage 7 update 3" note; `change-register.md` `CR-20260908-001` →
  `BUILT — awaiting acceptance`.

### Phase-4 gate sweep — host-runnable gates, all clean end-to-end

| Gate              | Result                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `verify:static`   | PASS — lint + typecheck + format + `openapi:check` (134) + drift                                                        |
| `verify:i18n`     | PASS — 966 keys/locale                                                                                                  |
| `verify:theme`    | PASS                                                                                                                    |
| `verify:unit`     | PASS — API 89 + web 13                                                                                                  |
| `verify:api`      | **PASS — 146 tests / 24 files, one clean single run** (incl. all 11 new/rewritten specs)                                |
| `verify:migrate`  | **PASS 4/4** — proves empty→current with `0007`–`0011`                                                                  |
| `verify:security` | **PASS 13/13** — re-run clean                                                                                           |
| `verify:seo`      | **PASS** — re-run clean (6 routes × en/ar/fr + robots + sitemap + private noindex)                                      |
| `verify:a11y`     | **PASS 2/2** — axe-core 0 serious/critical on customer + ops surfaces (incl. every new `/ops` screen)                   |
| `verify:e2e`      | full laptop-viewport run in progress; targeted subset (`report` 9 · `booking` 3 · `auth-and-reference` 5) already green |
| `verify:perf`     | baseline PASS; `perf-site` re-run deferred                                                                              |

9 of 11 host gates run clean after the full change set. `final-report.md` updated (still
`IN_PROGRESS` — Phase-4 deep audit + fresh screenshots + the user's `D-7` / CR acceptance
remain).

## 2026-09-08 — Interval 13 — Phase-4 code-review pass + remaining gates

- **`verify:perf` re-run clean** — perf-smoke (`/health/ready`, `/meta/locales`,
  `/discovery/search` within budget) + perf-site (every first-load JS within budget; `/checkout`
  heaviest at 240 KB br ≤ 285 — the D-1 extras step didn't blow the budget). **→ all 11
  host-runnable `verify:*` gates now pass.**
- **`verify:e2e` phone viewport** — `full-sweep` + `responsive` + `rtl` + `smoke` 10/10. Then
  found `full-sweep.spec.ts` `OPS_ROUTES` didn't list the 5 new screens — **added**
  `/ops/{search,customers,catalogue/products,config/locations,config/templates}`; re-ran
  `full-sweep` on **phone + laptop** → 3/3 + 3/3, every new `/ops` screen overflow-clean at
  390 px and 1440 px, RTL included.
- **Code review + deep audit — 3 hardening fixes (all latent / defensive, not live defects):**
  1. **`CustomerMergeService` reversibility.** `merge()` repointed `reservation.customerId` from
     the duplicate but `unmerge()` reversed it with `WHERE reservation.customerId = survivorId` —
     which would also move the survivor's **own** reservations if that column were ever populated
     (it is `null` everywhere today — nothing sets it). Fixed: `merge()` records the repointed
     ids in `customer_merge.moved_reservations` (**migration `0011`**); `unmerge()` restores
     **only those** (`inArray(reservation.id, …)`), consistent with drivers + restrictions.
  2. **`LocationAdminService.upsert()` archive back-door.** `POST /ops/locations` with
     `status: 'archived'` skipped the future-reservation impact check that the dedicated
     `/archive` route runs. Fixed: `upsert` rejects `status: 'archived'` (422 `archive_via_action`)
     and rejects editing an already-archived location without restoring first (`location_archived`).
  3. **`SearchService` date-filter crash.** `GET /ops/search?from=garbage` →
     `new Date('garbage').toISOString()` `RangeError` → **500**. Fixed: `parseDate()` guard →
     422 `invalid_string`.
  - `assertCanTransact()` (restriction enforcement) and the `notify.send()` rule gate reviewed —
    correct (scope match, effective window, 422; a suppressed send never throws so the booking
    `try/catch` is unaffected, sender stamped regardless).
- **Test coverage added:** `customer-restriction.spec` reject path (rejected → never active →
  cannot be re-approved/lifted); `location-admin.spec` archive-via-upsert guard; `search.spec`
  malformed-date → 422. All Stage-7 API specs green together (`vitest run` 12 files / 61 tests).
- **UI review — 5 new `/ops` screens + checkout extras:** `RuleCard` had no save-error feedback
  (fire-and-forget `save.mutate`) — added `save.isError` / `save.isSuccess` lines +
  `ops.rule.saveFail` / `ops.rule.saved` i18n. Products / locations / customers / search screens
  reviewed — client `Number()` parsing degrades safely (`|| 0`, server Zod is the gate),
  loading / error / empty states present, overflow-clean (phone + laptop).
- **`S7-OPT-002` IMPLEMENTED** — cross-tab auth sync. Both `AuthProvider` mount effects add a
  `window.addEventListener('storage', …)` on `SESSION_HINT_KEY`: `newValue === '1'` (sign-in
  elsewhere) → silent `doRefresh()`, anything else (sign-out) → `clearSession()`; torn down on
  unmount. e2e `auth-and-reference.spec.ts` `S7-OPT-002` (sign in tab A → tab B authed → sign
  out tab A → tab B → `/sign-in`) 6/6. `report` + `booking` e2e 12/12 after the web rebuild.
- **Docs:** migration refs `0007`–`0010` → `0007`–`0011` across the control plane; gate tables
  updated to "all 11 pass" + laptop/tablet full e2e; `optimization-register.md` S7-OPT-002 →
  IMPLEMENTED; this log + `CHECKPOINT-0008` + `current-state.md` + `final-report.md`.

---

## 2026-09-08 — Stage 7 close (CR acceptance + mechanical close)

- **CI reality:** repo has no CI (`.github/workflows/` absent) and is private; no paid Actions
  stood up. The 3-viewport `verify:e2e` was completed here by running the per-project suites
  separately (the chained single invocation OOMs cold on the 1.9 GB host).
- **Phone-viewport e2e:** ran the full phone set — **42 green** (discovery, booking,
  reservation-ops, rentals, report, account/i18n, auth, full-sweep, rtl, smoke; +2 a11y
  project-skips). Combined with laptop 40 + tablet 37, `verify:e2e` now covers all 3 viewports.
- **Acceptance (owner-delegated — "you decide … based on best professional practices"):**
  - `CR-20260907-001` → **ACCEPTED**. Additive v1.1 documentation of shipped, tested capability;
    no v1.0 stable ID disturbed; the independent Stage-7 reconciliation it awaited has run.
    `00-control/changes/CR-20260907-001/acceptance.md`.
  - `CR-20260908-001` → **ACCEPTED**, independence caveat recorded (builder = acceptor). Mitigated
    by `verify:api` 146/146 + e2e on 3 viewports + 11/11 host gates + a transparent follow-up-CR
    list. `00-control/changes/CR-20260908-001/acceptance.md`.
  - Both → **CLOSED** at the mechanical close.
- **4 external-tool gates** (Firefox/WebKit e2e, k6, ZAP/SAST, Lighthouse field run) — the owner
  accepted them as documented pre-prod CI follow-ups ("accept them"). Registered as
  `CR-20260908-008` (`PROPOSED`). `BLOCKED`, not downgraded; each has a green internal-evidence
  substitute (`final-report.md` §7).
- **Follow-up CRs created (`PROPOSED`, stub `request.md` each):** `CR-20260908-002..007` (deferred
  FR-ADM depth) + `CR-20260908-008` (pre-prod CI gates).
- **Mechanical close:** `final-report.md` → `COMPLETED` + release-readiness statement;
  `pipeline-state.md` Stage 07 → `COMPLETED`; `change-register.md` CRs → `CLOSED`;
  `baseline-alignment.md` all rows `ALIGNED` (updates 4–5); `manifest.md` v1.1 rows +
  `latest_system_validation`; `current-state.md` / `work-queue.md` closed; `CHECKPOINT-0009`
  written; session folder → `sessions/completed/`; `active-session.md` pointer cleared;
  `CHANGELOG.md` finalised.
- **Commits:** `56e3b64` (Stage 7 code delta, 126 files) + `59f38cb` / `f4f398b` / `b6c3c22` /
  the close commit — all on `origin/implementation`. Screenshot PNGs (240) deliberately
  uncommitted (regenerable, `S7-OPT-003`); a full bundle was delivered to the owner out-of-band.
- **Result:** Stage 7 `COMPLETED`; system `END-USER RELEASE-READY` for the verified environments.
