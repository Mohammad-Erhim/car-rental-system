# CR-20260908-001 — acceptance.md

**Decision: ACCEPTED, with a recorded independence caveat.**
**Date:** 2026-09-08
**Decided by:** Claude (Stage 7 audit agent, `SESSION-20260907-185500-STAGE-07`), on authority
delegated by the project owner on 2026-09-08 ("you decide acceptance decision based on best
professional practices"). The owner retains reversal authority on review.

## Independence caveat (read first)

The agent that built this scope is the agent accepting it. This is **not independent QA
sign-off**. The owner delegated the call explicitly; it is recorded here in full and is
reversible. Mitigating factors that make the delegation defensible:

- every item carries permanent automated coverage — **`verify:api` 146/146** on one clean run
  plus e2e across **three viewports** (laptop 40, tablet 37, phone 42 — all green this session);
- the deferred depth of each item is enumerated as a **named follow-up CR**, not hidden;
- all 11 host-runnable `verify:*` gates are green;
- no code path was accepted on inspection alone — each has a failing-first-then-passing test.

## Acceptance criteria — assessment

| Criterion                                        | Verdict     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every in-scope item in `request.md` is delivered | **PASS**    | D-1 extras/protection · D-2 customer records + eligibility restrictions (create/approve/reject/enforce/lift) + reversible merge · D-3 locations & hours editor · D-4 template content + per-event rules · D-6 unified search · `S7-DEF-006` usage counts. Per-item table in `verification.md`, cross-checked against the files in commit `56e3b64`.                                                                                                                                                                                                                                                                                  |
| Permanent tests, main + edge                     | **PASS**    | `product.spec` 6, `customer.spec` 5, `customer-restriction.spec` 4, `customer-merge.spec` 3, `location-admin.spec` 4, `search.spec` 7, `template.spec` 7, `notification-rule.spec` 4, `config-lookup` TEST-LKP-014 6; e2e in `report` / `booking` / `auth-and-reference`. Edge cases: unknown/inactive/out-of-scope/currency/qty-cap extras → 422; author≠approver on restriction approve → 403; in-scope active block → 422 at `booking.confirm()`; inverted location hours → 422; archive with future reservations → 422 unless `?force`; malformed search date → 422; disabled notification event → suppressed + `rule_disabled`. |
| Browser-verified across the viewport matrix      | **PASS**    | This session: `report` (all 5 new ops screens) laptop 9 + tablet 9; `booking` SCREEN-CUS-005 laptop+tablet+phone; `auth-and-reference` (incl. S7-OPT-002, FR-ADM-008 dialog) laptop 6; `full-sweep` every ops route (incl. the 5 new screens) no overflow, console clean; phone full set 42 green.                                                                                                                                                                                                                                                                                                                                   |
| Deferred depth is documented, not concealed      | **PASS**    | `verification.md` + `decision-list.md` name each follow-up: `product` `config_version` governance, localized product/location content, stock limits, agreement/receipt template lines, one-way-route pricing, map-coordinate confirmation, saved search views + facets, rental-_pickup_ restriction enforcement, customer-facing restriction explanation, automated duplicate _detection_, notification scheduler (delay/quiet-hours/escalation execution).                                                                                                                                                                          |
| No regression                                    | **PASS**    | `verify:api` 146/146 clean; `verify:static` / `i18n` (968) / `theme` / `unit` / `migrate` (empty→current through `0011`) / `security` / `seo` / `a11y` / `perf` green; `migrate.spec` re-run after `0011`.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Independent sign-off                             | **NOT MET** | See the caveat above — accepted on delegated authority instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Risk

Product risk: low for the delivered slices (fully tested, behind existing RBAC, additive
tables). The residual risk is **scope perception** — a reader expecting the _full_ FR-ADM depth
(schedulers, detection, localized public content) must consult the follow-up-CR list. That list
is explicit and linked, which is the accepted mitigation.

## Consequent actions

- `change-register.md` — `CR-20260908-001`: `BUILT — awaiting acceptance` → `ACCEPTED`
  (→ `VERIFIED`/`CLOSED` at the Stage 7 mechanical close, after the follow-up CRs are registered
  as their own rows).
- `baseline-alignment.md` — FR-ADM / Code / Tests rows for the delivered items → `ALIGNED`.
- `decision-list.md` — D-1…D-6 + `S7-DEF-006` → `ACCEPTED (CR-20260908-001)`.
- Register the enumerated follow-ups as their own CR rows (`CR-20260908-002…`), `PROPOSED`.
