# STAGE-003 — checkpoint

- **Status:** COMPLETED (2026-09-07).
- **Current subtask:** none — stage gate passed.
- **Objective met:** a customer or guest turns a held quote into a confirmed reservation —
  driver/payer details, a terms & consent snapshot, one atomic confirmation that takes exactly
  one intended charge, a confirmation screen + notification, and the reservation visible under
  "Your trips". Duplicate submissions and provider timeouts never create a second reservation or
  a hidden charge; a write failure after a capture opens an owned recovery case.

## Completed work

### API (`apps/api/src`)

- **`modules/payment`**
  - `payment.port.ts` — `PaymentPort` abstract + `SimulatorPaymentAdapter` (deterministic:
    `tok_timeout` throws `PaymentTimeoutError`, `tok_decline` throws `PaymentDeclinedError`,
    others succeed with a stable `providerRef` per idempotency key + brand/last4). Card data
    never enters the system.
  - `payment.service.ts` — `authorizeAndCapture` (idempotent on `(reservationRef, purpose)` via
    the `payment_intent` unique index; timeout → intent `requires_action` + `provider_timeout`
    504, no reservation; decline → intent `failed` + `business_rule_violation`; capture-failure
    → auto-void the auth + `business_rule_violation`), `refund` (partial, over-refund guarded),
    `openCase` (writes `recovery_case` + `case.opened.v1` outbox), `intentFor` / `ledgerFor`.
- **`modules/booking`**
  - `booking.service.confirm()` — validates terms + a primary driver; **deterministic
    `RES-<sha256(quoteRef)[:8]>` reference**; idempotent (existing reservation → return it);
    re-validates the quote (`quote_expired`) and hold (`availability_lost`); prices extras at
    the quote's effective tax rate; `payments.authorizeAndCapture`; then **one transaction**:
    insert `reservation` + `reservation_line` (verbatim quote snapshot + extras + tax) +
    `reservation_driver` + `consent_snapshot`, mark the `hold` `consumed`, emit
    `reservation.confirmed.v1`; catch `23505` (concurrent winner) → return theirs;
    `simulateWriteFailure` → `openCase('write_after_charge')` + `500` with `caseOpened`.
    Confirmation `notify.send('reservation_confirmed')` is wrapped in try/catch (non-fatal).
  - `getReservation` (owner / staff / guest-token), `listForActor`, `claimGuest` (token →
    attach to account), `verifyGuestToken`.
  - `BookingController` — `POST /bookings/confirm` (`@OptionalAuth()`), `GET /bookings/mine`,
    `GET /bookings/:reference` (`?token=` for guests), `POST /bookings/:reference/claim`.
- **schema** — `reservation.ts` (`reservation`, `reservation_line`, `reservation_driver`,
  `consent_snapshot`), `payment.ts` (`payment_intent`, `payment`, `recovery_case`). Migration
  `0003` (7 tables).
- **seed** — `system.ts` adds a published `reservation_confirmed` template (en/fr/ar).
- **contracts** — `booking.ts` (`zConfirmBookingRequest`, `zReservation`, `zConfirmBookingResponse`,
  `zDriverInput`, `zClaimGuestRequest`).
- `BookingModule` imports `DiscoveryModule` (for `PricingService`), `PaymentModule`, `NotifyModule`;
  registered in `app.module`.

### Web (`apps/web/src`)

- `lib/discovery-hooks.ts` — `useConfirmBooking` (sends the bearer when signed in),
  `useReservation` (bearer or `?token=`), `useMyReservations`.
- **SCREEN-CUS-004/005/006/007** `checkout-page.tsx` — the held-quote line table + live hold
  countdown, primary-driver fields, a test-card selector (`tok_visa_ok` / `tok_mastercard_ok`
  / `tok_decline`), a terms checkbox (Pay disabled until accepted / while expired), and a
  `Confirmation` view (reference, charged card, itemised lines, accepted-terms line, guest
  add-to-account note).
- **SCREEN-CUS-014 (list)** `trips-page.tsx` — the signed-in customer's reservations (detail /
  modify / cancel land in STAGE-004); `/trips` route now real.

### E2E (`e2e/tests/booking.spec.ts`)

FLOW-CUS-001 booking half end to end + a declined-card retry — 2 tests × 3 viewports.
`_helpers.ts` shares one `isExpectedNegative(url, status)` predicate for the response and
console guards.

## Commands run / verified

- `pnpm db:generate` → `0003_daily_demogoblin`; `pnpm db:reset` (dev) applies it.
- `pnpm verify:static` PASS · `verify:unit` 63 · `verify:api` 38 (7 booking) · `verify:migrate` 4 ·
  `verify:e2e` 60 (phone/tablet/laptop), 72 screenshots, 0 console/network errors.

## Defects

D-003-1 … D-003-5 — all fixed within the stage (see `defects.md`). No open defects.

## Next exact action

Begin **STAGE-004 — Reservation operations**: SCREEN-CUS-014–019, SCREEN-OPS-004/005/021/022/023/024;
modify / cancel / refund / no-show / pending-expiry / override / history; customer + payment
workspaces; reconciliation. See `implementation-roadmap.md` STAGE-004; plan in
`stages/STAGE-004-reservation-ops/plan.md`.

## Resume notes

- The confirm flow is authorize-then-persist with the reservation reference as the idempotency
  key; the "persist failed after capture" branch opens a `recovery_case` — never a bare 500.
- Reservation lines are a verbatim quote snapshot; never re-price at read.
- The payment simulator's magic tokens: `tok_visa_ok`/`tok_mastercard_ok`/`tok_ok` approve,
  `tok_decline` declines, `tok_timeout` times out. A real adapter would bind `PaymentPort` in
  `PaymentModule`.
- `booking.service` depends on `PricingService` (STAGE-002) via `DiscoveryModule` — do not add a
  reverse dependency.
