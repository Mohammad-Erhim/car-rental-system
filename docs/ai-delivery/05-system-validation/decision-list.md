# Stage 7 — Decisions the user needs to make

Stage 7 fixes everything that is a **small, source-consistent repair** autonomously. The items
below are **material scope calls** (net-new features, or a requirement that would need a CR to
change). Each has Stage 7's analysis + recommendation. Nothing here blocks the fixes already
applied; they block **Stage 7 sign-off as "release-ready against the full accepted FR"**.

Context: the "Enhancement Program" (STAGE-009–013) added theming / i18n / Next.js / SEO / ops-UX
and cleaned up the STAGE-005/006 deferrals, but several **original FR-ADM operations/admin
surfaces were never built**, and `04-implementation/traceability-matrix.md` marks some of them
`COMPLETED` against unrelated features (e.g. FR-ADM-001 "manage customer records" → mapped to the
reservation queue). `CR-20260907-001` does **not** re-scope these away.

---

## D-1 — `S7-GAP-EXTRAS`: extras & protection products (FR-ADM-006 / FR-PRC-005-006 / SCREEN-CUS-005 / SCREEN-OPS-027) — ✅ VERTICAL SLICE BUILT (2026-09-08) → `CR-20260908-001`

- **What's there:** nothing real. `POST /bookings/confirm` used to take client-priced `extras`
  (now closed — `S7-DEF-004`). No `product`/`extra` catalogue table, no admin screen, no checkout
  step on `apps/site`.
- **What FR-ADM-006 requires:** a governed catalogue of localized extras/protection products —
  applicability, pricing, stock/quantity limits, included/excluded categories & locations,
  effective dates, terms versions, active state; historical selections keep their accepted label
  & price; "public choices, fleet prep, agreement content, and final charges use the same
  configured product version."
- **Effort:** large — new table + `config_version` kind `product` + `/ops` admin surface
  (SCREEN-OPS-027) + quote-time pricing of selected codes + `apps/site` checkout step
  (SCREEN-CUS-005) + agreement/receipt line integration + tests. ~2–4 days.
- **What was built (2026-09-08):** `product` table (migration `0007`) — org-scoped `code`,
  `kind` (extra|protection), `unitPriceMinor`, `currency`, `taxable`, `maxQuantity`,
  `categoryScope`/`locationScope` (empty = everywhere), `sortOrder`, `active`. 5 seeded products
  (full/basic protection, additional driver, child seat, GPS). `ProductService`:
  `list` / `availableFor(cat, loc)` / `resolveForBooking({extraCodes,…})` (the one authoritative
  pricing path — rejects unknown / inactive / out-of-scope / currency-mismatch /
  qty-over-`maxQuantity` with a 422; folds repeats to a quantity) / `upsert` / `setActive`.
  Routes: `GET /api/v1/catalogue/products?category=&location=` (`@OptionalAuth`, customer
  surface), `GET|POST /api/v1/ops/catalogue/products` + `:code/{deactivate,restore}`
  (`catalogue.manage` to write, `catalogue.read`/`config.read` to view). `booking.confirm()`
  resolves `extraCodes` server-side, prices each as a snapshotted `extra` reservation line, and
  taxes them at the quote's effective rate. `/ops/catalogue/products` screen (SCREEN-OPS-027):
  list + upsert form + activate/deactivate. `apps/site` checkout gains an extras step
  (SCREEN-CUS-005) — steppers / toggles by `maxQuantity`, client-side estimate only, sends
  `extraCodes`. Tests: `product.spec.ts` (6), `booking.spec.ts` `S7-DEF-004` rewritten,
  `report.spec.ts` + `booking.spec.ts` e2e. openapi regenerated (116 paths).
- **Deferred to a follow-up CR (documented):** `config_version` governance for `product` (drafts
  / approval / effective-dating / terms-version binding), localized product name/description,
  stock limits, agreement & receipt template line integration beyond the reservation line.

## D-2 — `S7-GAP-CUSTOMERS`: customer records & eligibility (FR-ADM-001, FR-ADM-002 / SCREEN-OPS-021, SCREEN-OPS-022) — ✅ READ + WRITE BUILT (2026-09-08)

- **What's there:** `customer`, `customer_restriction`, `driver`, `driver_document` tables +
  `customer.read` / `customer.manage` permissions — but **no `/ops/customers` route and no
  customer controller**. The traceability matrix maps FR-ADM-001 to the reservation queue, which
  is a different thing.
- **What FR requires:** search customers by permitted identifiers; a consolidated record (contact,
  drivers, reservations, rentals, balances, cases, consent, restrictions); audited corrections;
  duplicate review before merge; and (FR-ADM-002) restriction/review flags with category, scope,
  dates, evidence, approver, review path — not creatable by unauthorized support staff.
- **Effort:** medium–large. A read-mostly consolidated customer view is medium (much of the data
  is already exposed by other endpoints). Duplicate-merge + the full restriction approval
  workflow are the large parts.
- **Recommendation:** **build the read-side now** — done. New `CustomerModule`:
  `GET /api/v1/ops/customers?q=` (min-2 query, masked contact in the list, active-restriction
  badge) + `GET /api/v1/ops/customers/:id` (consolidated: contact in full, saved drivers,
  reservations, rentals, balance, open recovery cases, active `customer_restriction` rows —
  FR-ADM-002 read-only). `/ops/customers` screen (search → record). `customer.read` gates both;
  `finance_staff` 403s. `customer.spec.ts` (5) + a `report.spec.ts` e2e; the test seed now
  creates a `customer` profile row.
- **Write side built (2026-09-08):**
  - **Eligibility restrictions (FR-ADM-002):** `customer_restriction.status` + `review_notes`
    (migration `0008`). `CustomerRestrictionService` — `create` (→ `pending_review`, `customer.manage`),
    `decide` (`approve`/`reject`; the **author cannot approve their own** — 403), `lift`;
    `assertCanTransact(customerId, {categoryCode, locationCode, at})` is the enforcement point,
    called from `booking.confirm()` for a customer booking → **422 `customer_restricted`** for an
    in-scope active `block`. `review` restrictions never block. `RestrictionsCard` on
    `/ops/customers`. `customer-restriction.spec.ts` (3) + e2e `report.spec.ts` SCREEN-OPS-022.
  - **Reversible merge (FR-ADM-001):** `customer_merge` table (migration `0009`).
    `POST /ops/customers/:id/merge {intoId}` folds the duplicate into the survivor — moves its
    `driver` + `customer_restriction` rows, repoints `reservation.customerId`, marks the
    duplicate `merged` + `mergedIntoId` (**never deleted**), records the moved ids;
    `POST …/unmerge` reverses it from that record. `customer.detail()` gains `mergeHistory` +
    `mergedIntoId`. `MergeCard` on `/ops/customers`. `customer-merge.spec.ts` (3) + e2e.
- **Deferred to a follow-up CR (documented):** automated duplicate _detection_ (fuzzy match /
  suggestions); rental-pickup enforcement of restrictions; the customer-facing restriction
  explanation.

## D-3 — `S7-GAP-LOCATIONS`: location & operating-policy admin (FR-ADM-007 / SCREEN-OPS-028) — ✅ EDITOR BUILT (2026-09-08) → `CR-20260908-001`

- **What's there:** `location`, `location_hours_exception`, `one_way_route` tables; `GET
/config/locations` **read-only**; operating hours **are** consumed (discovery gates on them).
  No editor.
- **What FR requires:** manage locations, localized public content, addresses, hours + holiday
  hours, pickup/return instructions, after-hours capability, supported categories, one-way routes,
  location policies; changes show future-reservation impact; a location with history is archived,
  not erased.
- **What was built (2026-09-08):** `LocationAdminService` + `LocationAdminController` under
  `/ops` (config module) — `GET /ops/locations` (all incl. draft/archived), `GET
/ops/locations/:code` (+ hours exceptions), `GET /ops/locations/:code/impact`
  (future pending/confirmed reservations picking up or returning here), `POST /ops/locations`
  (upsert by code: name, timezone, address, contact, weekly `regularHours`, `afterHoursReturn`,
  pickup/return instructions, `supportedCategoryCodes`, `turnaroundMinutes`, status),
  `POST /ops/locations/:code/archive` (impact check → 422 `location_has_future_reservations`
  unless `?force=true`) + `/restore`, `POST /ops/locations/:code/hours-exceptions` + `/:id/remove`.
  Inverted hours (`open >= close`) → 422 `hours_inverted`. `config.publish` to write,
  `config.read` to view. `/ops/config/locations` screen — list + editor (7-row weekly-hours
  grid, exceptions, archive with impact confirm). `location-admin.spec.ts` (4) + e2e
  `report.spec.ts` SCREEN-OPS-028.
- **Deferred → follow-up CR (documented):** one-way-route pricing editor, per-location localized
  public content (the `translation` namespace), the map-coordinate confirmation flow
  (FR-INT-003), and owned reaccommodation-task generation on closure.

## D-4 — `S7-GAP-TEMPLATES`: notification template editor + event rules (SCREEN-OPS-033 / FR-ADM-011) — ✅ CONTENT + EVENT-RULES BUILT (2026-09-08)

- **What's there:** `template` table (15 rows, seeded), rendered by `notify.service`. Translation
  workflow exists for UI strings. No `/ops` template editor.
- **Content half (2026-09-08):** `TemplateService` + `/api/v1/ops/templates*` (list / get /
  readiness / draft / preview / submit / publish), `/ops/config/templates` screen,
  `template.spec.ts` (7) + a `report.spec.ts` e2e. Subject / body / declared variables, preview
  with sample values, draft → in&nbsp;review → published with a validation gate (undeclared
  `{{vars}}` block save; required legal vars must appear to publish; version bumps + supersedes
  prior published; emits `notify.template.published.v1`).
- **Event-rules half (2026-09-08):** `notification_rule` table (migration `0010`) + `notification.sender`
  column. `NotificationRuleService` — one rule per (event, channel): `enabled`, `audience`,
  `delayMinutes`, `quietHours`, `maxAttempts`, `retryBackoffMinutes`, `escalateAfterAttempts`,
  `senderIdentity`; absent = built-in default. `GET|POST /ops/notification-rules` +
  `:event/:channel/{enable,disable}` (`config.publish`). `notify.send()` **suppresses** a
  disabled event (`deliveryState: 'suppressed'`, `lastError: 'rule_disabled'`) and stamps
  `notification.sender` from the rule. `RuleCard` on the templates screen.
  `notification-rule.spec.ts` (4) + `report.spec.ts` SCREEN-OPS-033 e2e.
- **Deferred to a follow-up CR (documented):** a scheduler that actually enforces `delayMinutes`
  / `quietHours` / `escalateAfterAttempts` (stored + surfaced today); per-channel content
  variants; A/B or locale-specific rules.

## D-5 — `S7-DEF-002` scope: transactional outbox relay — ✅ DONE (option a)

- **The defect:** `OutboxService.emit()` writes `outbox_message` rows; **nothing ever relays or
  prunes them**; the `outboxBacklog` metric is declared but unwired. Contradicts SRS-FLOW-002 /
  IF-EVT-OUTBOX. No user-visible break today (the one critical propagation uses in-process
  `CacheBus`), but unbounded table growth + a latent correctness gap.
- **Options:** (a) **minimal correct fix** — a relay in `worker.ts` that claims undelivered rows
  (`for update skip locked`), dispatches to an in-process handler registry (cache-bust +
  notification enqueue — the consumers that actually exist), marks delivered, bounded retry →
  dead-letter; + a retention prune; + wire the gauge. External integration fan-out recorded as
  explicitly deferred (no external consumers in scope). (b) full event bus — out of scope.
- **Recommendation:** **(a)**. It's contained (~1 file + a small test), closes the SRS gap and
  the table-growth risk. Stage 7 can do this autonomously if you approve the scope.

## D-6 — `S7-GAP-UNIFIED-SEARCH`: unified reservation + rental search (FR-ADM-003 / SCREEN-OPS-004) — ✅ BUILT (2026-09-08) → `CR-20260908-001`

- **What's there:** `/ops/work` (reservation queue) and `/ops/rentals` (rental board) as separate
  surfaces, each with its own filters.
- **What FR-ADM-003 requires:** one search across reservations **and** rentals by reference,
  customer, driver, location, dates, vehicle/category, status, payment state, channel, assigned
  staff; results distinguish the two; "find an overdue rental from its plate or reservation
  reference and reach the permitted next action"; saved views.
- **What was built (2026-09-08):** `SearchModule` — `GET /ops/search`
  (`reservation.read` OR `rental.read`) unified over `reservation` + `rental`: free text matches
  reference, quote reference, primary-driver name / licence, and (rentals) vehicle plate / VIN;
  `kind` (reservation | rental), `status`, `locationCode`, `from` / `to` (pickup window) filters;
  each hit carries `kind`, an `overdue` flag (rental past its scheduled return), the linked
  `reservationReference`, and an `href` to the surface that owns the next action. `/ops/search`
  screen (search box + kind + location filters + results table) + nav entry. `search.spec.ts`
  (6) — permission gate, min-length, by-reference, both-kinds by shared driver, `kind` filter,
  location filter; e2e `report.spec.ts` SCREEN-OPS-004.
- **Deferred → follow-up CR (documented):** saved views; the assigned-staff / payment-state /
  channel / vehicle-category facets; a combined detail drawer (the screen links out to the
  existing `/ops/work` + `/ops/rentals` surfaces).

## D-7 — `CR-20260907-001` acceptance

- v1.1 amendment **drafts** exist for FR / UI-UX / SRS (documenting the Enhancement Program).
  Stage 7 will verify they match the shipped code, correct them, and fold in the decisions above,
  then this CR can be accepted and `baseline-alignment.md` moved to `ALIGNED`.
- **Recommendation:** let Stage 7 finish `S7-Q-014` (reconcile + correct the drafts), then you
  do a single acceptance pass over the three v1.1 docs.

---

## Suggested answer if you want the shortest path to "done"

Approve **D-1 minimal slice**, **D-2 read-side**, **D-4 build it**, **D-5 option (a)**; defer
**D-3** and **D-6** to a named follow-up CR; then Stage 7 completes `D-7`. That closes every
FR-ADM acceptance test with bounded, source-consistent work and leaves only explicitly-deferred
depth.
