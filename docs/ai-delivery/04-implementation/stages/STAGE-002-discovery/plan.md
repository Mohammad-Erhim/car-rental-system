# STAGE-002 — Discovery & quote · plan

## Objective / outcome

A customer can search a location + date/time window and see vehicle options they can **actually
book** — real-time availability from fleet inventory minus overlapping reservations/rentals,
active holds, operating hours, and turnaround buffer. Selecting an option produces an itemised,
versioned, time-limited **quote**; proceeding places a short **checkout hold** on the unit/class.
Ops can manage the catalogue (categories, features), locations (hours, one-way routes), and rate
plans that feed the quote.

## Source IDs

FR-CAT-001..007, FR-PRC-001..007, FR-FLT-002, FR-ADM-005/007;
SCREEN-CUS-001 (search), -002 (results), -003 (vehicle detail);
SCREEN-OPS-013 (fleet inventory, read), -015 (locations), -025/026 (pricing/rate plans), -028 (holds/availability admin);
FLOW-CUS-001 (discovery half), FLOW-OPS-013 (rate publish);
SRS-AVL-001..010, SRS-PRC-001..009, SRS-CAT-001..006, SRS-DAT-\* (new aggregates), SRS-API-\* (list/filter/cursor), SRS-LKP (catalogue lookups).

## Backend (`apps/api/src/modules`)

1. **`catalogue`** — vehicle categories (code, class, display order, image ref), vehicle
   features (lookup-backed), category ↔ feature map, per-location supported categories.
   Read API (public, cache/ETag) + management API (`catalogue.manage`), audit + outbox.
2. **`fleet`** (partial — inventory read only this stage) — `vehicle_unit` (VIN/plate bidi-safe,
   category, home location, status via system-fixed `vehicle_state`), read/list for availability
   - SCREEN-OPS-013. Full fleet ops (transfers/maintenance/blocks) stay in STAGE-005.
3. **`availability`** — the core engine: given location + window + category, compute bookable
   count = units at/through location − overlapping reservations − overlapping rentals − active
   holds − maintenance/blocks, filtered by operating hours (pickup/return must fall in open
   hours unless after-hours allowed) and turnaround buffer between rentals. Deterministic,
   unit-testable; exposes `search()` (per category) and `checkAndHold()`.
4. **`pricing`** — rate plans (per category/location/date range, base + time-unit tiers,
   min/max duration), rules for extras/one-way/young-driver later; `quote()` returns itemised
   lines (base, distance/'day' tiers, location fees, taxes) that **sum to the total**; quote is
   persisted with a `version` and `expiresAt`; re-quote on expiry. Rate publish is versioned —
   publishing never mutates a prior accepted quote.
5. **holds** — `hold` aggregate (unit or class-level, `expiresAt`, actor, state); created by
   `checkAndHold` inside a tx with `SELECT … FOR UPDATE` / conditional insert so **two concurrent
   customers cannot hold the same last unit**; released on expiry (worker) or on
   booking/abandon.

## Web

- **SCREEN-CUS-001 Search** — location picker (from `/config/locations`), date/time range with
  operating-hours hints, optional filters; `FLOW-CUS-001`. Uses `EntityPicker` + a date-range
  control (new `COMP-SH`).
- **SCREEN-CUS-002 Results** — category cards with price-from, availability state
  (fresh/stale/no-results per SRS-UI), sort/filter (`FilterSortBar` — new). Re-runs availability
  on filter/date change; stale banner on window change.
- **SCREEN-CUS-003 Vehicle detail** — features, rate breakdown preview, "reserve" → creates a
  quote + hold and routes toward checkout (checkout itself is STAGE-003).
- **Ops:** SCREEN-OPS-013 fleet inventory (read/list + filters), SCREEN-OPS-015 locations
  (hours, one-way routes, supported categories — CRUD, versioned), SCREEN-OPS-025/026 rate plans
  (create/edit/preview/publish with approval), SCREEN-OPS-028 availability/holds admin (inspect,
  force-release a stuck hold with reason + audit).
- Shared components to add: `DateRangeField`, `FilterSortBar` (COMP-SH-010), `DataTable`/adaptive
  list (COMP-SH-011), `StepProgress` (COMP-SH-012) for the discovery→checkout rail.

## Acceptance / tests

- **Availability correctness (unit):** overlapping windows, turnaround buffer, closed hours,
  after-hours flag, maintenance/blocks — table-driven cases; fresh/stale/no-result API states.
- **Concurrency (integration):** two `checkAndHold` calls for the last unit in the same window
  → exactly one succeeds, the other gets `no_availability`; expired hold is reclaimed by the
  worker and the unit is bookable again.
- **Quote integrity (integration):** sum of quote lines == total; quote `expiresAt` respected;
  a rate-plan publish after a quote is issued does not change that quote; re-quote after expiry
  produces a new `version`.
- **Catalogue/locations (integration):** category/feature/rate CRUD with audit + outbox;
  invalid rate (min > max duration, negative tier) cannot be published; a deactivated category
  disappears from search but historical quotes still resolve it.
- **E2E (3 viewports + guards):** FLOW-CUS-001 search → results → detail → "reserve" lands on a
  quote with a running hold timer; changing the date window re-prices and shows the stale→fresh
  transition; no-availability path shows the recoverable empty state; an ops user publishes a
  rate plan and the customer price-from reflects it. Responsive + 1 RTL screenshot of results.
- `verify:static | unit | api | migrate | e2e` all green; screenshots in
  `stages/STAGE-002-discovery/screenshots/`.

## Migrations / data

- New tables: `vehicle_category`, `vehicle_feature_map`, `vehicle_unit`, `rate_plan`,
  `rate_tier`, `quote`, `quote_line`, `hold`. Extend `location` with `supported_category_codes`
  already present (STAGE-000) — add `hours_exception` usage.
- Seed (development): ~2 categories per class across the 3 seeded locations, a handful of units
  per category, one published rate plan per category/location, so search returns real options.

## Risks / notes

- Availability is the highest-risk correctness surface — build it engine-first, pure functions
  over injected repositories, exhaustive unit tests before wiring HTTP.
- Keep `pricing` money in integer minor units end-to-end; quote line rounding rule fixed and
  tested (half-up on the line, total = sum of lines — never re-round the total).
- Holds must have a single owning code path (`availability.checkAndHold`) — no direct `hold`
  inserts elsewhere.
