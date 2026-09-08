# CHECKPOINT-0007 — user authorized full build; D-1 extras & protection delivered

- **Timestamp:** 2026-09-08
- **Repo:** branch `implementation`, base `1efea67`. ~30 code/config files modified + ~14 new +
  `05-system-validation/` + `CR-20260908-001/`. Uncommitted.
- **Stage status:** `IN_PROGRESS`. User gave **full permission** to build the deferred
  `CR-20260908-001` scope autonomously. D-1 done + e2e-verified; queue continues.

## This interval — D-1 (extras & protection, FR-ADM-006 vertical slice)

- **Schema/data:** `product` table — org-scoped `code`, `kind` (extra|protection),
  `unitPriceMinor`, `currency`, `taxable`, `maxQuantity`, `categoryScope`/`locationScope`
  (empty = everywhere), `sortOrder`, `active`. Migration `0007_zippy_crystal`. 5 seeded products
  (full/basic protection, additional driver, child seat, GPS).
- **Service:** `ProductService` — `list` / `availableFor(cat,loc)` /
  `resolveForBooking({extraCodes,…})` (the one authoritative pricing path: 422 on unknown /
  inactive / out-of-scope / currency-mismatch / qty-over-`maxQuantity`; folds repeats to a
  quantity) / `upsert` / `setActive`.
- **Routes:** `GET /catalogue/products?category=&location=` (`@OptionalAuth`, customer surface);
  `GET|POST /ops/catalogue/products` + `:code/{deactivate,restore}` (`catalogue.manage` to
  write). `booking.confirm()` resolves `extraCodes` server-side → snapshotted `extra` reservation
  lines, taxed at the quote's effective rate; `subtotal`/`tax`/`total` recomputed; charge
  matches.
- **Ops UI (SCREEN-OPS-027):** `apps/web/src/surfaces/ops/products-page.tsx` — list + upsert form
  - activate/deactivate. Hooks (`useCatalogueProducts` / `useUpsertProduct` /
    `useSetProductActive`), route `/catalogue/products` (`catalogue.read`/`catalogue.manage`/
    `config.read`), nav (`Package` icon in the Catalogue group), i18n `ops.prod.*` (33 keys × 3).
- **Customer UI (SCREEN-CUS-005):** `apps/site` checkout gains an extras step —
  `useAvailableProducts` hook; per-product stepper (maxQuantity > 1) or toggle (= 1); client-side
  estimate only; sends `extraCodes` to `/bookings/confirm`. i18n `checkout.extras*` (8 keys × 3).
- **Contracts/openapi:** `zConfirmBookingRequest.extraCodes` already present; `openapi.json`
  regenerated — 116 paths.

## Verification

| Check                                             | Result                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:static`                                   | **PASS** — lint + typecheck + format + `openapi:check` (116) + contract drift                                                                     |
| `verify:i18n`                                     | **PASS** — 863 keys, en/ar/fr complete                                                                                                            |
| `product.spec.ts`                                 | **6/6** — catalogue list, customer scope filter, agent 403, manager create/reprice/deactivate, booking pricing (qty fold), qty-cap 422            |
| `booking.spec.ts`                                 | **8/8** — `S7-DEF-004` rewritten (legacy `extras` stripped; `extraCodes:['gps']` priced; unknown → 422) + new `SCREEN-CUS-005` extras-at-checkout |
| `template.spec` + `customer.spec` + `outbox.spec` | 7 + 5 + 4 — re-run green (no regression)                                                                                                          |
| `verify:e2e` `report` (laptop)                    | **6/6** — incl. `SCREEN-OPS-027` (add extra → deactivate)                                                                                         |
| `verify:e2e` `booking` (laptop)                   | **3/3** — incl. `SCREEN-CUS-005` (child seat + full protection → priced into confirmation total)                                                  |
| full 3-viewport `verify:e2e`                      | → Phase 4 (OOMs cold on this 1.9 GB host; targeted runs green)                                                                                    |

## Fix + build ledger (uncommitted)

`S7-DEF-001` FIXED · `S7-DEF-002` VERIFIED · `S7-DEF-003` VERIFIED · **`S7-DEF-004` FULLY
RESOLVED** (p1 server-price guard + D-1 real catalogue) · `S7-DEF-005` VERIFIED · `S7-OPT-001`
IMPLEMENTED · **D-1 vertical slice BUILT + e2e-VERIFIED** · D-2 read side BUILT+VERIFIED · D-4
content half BUILT+VERIFIED · `S7-DEF-006` / `D-3` / `D-6` / D-2·D-4 write-side halves → building
next · `D-7` = user acceptance of `CR-20260907-001` v1.1.

## Deferred → follow-up CR (documented)

`config_version` governance for `product` (draft/approve/effective-date/terms-version binding);
localized product name/description; stock limits; agreement & receipt template line integration
beyond the reservation line.

## Exact next action

1. `S7-DEF-006` — reference-data usage counts (read-only aggregate + deactivation guard).
2. D-6 — unified reservation + rental search.
3. D-3 — locations / operating-hours editor (SCREEN-OPS-028).
4. Write-side halves: customer-restriction enforcement (booking/pickup guard), customer merge
   (reversible), template event-rules.
5. `S7-Q-014` `SCREEN-CUS-*` path refresh; then Phase 4 (deep audit + full `verify:all` +
   screenshots + `final-report.md` non-DRAFT + `pipeline-state.md` / `manifest.md`).

## Resume order

`README.md` → `current-state.md` → `work-queue.md` → `decision-list.md` → `defects.md` →
`cr-reconciliation.md` → `00-control/changes/CR-20260908-001/{request,plan,verification}.md` →
this file. Datastores: `DEV_UP_FORCE_NATIVE=1 pnpm dev:up`.
