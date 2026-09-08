# STAGE-005 — test evidence

Stage: **Pickup, active rental, return & closeout.**
Date: 2026-09-07. Branch `implementation`.

## Verification gates (all green)

| Gate              | Command               | Result                                                                                                                         |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Static            | `pnpm verify:static`  | PASS                                                                                                                           |
| Unit              | `pnpm verify:unit`    | PASS — 63                                                                                                                      |
| API integration   | `pnpm verify:api`     | PASS — **47** (`rental` 3, `reservation-ops` 6, `booking` 7, `discovery` 7, `iam` 9, `config-lookup` 5, `migrate` 4, `meta` 6) |
| Migration         | `pnpm verify:migrate` | PASS — 4; migration `0005` (`rental`, `rental_event`, `inspection`, `inspection_finding`) empty→current                        |
| E2E (3 viewports) | `pnpm verify:e2e`     | PASS — **72** (24 × phone/tablet/laptop), 0 console errors, 0 unexpected failed requests                                       |

## API integration tests (`apps/api/test/rental.spec.ts`, 3)

- **TEST-RNT-001** full lifecycle — `assign` (auto-picks a free `available` unit of the class at
  the pickup location with no open rental) → `awaiting_pickup`; `pickup` **rejects** a missing
  licence number (`422`), succeeds with one → `active`, `agreementVersion: 1.0`, unit →
  `on_rent`, reservation → `fulfilled`; customer `extend` (return +3 days) → `deltaMinor > 0`
  charged, `scheduledReturnAt` pushed, `settlementMinor == delta`; agent `return` with a 20%
  fuel deficit + a damage finding → `closed`, `fuelMinor == 20 × 150 = 3000`, `damageMinor ==
5000`, `adjustmentMinor == 8000`, `settlementMinor == delta + 8000`, unit → `prep`; a
  `discovery/search` for the class shows **one fewer** bookable until `readiness(passed)` runs,
  after which the count is restored.
- **TEST-RNT-002** one open rental per unit — assign + pickup unit X on rental A (→ `active`);
  assign the **same** unit X to rental B; `pickup` B → the `UPDATE … state = 'active'` hits the
  partial unique index `rental_open_unit_unq (unit_id) WHERE state in ('active','overdue')` →
  the request fails (`409`/`500`), so a unit can never be on two open rentals.
- **permission** a customer calling `POST /ops/rentals/:ref/pickup` → `403`.

## E2E (`e2e/tests/rental.spec.ts`, 3 = 1 × 3 viewports)

`FLOW-OPS`: customer books → agent opens **Reservations**, "Assign vehicle" → **Rentals**, "Run
pickup" (odo/fuel/driver/licence) → rental `active` → customer opens the reservation, sees "Your
rental is active", "Extend rental" (+3 days) → charged message → agent "Run return" (fuel 75%) →
`settlement` message + `closed` → "Mark ready for hire".

## Screenshots — `stages/STAGE-005-rental-lifecycle/screenshots/` (90 = 30 scenarios × 3)

New: `ops-rental-active`, `cweb-rental-extended`, `ops-rental-returned`.

### Analysis

- The rental board shows each rental with a state badge and the right inline action (pickup /
  return / mark-ready); the customer reservation detail grows a "Your rental is active" card with
  an extend control while a rental is `active`/`overdue`. All render at 390 / 820 / 1440.
- **Capacity is correct through the whole lifecycle**: a `confirmed` reservation, an
  `awaiting_pickup`/`active`/`overdue` rental (unit not `available`), and a just-returned `prep`
  unit are all excluded from a new booking; readiness moves the unit back to `available`.
- Fuel and damage adjustments are integer minor units (`FUEL_MINOR_PER_PCT`, finding
  `chargeMinor`); the running `settlementMinor` is the sum of the extension delta + return
  adjustments.
