# STAGE-002 — checkpoint

- **Status:** COMPLETED (2026-09-07).
- **Current subtask:** none — stage gate passed.
- **Objective met:** a customer searches a location + window and sees vehicle classes they can
  actually book — real-time availability from fleet inventory minus overlapping blocks and
  holds, filtered by operating hours and turnaround; selecting a class produces an itemised,
  versioned, expiring quote and places a short checkout hold; ops manages categories/features,
  fleet inventory (read), rate plans (draft → publish, immutable once published), and holds.

## Completed work

### API (`apps/api/src`)

- **`modules/availability`**
  - `availability.engine.ts` — pure: `computeAvailability` (free units = candidates with no
    turnaround-padded conflict; bookable = free − class holds, never negative), `isUnitFree`,
    `overlaps`, `pickFreeUnit`. 15 unit tests.
  - `operating-hours.ts` — pure: `localParts` (instant → location wall clock via `Intl`),
    `checkWithinHours` (weekly hours + date exceptions + after-hours-return flag). 9 unit tests.
  - `availability.service.ts` — `search()` (per category: candidate units + blocks + class
    holds → engine → price via pricing; hours/window validation → `no_results` + notices when
    blocked), `checkAndHold()` (**`pg_advisory_xact_lock` on `(org, category, pickup-location)`**
    inside a tx → recount → insert `hold` or throw `no_availability`), `releaseHold`, `listHolds`,
    `expireStaleHolds` (worker hook).
- **`modules/pricing`**
  - `quote.calculator.ts` — pure: `computeQuote` (full days × per-day tier rate + capped hourly
    trailing day + flat fees + one half-up tax line; invariant: Σ lines == total). 12 unit tests.
  - `pricing.service.ts` — `applicablePlan` (published, in date range, most-specific-then-latest),
    `priceWindow`, `persistQuote` (new reference or superseding `version`; snapshots
    `ratePlanId` + `ratePlanVersion`), `getQuote`, rate-plan CRUD (`upsertPlan` — published is
    immutable; `validatePlan` — positive base, tax bps in range, min ≤ max, from ≤ to, positive
    tiers), `publishPlan` (bumps `publishedVersion`, retires the previous published plan for the
    same scope, emits `pricing.rate_plan.published.v1`).
- **`modules/catalogue`** — `catalogue.service.ts` — category + feature read (`listCategories`
  with feature join, locale-ready), `upsertCategory` (optimistic `version`, feature map replace),
  `setCategoryActive`; `afterMutation` = audit + outbox `catalogue.changed.v1` + `CacheBus`.
- **`modules/fleet`** — `fleet.service.ts` (STAGE-002 slice) — `listUnits` (join category +
  location, bidi-safe VIN/plate), `candidateUnits` (bookable-state units at the pickup location,
  with overlapping `vehicle_block` intervals), `addBlock` / `releaseBlock`. Full fleet ops in 005.
- **`modules/discovery`** — `DiscoveryController` (`GET /catalogue/categories[/:code]`,
  `POST /discovery/search`, `POST /discovery/quote`, `GET /discovery/quotes/:reference` — all
  `@OptionalAuth()`), `OpsCatalogueController` (`/ops/catalogue/*`, `/ops/fleet/units|blocks`,
  `/ops/pricing/rate-plans[/:id/publish]`, `/ops/availability/holds[/:id/release]` — permissioned),
  `DiscoveryModule`. Registered in `app.module`; `discovery` added to the module-boundary list.
- **schema** — `catalogue.ts` (`vehicle_category`, `vehicle_feature`, `vehicle_category_feature`),
  `fleet.ts` (`vehicle_unit`, `vehicle_block`), `pricing.ts` (`rate_plan`, `rate_tier`, `quote`,
  `quote_line`), `booking.ts` (`hold`). Migration `0002` (11 tables).
- **seed** — `seed/discovery.ts` (shared by dev + test): 5 categories, 8 features, a small fleet
  per location, one published rate plan (+ weekly/monthly tiers) per category. `test.ts` adds a
  24/7 location `TST1` and a limited-hours `TST2` (06:00–20:00, closed Sun, no after-hours).
- **permissions** — added `catalogue.manage` (elevated); granted to `fleet_staff`; manager/admin
  keep `ALL`.
- **contracts** — `catalogue.ts` (`zVehicleCategory`, `zUpsertVehicleCategory`, `zVehicleUnit`),
  `discovery.ts` (`zAvailabilitySearchRequest/Response`, `zAvailabilityOption`, `zQuote`,
  `zQuoteLine`, `zCreateQuoteRequest`).

### Web (`apps/web/src`)

- `lib/discovery-hooks.ts` — `useLocations`, `useCategory`, `useAvailabilitySearch`
  (`staleTime:0`), `useCreateQuote`, `useQuoteByRef`, `formatMinor`.
- `lib/ops-discovery-hooks.ts` — `useOpsUnits`, `useRatePlans`, `useCreateRatePlan`,
  `usePublishRatePlan`, `useOpsCategories`.
- `components/search-form.tsx` — location select + two `datetime-local` inputs → navigates to
  `/search?…` (shared by the home hero and the results page, `compact` variant).
- **SCREEN-CUS-001** home hero now carries the real search form (info panel kept below).
- **SCREEN-CUS-002** `search-results-page.tsx` — priced option cards, bookable-count badges,
  `no-results` for a blocked window, editable search control.
- **SCREEN-CUS-003** `vehicle-detail-page.tsx` — class specs + features + trip price;
  **Reserve** → `POST /discovery/quote` (with hold) → `/checkout`.
- `checkout-page.tsx` — the held quote with an itemised table and a live hold countdown
  (payment/drivers/terms are STAGE-003).
- **SCREEN-OPS-013** `fleet-inventory-page.tsx` — unit table with location/category filters.
- **SCREEN-OPS-025/026** `rate-plans-page.tsx` — list + create draft + publish; publish takes
  effect on customer search with no redeploy.
- routes `/search`, `/vehicle/:categoryCode`, `/checkout`, `/ops/fleet`,
  `/ops/config/rate-plans`; ops nav gains "Rate plans".

## Commands run / verified

- `pnpm db:generate` → migration `0002_nebulous_doctor_spectrum`; `pnpm db:reset` (dev) applies
  it + the new seed (5 categories / 54 units / 5 rate plans / 10 tiers).
- `pnpm verify:static` PASS · `verify:unit` 63 · `verify:api` 31 · `verify:migrate` 4 ·
  `verify:e2e` 54 (phone/tablet/laptop), 63 screenshots, 0 console/network errors.
- Manual curl smoke incl. a 6-way concurrent hold race on the last 2 premium units → exactly 2
  succeed, 4 `no_availability`, DB shows 2 active holds.

## Defects

D-002-1 … D-002-5 — all fixed within the stage (see `defects.md`). No open defects.

## Next exact action

Begin **STAGE-003 — Booking & payment**: checkout (SCREEN-CUS-004–007), drivers/payer roles,
extras/protection, terms/consent snapshot, atomic confirmation + duplicate prevention,
confirmation + notification, guest access, staff-assisted booking (SCREEN-OPS-006).
See `implementation-roadmap.md` STAGE-003; plan to be written in `stages/STAGE-003-booking/`.

## Resume notes

- Availability/hold correctness is engine-first: `availability.engine.ts`, `operating-hours.ts`
  and `quote.calculator.ts` are pure and exhaustively unit-tested; the services only gather inputs.
- Holds have a single owning path — `availability.checkAndHold()` — never insert `hold` directly.
- Quote/price money is integer minor units end to end; the total is `Σ lines`, never re-rounded.
- The E2E browser TZ is pinned to `America/New_York`; the shared dev DB carries state across the
  phone/tablet/laptop projects, so cross-run assertions use run-unique values (see the OPS-025
  spec) and specs reset nothing — `pnpm --filter @carrental/api db:reset` re-baselines.
