# Release readiness — Enhancement Program (STAGE-009…013)

Scope: the enhancement program on top of the STAGE-000..008 baseline —
system-wide theming/branding, complete i18n (en/ar/fr), the Next.js public site (`apps/site`),
the `/ops` dashboard UX overhaul, and system-wide QA. Baseline release readiness for
STAGE-000..007 is `stages/STAGE-007-release-hardening/release-readiness.md`; this document adds
the enhancement-program surface and does not restate it.

Date: 2026-09-08. Branch `implementation`.

## Gate summary

| Gate                      | Command                | Result                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static                    | `pnpm verify:static`   | PASS — lint + typecheck (9 projects) + prettier + `openapi:generate` + contract drift. (`format:check` was red on 17 stale committed docs — formatted, D-013-7.)                                                                                                                                                            |
| i18n parity + no-literal  | `pnpm verify:i18n`     | PASS — en/ar/fr key + ICU-placeholder parity; `--strict` 0 hardcoded literals in `apps/site/src`                                                                                                                                                                                                                            |
| Theme contrast            | `pnpm verify:theme`    | PASS — 9 tests; WCAG AA every seeded preset light + dark; no literal colours in component TS/TSX                                                                                                                                                                                                                            |
| Unit                      | `pnpm verify:unit`     | PASS — 89 (theme 9, i18n 11, contracts 4, ui 10, api 42, web 13)                                                                                                                                                                                                                                                            |
| API integration           | `pnpm verify:api`      | PASS — 101 / 15 spec files (after D-013-9 Redis outage + D-013-10 two timing-fragile tests)                                                                                                                                                                                                                                 |
| Migration (empty→head)    | `pnpm verify:migrate`  | PASS — 4; head `0006`                                                                                                                                                                                                                                                                                                       |
| Security                  | `pnpm verify:security` | PASS — 13 (`security.spec.ts`); SRS-SEC adversarial suite, unchanged by the enhancement program                                                                                                                                                                                                                             |
| SEO                       | `pnpm verify:seo`      | PASS — 6 routes × {en,ar,fr}: title/desc/canonical/hreflang/`<html lang/dir>`/OG/`twitter:card`/JSON-LD; `robots.txt` + `sitemap.xml` (30 `<loc>`); `noindex` on private routes. (`verify-seo.sh` build-order fix: API up before the `apps/site` build.)                                                                    |
| E2E (phone/tablet/laptop) | `pnpm verify:e2e`      | PASS — 91 across phone (30) / tablet (29) / laptop (32); all 13 specs on the single-origin `apps/site` + `/ops`-proxy stack                                                                                                                                                                                                 |
| Accessibility             | `pnpm verify:a11y`     | PASS — 2 (laptop project); 0 serious/critical over the customer + `/ops` critical set                                                                                                                                                                                                                                       |
| Performance (first-load)  | `pnpm verify:perf`     | PASS (2026-09-08, D-013-6) — `apps/site` first-load JS ~223 KB br static / ~233 KB br interactive, budgets 260 / 285 / 52 KB br; `perf-site.mjs` green on all 9 routes. API hot-read smoke unchanged.                                                                                                                       |
| QA matrix                 | `scripts/qa-matrix.sh` | PASS — 5 `apps/site` routes × {en,ar,fr} + 16 `/ops` screens × {en,ar}, all × {light,dark} × {phone,tablet,laptop}: screenshot + axe (0 serious/critical) + no h-overflow + no missing-translation marker + `<html lang/dir>` + no console/network errors. Found + fixed D-013-11 (site-header `link-name` at phone width). |

Gates were run individually this session (an end-to-end `verify:all` is the same set); the
per-gate transcript is the `## 2026-09-08 — stage close-out` table in `checkpoint.md`.

## Mandate → validation (see `traceability-matrix.md` §"Enhancement program")

| Mandate item (`enhancement-program.md` §1)               | Validation artifact                                                                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1.1 Professional UI/UX — public + dashboard, responsive | QA matrix screenshots (3 viewports); `verify:e2e` `responsive` + `full-sweep`; `verify:a11y`                                                                                          |
| §1.2 System-wide light / dark                            | `verify:theme` (AA both modes); QA matrix `.dark` assertion × every cell                                                                                                              |
| §1.3 Customizable theming, dashboard-managed, both apps  | `branding.spec.ts`; `GET /meta/branding` consumed by `apps/site` (build/ISR) + `apps/web` (boot); live re-theme, no redeploy                                                          |
| §1.4 Branding section — logos/assets/colours/themes      | brand-asset upload (`ObjectStoragePort`, MIME/size sniff, SVG sanitiser); `/ops/config/branding` in the QA matrix                                                                     |
| §1.5 Complete i18n — every element, no mixed screens     | `verify:i18n` (`--strict`, 0 literals in `apps/site/src`); QA matrix missing-marker scan × {en,ar,fr}                                                                                 |
| §1.6 Dynamic locale + translation management             | `/ops/config/languages` (add/activate/reorder/default); `translation.service` completeness + publish; `verify:e2e` `account-and-i18n`                                                 |
| §1.7 Dashboard UX best practices                         | `DataTable` on every tabular `/ops` screen; `PageHeader` on every `/ops` screen; command palette + breadcrumbs; `verify:a11y` `/ops` 0 serious/critical                               |
| §1.8 Public pages on Next.js — SEO/perf/meta/indexing    | `verify:seo`; `verify:perf` first-load budget (D-013-6); `sitemap.xml` / `robots.txt` / JSON-LD dumps                                                                                 |
| §1.9 Cohesive brand-appropriate design                   | shared `@carrental/theme` token system + presets applied to both apps; `verify:theme` no-literal-colour gate                                                                          |
| §1.10 Trace + checkpoint + changelog + fix-loop          | per-stage `checkpoint.md` / `defects.md`; root `CHANGELOG.md`; the `## 2026-09-08 — stage close-out` gate table + QA matrix in `checkpoint.md`; `defects.md` D-013-1..11 all resolved |

## Deferred / environment-blocked (explicit, not dropped)

None of these affect a correctness invariant, an authz boundary, or a money path.

| Item                                            | Why deferred / where it lands                                                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Firefox / WebKit in the E2E matrix              | Only Chromium installs on this host. `e2e/playwright.config.ts` carries `firefox` + `webkit` projects behind `E2E_ALL_BROWSERS=1` for CI.                                                                    |
| k6 write-path load                              | Needs a staged multi-instance deploy. Scenario scripted at `scripts/load/write-path.k6.js` (unrun here).                                                                                                     |
| OWASP ZAP baseline + SAST                       | Need the tool binaries + a staged deploy. `verify:security` covers the SRS-SEC adversarial set as integration tests in the interim.                                                                          |
| Lighthouse LCP / INP field run for `apps/site`  | Needs headless Chrome in CI. `verify:perf` covers the first-load JS / HTML / render-blocking / CLS budget; LCP/INP is CI-optional.                                                                           |
| `apps/site` i18n message-catalogue locale split | The en/ar/fr catalogue ships as one ~41 KB gz chunk on every route — inside the re-baselined budget. A later optimisation (`464-*.js` in the D-013-6 analysis).                                              |
| `FormLayout` / `DetailLayout` primitives        | No second `DetailLayout` consumer; the sectioned-form + summary-rail pattern is delivered via `Card` / `Field` / `DetailList` composition. Revisit if a screen needs a shared dirty-guard + sticky save bar. |

## Verdict

**Ready for a staging deploy of the enhancement-program scope.** Every `verify:*` gate that is
runnable on this host passes (see the `checkpoint.md` gate table), the widened QA screenshot
matrix is green, and `defects.md` D-013-1..11 are all resolved. The deferred list is bounded,
reasoned, and free of correctness / authz / money blockers.

Pre-production, against a staged multi-instance environment: run the tool-based security scans
(ZAP, SAST), the k6 write-path load (`scripts/load/write-path.k6.js`), add Firefox/WebKit to
the E2E matrix (`E2E_ALL_BROWSERS=1`), and take a Lighthouse LCP/INP field reading for `apps/site`.
