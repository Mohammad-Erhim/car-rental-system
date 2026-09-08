# CR-20260908-001 — request.md

**Title:** Complete the deferred FR-ADM operations/admin scope (extras/protection, locations
editor, unified search, and the write-side halves of customer records + notification templates).

**Source / date:** raised by the Stage 7 audit (`SESSION-20260907-185500-STAGE-07`), 2026-09-08.

**Motivation:** the Enhancement Program (STAGE-009..013) delivered theming / i18n / Next.js / SEO
/ ops-UX but left several original v1.0 FR-ADM surfaces unbuilt; `traceability-matrix.md` had
over-claimed some as `COMPLETED` (`S7-DEF-007`). Stage 7 built the cleanly-bounded slices
autonomously (customer records read side, notification-template content editor) and closed
`S7-DEF-002/004`; the remainder is material product scope with design latitude and is gathered
here rather than guessed at.

## In scope

| Item                                 | FR / Screen                                                | What's left                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extras & protection                  | FR-ADM-006, FR-PRC-005/006, SCREEN-OPS-027, SCREEN-CUS-005 | A `product` catalogue (table + `config_version` kind), an `/ops` editor, quote-time pricing of selected `extraCodes`, and the `apps/site` checkout step. Stock / quantity-limit / terms-version depth may be a second increment.                                                                      |
| Locations & operating-hours admin    | FR-ADM-007, SCREEN-OPS-028                                 | An `/ops` editor for hours + holiday hours + pickup/return instructions + after-hours capability + one-way routes + location policies, with a future-reservation impact preview.                                                                                                                      |
| Unified reservation + rental search  | FR-ADM-003, SCREEN-OPS-004                                 | Either one `/ops/search` across reservations **and** rentals (reference / customer / driver / location / dates / vehicle / status / payment state / channel / assigned staff, plate lookup, saved views), or a CR that formally accepts the current `/ops/work` + `/ops/rentals` split as the design. |
| Customer records — write side        | FR-ADM-001, FR-ADM-002                                     | Duplicate detection + reversible merge; the eligibility-restriction create / approve / **enforce** workflow (a restriction row must be able to gate booking/pickup per its scope + dates).                                                                                                            |
| Notification templates — event rules | FR-ADM-011                                                 | Trigger event / audience / timing / retry / escalation / sender identity; "transactional messages cannot be disabled if it leaves a flow without notice".                                                                                                                                             |
| Reference-data usage count           | FR-ADM-008 (`S7-DEF-006`)                                  | Compute + surface a real per-value usage count; gate deactivation of an in-use value.                                                                                                                                                                                                                 |

## Desired outcome / acceptance intent

Each FR-ADM acceptance test passes end-to-end, `traceability-matrix.md` re-stated to `COMPLETED`
with real code/test anchors, and FR / UI-UX / SRS updated (this CR propagates through all three
layers). Or, per item, an accepted amendment that formally scopes it out of v1 with rationale.

**Status:** `PROPOSED` — awaiting the user's per-item decision (build vs. scope-out), captured in
`05-system-validation/decision-list.md` D-1 / D-3 / D-6 and the write-side notes on D-2 / D-4.
