# STAGE-005 — Pickup, active rental, return & closeout · plan

## Objective / outcome

The physical rental lifecycle: a confirmed reservation becomes a `rental` at pickup (a specific
vehicle unit is assigned, driver + licence verified, an agreement snapshot captured), the rental
is active (extension, incident/roadside, replacement), then returned (inspection, damage/fuel
adjustments, final settlement, the unit moves to its next state). Plus after-hours handling and
the fleet operations that feed availability — transfers, maintenance, admin blocks,
import/export, vehicle documents.

## Source IDs

FR-RNT-001..016, FR-FLT-001/003..009, FR-PAY-003/007, FR-INT-005;
SCREEN-CUS-020 (pickup) / 021 (active rental) / 022 (extension) / 023 (return);
SCREEN-OPS-007–020 (readiness, assignment, pickup, agreement, active, extension, incident,
replacement, return, inspection, settlement, transfers, maintenance, blocks, fleet import);
FLOW-CUS-006..009, FLOW-OPS-002/003/005/006/007/008/009/010/019; SRS-RNT-_, SRS-FLT-_.

## Backend (`apps/api/src/modules`)

1. **`rental`** (may extend `booking`) —
   - `rental` aggregate (from a reservation: assigned `unitId`, state machine
     `awaiting_pickup|active|overdue|returned|closed`, odometer/fuel out, agreement snapshot),
     `rental_event` (append-only), `agreement` (terms + signature stub + captured at pickup).
   - `assignUnit()` (auto: a free unit of the class at the location, or manual), `pickup()`
     (verify driver name + licence present; capture odometer/fuel; snapshot the agreement;
     reservation → `fulfilled`, rental → `active`; unit → `on_rent`), `extend()` (re-price the
     added days via `PricingService`, take the delta via `PaymentService`, push `returnAt`),
     `return()` (capture odometer/fuel in; compute mileage/fuel/damage adjustments from
     configurable rates; final `payment` settle or refund; rental → `closed`; unit → `prep`
     then `available` after a readiness check), `markOverdue()` (worker: `active` past
     `returnAt` → `overdue`, affects availability immediately).
   - incident: `raiseIncident()` (roadside/damage) + `replacement()` (assign a substitute unit,
     link the rentals).
2. **`fleet`** (extend STAGE-002 slice) —
   - `transferUnit()` (move a unit's `currentLocationId`, with an in-transit window that blocks
     availability), `scheduleMaintenance()` / `releaseMaintenance()` (already have
     `vehicle_block` — add the workflow + reason), `blockUnit()` / `unblockUnit()`,
     `importUnits()` (CSV-shaped payload → validated rows), vehicle documents (metadata rows).
3. **readiness** — a `return()` runs a checklist; a unit only becomes `available` once it passes
   (FR-RNT-013). A returned unit is not bookable until then.

## Web

- **SCREEN-CUS-020** pickup summary (what to bring), **021** active rental (dates, extend CTA,
  report-an-issue), **022** extension (re-quote + delta), **023** return summary + any
  adjustments + final receipt.
- **SCREEN-OPS-007–012** readiness board, assignment, pickup wizard, agreement view, active
  rental detail, extension approval; **013–016** incident, replacement, return + inspection
  (checklist + photos stub), settlement; **017–020** transfers, maintenance, blocks, fleet
  import.
- Shared: `Checklist`, `StepProgress`, `Timeline`, `DataTable`.

## Acceptance / tests

- **One unit, one open rental:** a unit assigned to an active rental cannot be assigned to
  another overlapping rental (DB guard + test).
- **Return gating:** a returned unit is not bookable until readiness passes; an overdue rental
  immediately reduces availability for its class.
- **Extension:** re-prices the added time, takes exactly the delta, pushes `returnAt`; a failed
  payment leaves the rental unchanged.
- **Adjustments:** a damage charge requires a linked inspection finding (FR-RNT-011); fuel/
  mileage adjustments use configurable rates, integer minor units, and appear on the final
  receipt which balances.
- **E2E (3 viewports):** an ops agent assigns a unit + runs pickup for a STAGE-003 reservation →
  active rental; the customer extends it; the agent runs return with a fuel adjustment → closed
  - a balanced receipt. Responsive + 1 RTL screenshot of the pickup wizard.
- `verify:static | unit | api | migrate | e2e` all green; screenshots in
  `stages/STAGE-005-rental-lifecycle/screenshots/`.

## Migrations / data

- New tables: `rental`, `rental_event`, `agreement`, `inspection`, `inspection_finding`,
  `incident`, `vehicle_transfer`, `vehicle_document`. Seed (dev): a couple of units already
  `prep`/`maintenance` so the readiness board is non-empty; mileage/fuel adjustment rates as
  configurable lookups.

## Risks / notes

- Unit assignment + the "one open rental per unit" invariant is the core correctness surface —
  enforce with a conditional insert / advisory lock like the STAGE-002 hold.
- Availability must now also subtract active + overdue rentals and in-transit transfers — extend
  `availability.countHolds` (already counts holds + confirmed reservations).
- Keep money integer minor units; the final receipt = Σ lines (charges − refunds), never
  re-rounded.
