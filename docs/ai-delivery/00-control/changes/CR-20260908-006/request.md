# CR-20260908-006 — request.md

**Title:** Customer-record automated duplicate detection (deferred from `CR-20260908-001` / D-2).

**Source/date:** Stage 7, 2026-09-08. **Status:** `PROPOSED`.

**Scope:** a background/interactive process that surfaces likely-duplicate customer records
(email / phone / name + DOB similarity) as merge candidates.

**Why deferred:** `CR-20260908-001` D-2 delivered the reversible **merge** itself (`customer_merge`,
archive-not-delete, `unmerge`, moved-id tracking) + the consolidated record + `MergeCard`, with
`customer.manage` RBAC and API + e2e coverage. Detection (vs. the operator picking the survivor by
id) is a separable capability.

**Acceptance intent:** FR propagation + API + e2e, or a scoped-out amendment.
