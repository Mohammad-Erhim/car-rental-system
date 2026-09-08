# CR-20260907-001 — verification.md

**Status:** partially executed (path 1 of `plan.md`) — v1.1 amendment documents drafted
2026-09-08; formal acceptance and the `ALIGNED` transition remain a Stage-gate / Stage-7
decision. Not yet `VERIFIED` or `CLOSED`.

## Done (2026-09-08)

- **FR, UI/UX Design, and SRS each have a drafted v1.1 amendment** documenting the
  enhancement-program scope with stable new IDs and no renumbering of any v1.0 ID:
  - `01-functional-requirements/functional-requirements-v1.1.md` — adds `FR-BRD-001..004`
    (branding/theming), `FR-SEO-001..004` (public-site SEO), `FR-IAM-009` (step-up auth);
    resolves the v1.0 §14 configuration decisions the enhancement program settled; Appendix A
    maps the FR IDs the program _implemented_ (FLT-003/005, RNT-010, INT-002, RPT-006,
    ADM-012, GBL-007) to their endpoints/screens.
  - `02-ui-ux-design/ui-ux-design-plan-v1.1.md` — adds `SCREEN-OPS-040..044`
    (branding editor, SEO settings, languages admin, recovery & reconciliation, data quality)
    and `SCREEN-SHARED-STEP-UP`; records the `apps/site` surface, light/dark, the grouped
    nav + command palette + breadcrumb, and the `DataTable`/`Toolbar`/`DetailList` contract.
  - `03-srs/srs-v1.1.md` — adds `SRS-SITE-001..004` (Next.js customer surface, SEO gate, perf
    budget, standalone serving), `SRS-BRAND-001..003` (`branding`/`seo` config kinds + brand-
    asset upload + sanitiser), `SRS-SEC-018` (step-up); extends `SRS-UI-011`; extends §18.2
    with STAGE-009..013.
- **No behaviour gap was introduced _by the amendment drafting itself_.** The doc-only pass
  changed no code. **However — Stage 7 correction (2026-09-08):** on a clean checkout at
  `1efea67`, `verify:e2e` was **RED** (`S7-DEF-003` — `smoke.spec.ts` still asserted the
  pre-SCREEN-OPS-002 "unavailable metrics" placeholder; the green e2e run cited here pre-dated
  the `1efea67` dashboard commit). Stage 7 fixed the test and re-verified: `verify:e2e` green on
  all three viewports. The other suites (`verify:static` / `verify:i18n` — now 778 keys after a
  dead key was removed / `verify:theme` / `verify:unit` 89 / `verify:api` **107** incl. the new
  `outbox.spec` / `verify:seo` / `verify:a11y` / `verify:perf`) are green after the Stage 7
  fixes. See `05-system-validation/`.
- **`04-implementation/traceability-matrix.md`** — the new IDs' code/test anchors are the
  Appendix A / Appendix B tables in each v1.1 file and the per-increment entries in the root
  `CHANGELOG.md` `[Unreleased]`; a formal merge of these into the matrix is a Stage-7 step.
- **`baseline-alignment.md`** — updated 2026-09-08: FR / UI-UX / SRS rows move from
  `UPDATE_REQUIRED` to `IN_PROGRESS` ("v1.1 amendment drafted"); they read `ALIGNED` on
  acceptance.

## Remaining for CLOSED

- Formal acceptance of FR v1.1 / UI-UX v1.1 / SRS v1.1 at a stage gate (the CR's `plan.md`
  path 2 folds this into Stage 7).
- `baseline-alignment.md` FR / UI-UX / SRS / Code rows → `ALIGNED`.
- An independent Stage-7 four-way audit (`07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md`) — none has
  run under this pipeline pack.
