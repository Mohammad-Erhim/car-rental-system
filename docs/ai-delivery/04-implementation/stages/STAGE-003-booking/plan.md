# STAGE-003 — Booking & payment · plan

## Objective / outcome

A customer (or a staff agent) turns a held quote into a confirmed reservation: driver + payer
details, optional extras/protection, a terms & consent snapshot, one atomic confirmation that
takes exactly one intended charge, a confirmation screen + notification, and a reservation the
customer can see. Duplicate submissions and provider timeouts never create a second reservation
or a hidden charge.

## Source IDs

FR-BKG-001..010, FR-PAY-001..005, FR-IAM-007 (driver reuse), FR-INT-001/002/004;
SCREEN-CUS-004 (checkout), -005 (drivers), -006 (extras/protection), -007 (confirmation), -018 (guest access);
SCREEN-OPS-005 (reservation detail), -006 (assisted booking);
FLOW-CUS-001 (booking half), -002, -003; FLOW-OPS-001;
TEST-ERR-002/004/005; SRS-BKG-_, SRS-PAY-_, SRS-SEC-\* (payment data handling).

## Backend (`apps/api/src/modules`)

1. **`payment`** — `PaymentPort` (simulator: authorize / capture / void / refund with injectable
   outcomes incl. timeout + decline); `payment_intent` (idempotent by `(reservationRef, purpose)`),
   `payment` ledger rows; reconcile hook (full reconciliation lands in STAGE-004).
2. **`booking`** — consumes a STAGE-002 `hold` + `quote`:
   - `reservation` aggregate (ref, state machine `pending|confirmed|cancelled|expired`, snapshot
     of the priced quote lines so a later rate change never alters it), `reservation_driver`
     (primary/additional/payer, reused from saved drivers or entered), `reservation_line`
     (extras/protection priced at confirm), `consent_snapshot` (terms version + accepted-at +
     actor, append-only).
   - `confirm()` — one transaction: re-validate the hold is still live → price extras →
     `payment.authorize` (idempotency key = reservation ref) → on success write reservation +
     mark hold `consumed` + emit `reservation.confirmed.v1` → `notify.send('booking_confirmation')`.
     Any failure after a successful authorize creates a **recovery case** (owned, visible) rather
     than a silent inconsistent state.
   - Duplicate `confirm()` for the same hold/ref returns the existing reservation (idempotent).
   - Guest checkout: a `holder_key`-scoped reservation with a magic-link view token (SCREEN-CUS-018).
3. **`booking.public`** — `reservationSummary`, `reservationForActor` for other modules.

## Web

- **SCREEN-CUS-004 Checkout** — replaces the STAGE-002 placeholder: step rail (drivers → extras →
  review → pay), the held-quote summary with the live hold timer, re-quote on expiry.
- **SCREEN-CUS-005 Drivers** — primary + additional + payer; pick a saved driver (FR-IAM-007) or
  enter one; licence fields; eligibility note.
- **SCREEN-CUS-006 Extras & protection** — lookup-backed add-ons priced into the quote preview.
- **SCREEN-CUS-007 Confirmation** — reference, what happens next, add-to-account CTA for guests.
- **SCREEN-OPS-005/006** — reservation detail (read) + assisted booking (agent runs the same
  flow on a customer's behalf, `reservation.create`).
- Shared: `StepProgress` (COMP-SH-012), `UnsavedGuard` (COMP-SH-014).

## Acceptance / tests

- **Atomicity / duplicates (integration):** double `confirm()` ⇒ one reservation + one intended
  charge; a `PaymentPort` timeout ⇒ no reservation, no hidden charge, hold still releasable;
  a reservation-write failure after a successful authorize ⇒ a visible recovery case + the auth
  is voided or flagged; a failed confirmation email ⇒ reservation still confirmed.
- **Snapshot immutability:** confirm a reservation, publish a new rate plan, re-read the
  reservation ⇒ its line totals are unchanged (carries the STAGE-002 quote snapshot forward).
- **Hold coupling:** confirming consumes the hold; an expired hold blocks confirm with a
  re-quote prompt; two agents cannot confirm the same hold.
- **Consent:** the accepted terms version + timestamp + actor is recorded append-only and shown
  on the confirmation and reservation detail.
- **E2E (3 viewports):** FLOW-CUS-001 end to end (search → … → pay with the simulator →
  confirmation with a reference); a double-click on "Confirm" yields one reservation; guest
  checkout then "add to my account". Responsive + 1 RTL screenshot of checkout.
- `verify:static | unit | api | migrate | e2e` all green; screenshots in
  `stages/STAGE-003-booking/screenshots/`.

## Migrations / data

- New tables: `reservation`, `reservation_driver`, `reservation_line`, `consent_snapshot`,
  `payment_intent`, `payment`. Seed (dev): a couple of extras/protection lookup values; the
  simulator needs no seed.

## Risks / notes

- The confirm transaction is the highest-risk correctness surface — model it as
  authorize-then-persist with an idempotency key equal to the reservation reference, and make
  the "persist failed after authorize" branch produce an owned case, never a 500 that loses the
  charge.
- Keep payment _card_ data out of the system entirely — the simulator returns opaque tokens;
  only store the last4 + brand + token (SRS-SEC).
- Reuse the STAGE-002 quote snapshot verbatim as `reservation_line` rows; never re-price at read.
