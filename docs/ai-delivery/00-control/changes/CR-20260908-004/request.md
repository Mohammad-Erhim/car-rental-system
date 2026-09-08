# CR-20260908-004 — request.md

**Title:** Unified search depth (deferred from `CR-20260908-001` / D-6).

**Source/date:** Stage 7, 2026-09-08. **Status:** `PROPOSED`.

**Scope:** saved search views; assigned-staff / payment-state / channel facets on
`GET /ops/search`.

**Why deferred:** `CR-20260908-001` D-6 delivered the read-only unified search across
reservations + rentals (free text on reference / driver / licence / plate / VIN; `kind` /
`status` / `locationCode` / `from` / `to` filters; each hit carries `kind`, `overdue`, `href`)
with `reservation.read | rental.read` RBAC and API + e2e coverage.

**Acceptance intent:** UI-UX + API + e2e per sub-item, or a scoped-out amendment.
