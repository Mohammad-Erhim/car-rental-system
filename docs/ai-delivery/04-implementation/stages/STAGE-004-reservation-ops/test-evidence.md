# STAGE-004 — test evidence

Stage: **Reservation operations** (detail, modify, cancel + refund, no-show, history, reconciliation).
Date: 2026-09-07. Branch `implementation`.

## Verification gates (all green)

| Gate              | Command               | Result                                                                                                             |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Static            | `pnpm verify:static`  | PASS                                                                                                               |
| Unit              | `pnpm verify:unit`    | PASS — 63                                                                                                          |
| API integration   | `pnpm verify:api`     | PASS — **44** (`reservation-ops` 6, `booking` 7, `discovery` 7, `iam` 9, `config-lookup` 5, `migrate` 4, `meta` 6) |
| Migration         | `pnpm verify:migrate` | PASS — 4; migration `0004` (`reservation_event`, `reconciliation_exception`) empty→current                         |
| E2E (3 viewports) | `pnpm verify:e2e`     | PASS — **69** (23 × phone/tablet/laptop), 0 console errors, 0 unexpected failed requests                           |

## API integration tests (`apps/api/test/reservation-ops.spec.ts`, 6)

- **TEST-RSV-001** cancel > 48 h before pickup → full refund (`feeMinor: 0`,
  `refundMinor == paidMinor`); a **second** cancel returns the same result and the history has
  **exactly one** `cancelled` event (idempotent).
- **late cancel** < 48 h → `feeMinor == round(total × 20%)`, `refundMinor == paid − fee`.
- **TEST-RSV-002** `modify` (return date +2 days) → `deltaMinor > 0`, the new total = old +
  delta, the re-written lines still sum to the new total, and a `modified` history event is written.
- **TEST-ERR-003** filling both premium units at a window, then `modify`-ing a third premium
  reservation into that window → `422 no_availability`; the reservation is **unchanged**
  (same `pickupAt`, same `totalMinor`). The new window is secured with a fresh hold _before_ the
  old is touched, so a failure never loses capacity. (Availability now also subtracts confirmed
  reservations, with the reservation being modified excluded from its own count.)
- **reconciliation** an injected amount mismatch → one owned `reconciliation_exception`
  (`kind: amount_mismatch`); resolving it with a note removes it from the open list.
- **recovery case** the STAGE-003 `write_after_charge` case is listed via `GET /ops/cases` and
  resolvable via `POST /ops/cases/:id/resolve`.

## E2E (`e2e/tests/reservation-ops.spec.ts`, 9 = 3 × 3 viewports)

| Test                                                                                                                                            | Source IDs                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| FLOW-CUS-005: Trips → reservation detail → **Cancel** (confirm dialog) → state `cancelled`, refund shown, history records it                    | SCREEN-CUS-014/016/019, FLOW-CUS-005, FR-RSV-003 |
| FLOW-CUS-004: reservation detail → change return date → `res-modify-msg` shows the extra charged, the total updates, history records `modified` | SCREEN-CUS-015, FLOW-CUS-004, FR-RSV-002         |
| SCREEN-OPS-004: the operations reservation queue renders and filters by state                                                                   | SCREEN-OPS-004, FR-ADM-001                       |

## Screenshots — `stages/STAGE-004-reservation-ops/screenshots/` (81 = 27 scenarios × 3)

New: `cweb-reservation-detail`, `cweb-reservation-cancelled`, `ops-reservation-queue`.

### Analysis

- **Reservation detail** shows the itinerary, driver list, itemised price (+ a "Refunded" row
  after a cancel), and — while the reservation is still `confirmed` and future — a change-return-
  date form and a Cancel button with the 48-hour policy note. The **history** timeline lists
  every consequential event with actor + signed amount delta. All render at 390 / 820 / 1440.
- **Modify safety**: the new window is held before the old is released; a failed modify leaves
  the reservation and the freed capacity exactly as they were (proven in the API test).
- Refund and fee math is integer minor units; the fee is a policy percentage, not a magic
  constant.
