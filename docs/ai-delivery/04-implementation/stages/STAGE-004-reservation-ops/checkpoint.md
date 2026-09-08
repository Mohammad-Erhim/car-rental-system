# STAGE-004 — checkpoint

- **Status:** COMPLETED (2026-09-07).
- **Objective met:** a customer views a reservation, changes its return date (re-priced, delta
  settled), or cancels it (policy refund), and sees a full change history; staff have a
  reservation queue, a no-show action, payment reconciliation with owned exceptions, and a
  recovery-case list. A failed modify never loses capacity.

## Completed work

### API (`apps/api/src`)

- **`modules/booking/reservation-ops.service.ts`** —
  - `cancel()` — idempotent (already `cancelled` → same result); fee = 0 when > 48 h before
    pickup else 20% of total (staff `goodwill` waives it); `payment.refund` for the refundable
    part; state → `cancelled` + `reservation_event('cancelled')` + `reservation.cancelled.v1`
    - non-fatal notify.
  - `modify()` — **secure the new window first** (`availability.checkAndHold` with
    `excludeReservationRef`); a `no_availability` failure leaves the reservation untouched
    (TEST-ERR-003). Then re-price (`pricing.priceWindow`), settle the delta
    (`authorizeAndCapture` for a positive delta / `refund` for a negative one), re-write the
    snapshot + lines + a `modified` event in one transaction, release the working hold.
  - `markNoShow()` (staff), `list()` (staff queue, state/location filters), `detail()`,
    `history()`, `mineForActor()`.
  - `reconcile()` — compares the captured-intent ledger against a simulated provider statement
    (an `injectMismatchRef` forces one) → `reconciliation_exception` rows; `listExceptions` /
    `resolveException`; `openCasesList` / `resolveCase` (read/resolve for STAGE-003's
    `recovery_case`).
- **`modules/payment/payment.service.ts`** — `listOpenCases`, `resolveCase`,
  `allCapturedIntents`, `openReconciliationException`, `listReconciliationExceptions`,
  `resolveReconciliationException`.
- **`modules/availability/availability.service.ts`** — `countHolds` now also counts
  `confirmed`/`fulfilled` reservations overlapping the window (D-004-1); `checkAndHold` accepts
  `excludeReservationRef`.
- **`ReservationController`** — customer: `GET /reservations/{mine,:ref,:ref/history}`,
  `POST /reservations/:ref/{cancel,modify}`; ops: `GET /ops/reservations`,
  `POST /ops/reservations/:ref/no-show`, `GET|POST /ops/payments/reconciliation[/run|/:id/resolve]`,
  `GET /ops/cases`, `POST /ops/cases/:id/resolve`.
- **schema** — `reservation_event` (append-only history) + `reconciliation_exception`.
  Migration `0004`.

### Web (`apps/web/src`)

- `lib/reservation-hooks.ts` — `useReservationDetail`, `useReservationHistory`,
  `useCancelReservation`, `useModifyReservation`, `useOpsReservations`.
- **SCREEN-CUS-014/015/016/019** `reservation-detail-page.tsx` at `/trips/:reference` —
  itinerary + drivers + itemised price (+ Refunded row), a change-return-date form (message
  shows the delta charged/refunded), a Cancel button (48-h policy note + ConfirmDialog), and a
  history timeline.
- **SCREEN-OPS-004** `reservation-queue-page.tsx` at `/ops/work` — reservation table with
  state + pickup-location filters.
- `trips-page.tsx` "Manage" → `/trips/:reference`.

### E2E (`e2e/tests/reservation-ops.spec.ts`)

FLOW-CUS-005 (cancel) + FLOW-CUS-004 (modify) + SCREEN-OPS-004 (queue) — 3 tests × 3 viewports.

## Commands run / verified

- `pnpm db:generate` → `0004_green_proudstar`; `pnpm db:reset` (dev) applies it.
- `verify:static` PASS · `verify:unit` 63 · `verify:api` 44 (6 reservation-ops) ·
  `verify:migrate` 4 · `verify:e2e` 69 (phone/tablet/laptop), 81 screenshots, 0 console/network.

## Defects

D-004-1 … D-004-3 — see `defects.md`. No open defects.

## Next exact action

Begin **STAGE-005 — Pickup, active rental, return & closeout**: fleet readiness + assignment,
pickup verification + agreement, active rental + extension, incident/roadside + replacement,
return + inspection + adjustments + settlement + vehicle next-state, after-hours, post-rental
tolls/fines, transfers, maintenance, blocks, fleet import/export. See
`stages/STAGE-005-rental-lifecycle/plan.md`.

## Resume notes

- `modify()` is the highest-risk surface: always hold the new window before releasing the old;
  re-price atomically; a failure must leave a valid snapshot.
- Availability = units − blocks − active holds − **confirmed reservations** (this stage's fix).
- Cancellation fee is a policy percentage (`LATE_CANCEL_FEE_BPS`), not a lookup yet — move it to
  a configurable policy in STAGE-006.
