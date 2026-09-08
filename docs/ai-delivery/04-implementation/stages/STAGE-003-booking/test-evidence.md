# STAGE-003 — test evidence

Stage: **Booking & payment** (checkout, drivers, terms, atomic confirmation, notification, guest).
Date: 2026-09-07. Branch `implementation`.

## Verification gates (all green)

| Gate              | Command               | Result                                                                                        |
| ----------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Static            | `pnpm verify:static`  | PASS (lint incl. `booking`/`payment` module boundaries, typecheck, format, openapi, drift)    |
| Unit              | `pnpm verify:unit`    | PASS — 63                                                                                     |
| API integration   | `pnpm verify:api`     | PASS — **38** (`booking` 7, `discovery` 7, `iam` 9, `config-lookup` 5, `migrate` 4, `meta` 6) |
| Migration         | `pnpm verify:migrate` | PASS — 4; migration `0003` (7 new tables) proven empty→current                                |
| E2E (3 viewports) | `pnpm verify:e2e`     | PASS — **60** (20 × phone/tablet/laptop), 0 console errors, 0 unexpected failed requests      |

## API integration tests (`apps/api/test/booking.spec.ts`, 7)

- **TEST-BKG-001** confirm a held quote → `confirmed` reservation with `RES-…` reference; the
  reservation lines sum to `totalMinor` and `subtotal + tax == total`; the terms snapshot
  (v1.0 + accepted-at) is recorded; the payment shows `brand: visa`; the STAGE-002 hold is
  consumed (a fresh quote for the same window gets a new reference).
- **TEST-ERR-002** two concurrent `confirm()` calls for the same quote → **one** reservation
  (same reference from both), both `201`, `paidMinor` equals the quote total (charged once).
  A deterministic reservation reference (`RES-<sha256(quoteRef)[:8]>`) keeps the payment
  idempotency key stable; a lost `reservation_reference_unq` race returns the winner's row.
- **provider timeout** `paymentToken: tok_timeout` → `504 provider_timeout`, **no reservation**,
  the payment intent left `requires_action`; a later valid confirm on the same (untouched) hold
  succeeds.
- **declined card** `tok_decline` → `422 business_rule_violation` (`reason: card_declined`), no
  reservation.
- **TEST-ERR-004** `simulateWriteFailure: true` → the capture succeeds, then the write is
  aborted → a `recovery_case` (`kind: write_after_charge`) is opened and the response is
  `500` with `params.caseOpened: true` — the inconsistency is owned, not silent.
- **snapshot immutability** confirm, then an admin publishes a new economy rate plan → re-reading
  the reservation shows the **same** `totalMinor` (lines are a verbatim quote snapshot, not
  re-priced).
- **guest** an anonymous `confirm()` → `channel: guest` + a `guestAccessToken`; the reservation
  is readable only with `?token=…`; `POST /bookings/:ref/claim` attaches it to the signed-in
  account and it then appears in `GET /bookings/mine`.

Notification failure is non-fatal by construction — `notify.send` is wrapped in try/catch after
the reservation is committed (TEST-ERR-005); a confirmation with an unroutable recipient still
returns `confirmed`.

## E2E (`e2e/tests/booking.spec.ts`, 6 = 2 × 3 viewports)

| Test                                                                                                                                                                                                                                                         | Source IDs                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| FLOW-CUS-001 (booking half): sign in → search → results → detail → reserve → checkout → fill driver + accept terms + pay (approving card) → **confirmation** with a `RES-…` reference; confirmation lines sum to total; the trip then appears under `/trips` | SCREEN-CUS-004/005/007, FLOW-CUS-001, FR-BKG-001..007, FR-PAY-001..003 |
| a declined test card shows an inline error and **no** confirmation; switching to an approving card on the same held quote then confirms                                                                                                                      | TEST-ERR (decline), SRS-UI-014                                         |

The console guard now also allow-lists the browser's automatic "Failed to load resource … status
of NNN" message for the URL+status combinations a test deliberately provokes (the `422`/`504`
on `/bookings/confirm`, the `401` on a guest `/bookings/:ref` without a token).

## Screenshots — `stages/STAGE-003-booking/screenshots/` (72 = 24 scenarios × 3)

New this stage: `cweb-checkout-form`, `cweb-confirmation`, `cweb-trips` — plus the full
STAGE-001/002 set re-captured against the current build.

### Analysis

- **Checkout** shows the held-quote line table + a live hold countdown, driver fields, a test-card
  selector, and the terms checkbox; "Pay …" is disabled until terms are accepted and while the
  hold is expired. **Confirmation** shows the `RES-…` reference (bidi-isolated), the charged
  card brand/last4, the itemised lines (summing to the total), and the accepted terms version +
  time. All render at 390 / 820 / 1440.
- Money stays integer minor units end to end; the line-sum invariant is asserted in the unit
  calculator (STAGE-002), the STAGE-003 API test, and the E2E confirmation check.
