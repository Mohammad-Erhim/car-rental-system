# STAGE-002 — test evidence

Stage: **Discovery & quote** (catalogue, locations, availability, pricing, holds).
Date: 2026-09-07. Branch `implementation`.

## Verification gates (all green)

| Gate              | Command               | Result                                                                                                                                                  |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static            | `pnpm verify:static`  | PASS — build:packages, `-r lint` (module boundaries incl. new `discovery`), `-r typecheck`, `format:check`, `openapi:generate`, `contracts check:drift` |
| Unit              | `pnpm verify:unit`    | PASS — 63 tests (api 42 incl. **36 STAGE-002 engine tests**, i18n 11, contracts 4, ui 4, web 2)                                                         |
| API integration   | `pnpm verify:api`     | PASS — 31 tests (`discovery` 7, `iam` 9, `config-lookup` 5, `migrate` 4, `meta` 6)                                                                      |
| Migration         | `pnpm verify:migrate` | PASS — 4 tests; migration `0002` (11 new tables) proven empty→current                                                                                   |
| E2E (3 viewports) | `pnpm verify:e2e`     | PASS — **54 tests** (18 × phone/tablet/laptop), 0 console errors, 0 unexpected failed requests                                                          |

## Pure-engine unit tests (`apps/api/src/modules`)

### `availability/availability.engine.test.ts` (15)

Half-open interval overlap; turnaround buffer padding on both sides of an occupied interval;
free when a prior rental ends outside the buffer / not free when inside it; not free for a
trailing rental starting inside the buffer; `computeAvailability` counts free units and subtracts
class-level holds, never negative; an inverted window yields zero; an open-ended maintenance
block removes the unit; `pickFreeUnit` picks the first still-free candidate.

### `availability/operating-hours.test.ts` (9)

`localParts` resolves an instant to the location wall clock (incl. rolling the date back across
the UTC boundary for `America/New_York`); `checkWithinHours` allows inside the window, rejects
`before_open` / `after_close`, permits after close only when after-hours return is enabled,
rejects a closed weekday, and honours date-specific closure / reduced-hours exceptions over the
weekly schedule; an open day with no explicit window is open all day.

### `pricing/quote.calculator.test.ts` (12)

`durationHoursBetween` rounds partial hours up; `perDayRate` picks the highest matching tier
(weekly / monthly) else the base; a clean 3-day rental with a fee and 20% tax has lines that
sum to the total and `subtotal + tax == total`; a large partial trailing day is capped at one
day rate, a small one billed at the true hourly amount; below-min / above-max duration and an
inverted window are rejected; no tax line when `taxBps` is 0 and it still balances; tax is
rounded half-up once (not per line).

## API integration tests (`apps/api/test/discovery.spec.ts`, 7)

- **TEST-AVL-001** `POST /discovery/search` returns priced, bookable options sorted by price;
  economy 3 days = `3 × 3200 + 495` taxable + 20% = **12114** minor.
- **TEST-PRC-001** `POST /discovery/quote` — the quote line amounts sum to `totalMinor`,
  `subtotal + tax == total`, a hold is placed (`unitPinned: true`), timestamps are ISO-8601 UTC,
  `expiresAt` is in the future.
- **TEST-AVL-002 (concurrency)** premium @ TST1 has 2 units; one is taken, then two `quote`
  calls race for the last — exactly one returns `201`, the other `422`
  `business_rule_violation` / `reason: no_availability`. (A `pg_advisory_xact_lock` on
  `(org, category, pickup-location)` serialises the check-and-hold.)
- **TEST-CAT-001** a pickup at TST2 outside its `06:00–20:00` hours (no after-hours) →
  `422` `business_rule_violation`, `reason` starts `pickup_`.
- **TEST-PRC-002** an admin creates + publishes a cheaper SUV rate plan → the next customer
  `search` returns the new total (`2 × 6000 + 495` + 20% = **14994**) with no redeploy; the
  previous published plan for that scope is retired.
- **TEST-PRC-003** fetching an issued quote by reference returns the same total and `version: 1` —
  a later publish does not mutate it (`ratePlanId` + `ratePlanVersion` are snapshotted).
- **Permission** an agent (no `catalogue.manage`) `POST /ops/catalogue/categories` → `403`.

## E2E (`e2e/tests/discovery.spec.ts`, 12 = 4 × 3 viewports)

| Test                                                                                                                                            | Source IDs                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| FLOW-CUS-001: home search → priced results → vehicle detail → **Reserve** → checkout shows the held quote (lines sum to total, live hold timer) | SCREEN-CUS-001/002/003, FLOW-CUS-001, FR-CAT-005, FR-PRC-005 |
| a pickup outside operating hours → recoverable `no-results` state (not a blank list)                                                            | FR-CAT-004, SRS-UI-007                                       |
| SCREEN-OPS-025: admin creates + publishes a compact rate plan → the customer price reflects it with no redeploy                                 | SCREEN-OPS-025/026, FR-PRC-001, FLOW-OPS-013                 |
| SCREEN-OPS-013: fleet inventory table renders and filters by location                                                                           | SCREEN-OPS-013, FR-FLT-001                                   |

Browser timezone is pinned to `America/New_York` in `playwright.config.ts` so the seeded airport
hours line up with the search form's local datetime inputs.

## Screenshots — `stages/STAGE-002-discovery/screenshots/` (63 files = 21 scenarios × 3)

New this stage: `cweb-home-search`, `cweb-search-results`, `cweb-vehicle-detail`,
`cweb-checkout`, `ops-rate-plans`, `ops-fleet-inventory` — plus every STAGE-001 scenario
re-captured against the current build (single full-suite run into this stage's folder).

### Analysis

- **Search → results → detail → checkout** renders correctly at 390 / 820 / 1440. Result cards
  are single-column on phone with the search control kept editable above them; the checkout
  page shows the itemised quote (`Rental — 3 days $96.00` + `Vehicle registration fee $4.95` +
  `Tax (20%) $20.19` = `Total $121.14`) and a 1-second hold countdown.
- **Availability is live**: `useAvailabilitySearch` runs with `staleTime: 0` /
  `refetchOnMount: 'always'` so re-entering the results screen after an ops price change shows
  the new price (verified by the OPS-025 E2E across all three viewports).
- **Money** is integer minor units end to end; the quote-line sum invariant is asserted in the
  unit calculator tests, the API test, and the E2E.
- No console errors / unexpected failed requests on any journey (`guards.assertClean()` on all 54).
