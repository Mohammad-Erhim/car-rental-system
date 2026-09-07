# STAGE-004 — Reservation operations · plan

## Objective / outcome

A customer manages a confirmed reservation (view detail, change dates/vehicle/drivers within
policy, cancel with the right refund, add to account) and staff run the operational side
(reservation queue + detail, modification with override + reason, cancellation/no-show, refund
approval, pending/expiry handling, a full change-history timeline) — plus the customer payment
workspace and provider reconciliation.

## Source IDs

FR-RSV-001..007, FR-PAY-006..009, FR-ADM-001..004, FR-RNT-007 (no-show link);
SCREEN-CUS-014 (detail) / 015 (modify) / 016 (cancel) / 017 (payments & receipts) / 018 (guest) / 019 (history);
SCREEN-OPS-004 (reservation queue) / 005 (reservation detail) / 021 (modify) / 022 (cancel/no-show) / 023 (refunds) / 024 (reconciliation);
FLOW-CUS-004/005, FLOW-OPS-004/011/012, TEST-ERR-003/013; SRS-RSV-_, SRS-PAY-_.

## Backend

1. **`reservation` module** (extend `booking` or a new sibling reusing `booking.public`):
   - `reservation_event` (append-only history: created / modified / cancelled / no_show /
     refund_requested / refund_settled / override_applied — actor, before/after masked, reason).
   - `getDetail` (owner/staff/guest), `list` (staff queue: filters by state/location/date,
     cursor), `history`.
   - `modify()` — one transaction: re-price the new window/vehicle via `PricingService`
     (STAGE-002), diff against the snapshot, take/refund the delta through `PaymentService`,
     write a new snapshot + a `reservation_event`. A failed date change must leave the original
     capacity intact (TEST-ERR-003) — re-check availability + hold the new window before
     releasing the old.
   - `cancel()` — policy-driven refund amount (cancellation fee lookup), idempotent (already
     cancelled → same result), `payment.refund` for the refundable part, state → `cancelled`,
     `reservation.cancelled.v1` + notification.
   - `markNoShow()` (staff) — links to the rental lifecycle later; sets state + fee.
   - override: a staff action that records `override_reason` (lookup) + approver on a blocked
     modify/cancel.
2. **`payment`** — `refund` already exists; add `reconcile()` — compare `payment` ledger vs. a
   simulated provider statement, surface mismatches as `reconciliation_exception` rows (or reuse
   `recovery_case`), each owned until resolved. Two staff cannot refund the same remaining
   amount (guarded by the `refundedMinor` check + a row lock).
3. **`case`** — read/list/resolve for `recovery_case` + reconciliation exceptions (write side
   done in STAGE-003).

## Web

- **SCREEN-CUS-014** reservation detail — itinerary, drivers, price breakdown, actions (modify /
  cancel) gated by policy + state.
- **SCREEN-CUS-015** modify — date/time + vehicle-class change with a live re-quote and the
  delta (extra charge or refund) shown before confirm.
- **SCREEN-CUS-016** cancel — shows the refund amount + fee, confirm dialog, result.
- **SCREEN-CUS-017** payments & receipts — the `payment` ledger for the account's reservations.
- **SCREEN-CUS-019** history — the `reservation_event` timeline.
- **SCREEN-OPS-004/005** reservation queue + detail (staff), **021/022** modify + cancel/no-show
  with override + reason, **023** refunds (approve/execute), **024** reconciliation exceptions.
- Shared: `FilterSortBar` (COMP-SH-010), `DataTable` (COMP-SH-011), `Timeline`, `ConfirmDialog`
  (exists), `UnsavedGuard` (COMP-SH-014).

## Acceptance / tests

- **Modify safety:** a failed date change keeps the original capacity (no lost unit); a
  successful change re-prices and takes/refunds exactly the delta; the snapshot + history
  reflect the new state.
- **Cancel:** already-cancelled returns the same result (idempotent); the refund equals
  `paid − cancellation fee`; two staff cannot both refund the remaining amount.
- **Reconciliation:** every provider txn either reconciles or is an owned exception; resolving
  an exception is audited.
- **History:** every consequential action writes one append-only `reservation_event` with actor
  - reason.
- **E2E (3 viewports):** FLOW-CUS-004 (customer modifies dates → sees the delta → confirms) and
  FLOW-CUS-005 (customer cancels → sees the refund). Ops: an agent cancels with an override
  reason → history shows it. Responsive + 1 RTL screenshot of reservation detail.
- `verify:static | unit | api | migrate | e2e` all green; screenshots in
  `stages/STAGE-004-reservation-ops/screenshots/`.

## Migrations / data

- New tables: `reservation_event`, `reconciliation_exception` (or extend `recovery_case`),
  `refund` (if not folding into `payment`). Seed: cancellation-fee + override-reason lookup
  values already exist as configurable lookups from STAGE-001 — verify and use.

## Risks / notes

- The modify transaction is the highest-risk surface — always secure the new window (a fresh
  hold) before releasing the old, and re-price atomically; never leave the reservation without a
  valid snapshot.
- Refund math in integer minor units; the cancellation fee comes from a configurable lookup, not
  a hard-coded constant.
- Reuse `booking.public` for cross-module reads; `reservation` must not import `booking` internals.
