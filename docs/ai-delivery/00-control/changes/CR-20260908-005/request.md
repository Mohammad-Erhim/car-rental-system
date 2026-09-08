# CR-20260908-005 — request.md

**Title:** Eligibility-restriction enforcement depth (deferred from `CR-20260908-001` / D-2).

**Source/date:** Stage 7, 2026-09-08. **Status:** `PROPOSED`.

**Scope:** enforce an active `block` restriction at **rental pickup** (not only at
`booking.confirm()`); a customer-facing explanation string when a booking is refused
(`customer_restricted`).

**Why deferred:** `CR-20260908-001` D-2 write side delivered the create → approve/reject
(author != approver, 403) → lift workflow, `customer_restriction.status`, and
`assertCanTransact()` enforcement in `booking.confirm()` → 422 `customer_restricted` for an
in-scope active block, with `customer.manage` RBAC and API + e2e coverage.

**Acceptance intent:** FR / UI-UX propagation + API + e2e per sub-item, or a scoped-out amendment.
