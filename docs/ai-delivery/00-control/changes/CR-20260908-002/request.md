# CR-20260908-002 — request.md

**Title:** `product` catalogue depth (deferred from `CR-20260908-001` / D-1).

**Source/date:** Stage 7 (`SESSION-20260907-185500-STAGE-07`), 2026-09-08. **Status:** `PROPOSED`.

**Scope:** `config_version` governance (draft → review → publish) for the `product` catalogue;
localized `name` / `description` per active locale; per-product stock / quantity-remaining limits;
extra/protection lines rendered into the rental agreement + receipt templates.

**Why deferred:** `CR-20260908-001` D-1 delivered the vertical slice — `product` table,
authoritative booking-time pricing, `/ops/catalogue/products` editor, `apps/site` checkout step,
with `catalogue.manage` RBAC + audit + 422 rejection paths and full API + e2e coverage. The
governance/localization/stock/template depth is a bounded second increment with design latitude.

**Acceptance intent:** each sub-item ships with FR / UI-UX / SRS propagation + API + e2e tests,
or an accepted amendment scoping it out.
