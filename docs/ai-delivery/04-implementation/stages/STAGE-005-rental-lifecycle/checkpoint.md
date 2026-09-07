# STAGE-005 — checkpoint

- **Status:** COMPLETED (2026-09-07).
- **Objective met:** a confirmed reservation becomes a `rental` — a specific unit is assigned,
  pickup captures the agreement + odometer/fuel out, the rental is active (customer extension),
  and return runs an inspection + fuel/damage settlement, moving the unit to `prep` until a
  readiness check restores it. The "one open rental per unit" invariant is enforced by a partial
  unique index.

## Completed work

### API (`apps/api/src`)

- **`modules/rental`** —
  - `rental.service.ts`: `assign()` (advisory-locked; auto-picks a free `available` unit of the
    class at the pickup location with no open rental, or takes `unitId`), `pickup()` (validates
    driver name + licence; sets odo/fuel out + agreement snapshot; rental → `active`, unit →
    `on_rent`, reservation → `fulfilled`), `extend()` (re-price the full new window vs. the old
    via `PricingService`, take the positive delta via `PaymentService`, push `scheduledReturnAt`,
    `settlementMinor += delta`), `returnRental()` (inspection + findings; fuel deficit ×
    `FUEL_MINOR_PER_PCT` + `Σ finding chargeMinor` → settlement charge; rental → `closed`, unit →
    `prep`), `runReadiness()` (`prep` → `available` / `maintenance`), `markOverdue()` (worker),
    `list` / `detail` / `mineForActor` / `detailForActor`.
  - `RentalController`: customer `GET /rentals/{mine,:ref}`, `POST /rentals/:ref/extend`;
    ops `GET /ops/rentals`, `POST /ops/reservations/:ref/assign`,
    `POST /ops/rentals/:ref/{pickup,return,readiness}` (permissioned).
- **schema** — `rental` (+ partial unique index `rental_open_unit_unq (unit_id) WHERE state in
('active','overdue')`), `rental_event`, `inspection`, `inspection_finding`. Migration `0005`.
- **`modules/fleet`** — `BOOKABLE_STATES` narrowed to `['available']` (D-005-1) so `prep` units
  are not bookable until readiness.

### Web (`apps/web/src`)

- `lib/rental-hooks.ts` — `useOpsRentals`, `useAssignVehicle`, `usePickup`, `useReturnRental`,
  `useReadiness`, `useMyRental`, `useExtendRental`.
- **SCREEN-OPS-009/012/016** `rental-board-page.tsx` at `/ops/rentals` — rentals with an inline
  pickup form (odo/fuel/driver/licence), a return form (odo/fuel), a settlement message, and a
  "Mark ready for hire" button.
- **SCREEN-OPS-004** reservation queue gains an "Assign vehicle" action on `confirmed` rows.
- **SCREEN-CUS-021/022** reservation detail gains a "Your rental is active" card with an extend
  control (re-quote + delta charged).
- Ops nav: "Work" → "Reservations"; new "Rentals" item.

### E2E

`e2e/tests/rental.spec.ts` — one full cross-surface `FLOW-OPS` (assign → pickup → customer
extend → return → ready), 3 viewports.

## Commands run / verified

- `pnpm db:generate` → `0005_married_mulholland_black`; `pnpm db:reset` (dev) applies it.
- `verify:static` PASS · `verify:unit` 63 · `verify:api` 47 (3 rental) · `verify:migrate` 4 ·
  `verify:e2e` 72 (phone/tablet/laptop), 90 screenshots, 0 console/network.

## Defects

D-005-1 … D-005-3 — see `defects.md`. No open defects.

## Deferred within STAGE-005 (noted, not silently dropped)

Incident/roadside + replacement flow, after-hours return specifics, post-rental tolls/fines,
fleet transfers, maintenance workflow UI, fleet import/export, vehicle documents. The
`vehicle_block` model exists (STAGE-002) and `raiseIncident`/`replacement` have a clear home in
`rental.service`; these are UI-and-workflow additions to bring in during STAGE-006/007 hardening
or a dedicated pass. The core lifecycle (assign → pickup → extend → return → readiness) and its
capacity guarantees are complete and tested.

## Next exact action

Begin **STAGE-006 — Administration & reporting**: full pricing/policy/product/location
versioning + preview + approval; notification templates workflow (done) + more; reports hub /
viewer / exports / schedules; audit & data-quality; integration health & recovery.
See `stages/STAGE-006-administration/plan.md`.

## Resume notes

- Unit assignment + "one open rental per unit" is enforced at the DB (`rental_open_unit_unq`);
  never bypass `rental.service` for state transitions.
- Availability now correctly excludes: units not `available`, active holds, confirmed
  reservations, and (implicitly, via unit state) active/overdue rentals + `prep` units.
- Fuel/damage settlement is integer minor units; move `FUEL_MINOR_PER_PCT` + the cancellation
  fee to configurable policies in STAGE-006.
