# Flow Inventory — Stage 7 Phase 1

Independent expected-flow catalogue from FR user goals, design FLOW IDs, SRS acceptance criteria,
lifecycle states, and observed routes. Runtime PASS/FAIL in `coverage-matrix.md` (Phase 3).

## Customer flows (`APP-SITE`)

| Flow         | Goal                              | Entry → terminal                                                                         | Key API                                                      | Branches to test                                                                                                                                 |
| ------------ | --------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| FLOW-CUS-001 | Discover & book                   | `/` search → `/search` → `/vehicles/[cat]` → `/checkout` → confirmation → `/trips/[ref]` | discovery/search, discovery/quote, bookings/confirm          | no-results; stale quote; last-unit race; double-submit → 1 reservation; payment decline/timeout → no hidden charge; email fail → still confirmed |
| FLOW-CUS-002 | Sign in / return-to               | any protected → `/sign-in` → back to intended                                            | auth/sign-in, auth/refresh                                   | bad creds; return-to preserved; already signed-in                                                                                                |
| FLOW-CUS-003 | Register & verify                 | `/register` → verify-contact → signed in                                                 | auth/register, auth/verify-contact, auth/resend-verification | duplicate email (neutral); expired token; resend                                                                                                 |
| FLOW-CUS-004 | Modify reservation                | `/trips/[ref]` → modify → re-price → confirm                                             | reservations/{ref}/modify                                    | date change fails → original capacity kept (TEST-ERR-003); delta settle                                                                          |
| FLOW-CUS-005 | Cancel reservation                | `/trips/[ref]` → cancel review → confirm                                                 | reservations/{ref}/cancel                                    | policy refund; already-cancelled → same result (idempotent)                                                                                      |
| FLOW-CUS-006 | Active rental + extend            | `/trips/[ref]` (on_rent) → extension review → confirm                                    | rentals/{ref}/extend                                         | re-price + delta; capacity conflict                                                                                                              |
| FLOW-CUS-007 | Guest lookup / claim              | ? → lookup by ref+token → claim to account                                               | bookings/{ref}, bookings/{ref}/claim                         | **UI entry unconfirmed — `S7-GAP-S5`**                                                                                                           |
| FLOW-CUS-008 | Roadside / incident report        | ?                                                                                        | (ops incident)                                               | **customer UI unconfirmed — `S7-GAP-S6`**                                                                                                        |
| FLOW-CUS-009 | Return instructions / after-hours | `/trips/[ref]` / `/help`                                                                 | —                                                            | content reachable?                                                                                                                               |
| FLOW-CUS-010 | Account data request / closure    | `/account/data` → request → status                                                       | auth/data-requests (+/{id}/cancel)                           | closure blockers shown; cancel request                                                                                                           |

## Operations flows (`APP-OPS`)

| Flow         | Goal                    | Entry → terminal                                      | Key API                                                 | Branches                                                                   |
| ------------ | ----------------------- | ----------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| FLOW-OPS-001 | Staff-assisted booking  | `/ops/…` booking workspace                            | bookings/confirm (reservation.create)                   | **UI unconfirmed — `S7-GAP-S4`**                                           |
| FLOW-OPS-002 | Assign unit → pickup    | `/ops/rentals` → assign → pickup                      | ops/reservations/{ref}/assign, ops/rentals/{ref}/pickup | auto unit pick (advisory lock); licence required; agreement snapshot       |
| FLOW-OPS-003 | Return & closeout       | `/ops/rentals` → return → inspection → settle         | ops/rentals/{ref}/return                                | fuel/damage settlement; damage needs linked finding; unit → readiness gate |
| FLOW-OPS-004 | Reservation queue ops   | `/ops/work` → row → no-show / modify                  | ops/reservations, .../no-show                           | no-show reason; queue filters                                              |
| FLOW-OPS-005 | Incident + replacement  | `/ops/rentals` → incident → swap unit                 | ops/rentals/{ref}/incident                              | replacement vehicle swap; case opened                                      |
| FLOW-OPS-006 | Maintenance / block     | `/ops/fleet` → block / state→maintenance              | ops/fleet/blocks (+/{id}/release)                       | state-aware; released → bookable after readiness                           |
| FLOW-OPS-007 | Vehicle transfer        | `/ops/fleet` → transfer unit                          | ops/fleet/units/{id}/transfer                           | transfer_reason; location change                                           |
| FLOW-OPS-008 | Fleet import            | `/ops/fleet` → import CSV → dry-run → commit          | ops/fleet/units/import                                  | all-or-none commit; dry-run diff; bad rows                                 |
| FLOW-OPS-009 | Overdue sweep           | worker tick / `/ops/rentals`                          | ops/rentals/overdue-sweep                               | active→overdue; availability already excludes                              |
| FLOW-OPS-010 | Reconciliation          | `/ops/finance` → run → resolve exception              | ops/payments/reconciliation (+/run, /{id}/resolve)      | every provider txn reconciles or is an owned exception                     |
| FLOW-OPS-011 | Recovery case           | `/ops/finance` → case → resolve / retry               | ops/cases (+/{id}/resolve, /{id}/retry)                 | write-after-charge case; retry idempotent                                  |
| FLOW-OPS-012 | Refund                  | `/ops/finance`                                        | (payment.refund)                                        | two staff cannot refund same remaining amount                              |
| FLOW-OPS-013 | Rate plan publish       | `/ops/config/rate-plans` → draft → publish            | ops/pricing/rate-plans/{id}/publish                     | immutable once published; reflects on search, no redeploy                  |
| FLOW-OPS-014 | Reference data edit     | `/ops/config/reference-data` → edit value             | reference-data/types/{code}/values…                     | propagates to consumer selector, no redeploy; read-only denied             |
| FLOW-OPS-015 | Translation workflow    | `/ops/config/translations` → draft → review → publish | config/translations (+/publish)                         | `legal.*` publish block; completeness; stale `sourceRevision`              |
| FLOW-OPS-016 | Locale add / activate   | `/ops/config/languages`                               | config/locales (+activate/deactivate/default)           | RTL for a new locale; fallback chain                                       |
| FLOW-OPS-017 | Config version approval | `/ops/config` → draft → submit → approve/reject       | ops/config/versions/{id}/{submit,approve,reject}        | author cannot approve own (FR-ADM-006); approve supersedes prior + emits   |
| FLOW-OPS-018 | Reports                 | `/ops/insights` → run → export / schedule             | ops/reports/{code}/run, .../export, .../schedules       | location-scoped rows (FR-RPT-004); CSV; schedule send re-auth → skip+pause |
| FLOW-OPS-019 | Audit / data-quality    | `/ops/audit`, `/ops/data-quality`                     | ops/audit, ops/data-quality                             | masked before/after; 6-check sweep; read-only                              |

## Cross-cutting scenario classes (apply to every applicable flow)

Auth-loss on refresh/deep-link/2nd-tab/restart · access-token expiry → silent refresh ·
revoked/expired refresh · unauthorized role/tenant via UI **and** direct API · empty / no-results
/ first-use · double-submit / idempotency · optimistic-version conflict · network timeout /
partial failure · cancel / undo / reversal · offline / degraded · localized error, focus first
error · locale switch keeps task+data · RTL (Arabic) layout · phone/tablet/laptop no-overflow.
