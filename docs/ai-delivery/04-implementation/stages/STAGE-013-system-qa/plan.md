# STAGE-013 — System-wide QA & hardening · plan

## Objective / outcome

Prove the whole mandate: every affected page, flow, language, theme, viewport, and state
tested; issues found are fixed; the implement→test→fix→validate loop runs until there are **no
known unresolved issues, gaps, broken flows, missing translations, or incomplete requirements**.
Every mandate item closed to VALIDATED in traceability with a named evidence artifact.

## Source IDs

Mandate §1.8 (enhancement-program.md); SRS §22 (verification), SRS-NFR-\* (perf/a11y),
release-readiness precedent (`stages/STAGE-007-release-hardening/`).

## The matrix

Every route in `apps/site` **and** `apps/web` `/ops`:

```
routes  ×  {en, ar, fr}  ×  {light, dark}  ×  {phone 360, tablet 768, laptop 1280}
```

For each cell, assert:

- screenshot captured → `stages/STAGE-013-system-qa/screenshots/<app>/<route>/<locale>-<theme>-<vp>.png`
- **axe** WCAG 2.2 A+AA: 0 serious/critical
- **no horizontal overflow**; no clipped/overlapping text; RTL correct for `ar`
- **no missing/placeholder translation** visible (asserted against the bundle + a DOM scan)
- **no console errors, no unhandled rejections, no unexpected failed requests**
- theme tokens resolved (no default-fallback colour where a brand preset is active)
- `apps/site` only: LCP/CLS/INP within the STAGE-011 budget; `<title>`/canonical/OG/JSON-LD
  present and unique

## Flow tests (end-to-end, per locale, light+dark)

- Customer: browse → search → vehicle detail → quote/hold → checkout → confirmation → trips →
  reservation detail → modify → cancel; register → verify → sign-in → account → drivers →
  data request; guest checkout + claim.
- Ops: sign-in → dashboard → reservation queue action → assign vehicle → pickup → extend →
  return; config draft → submit → approve → publish (branding, SEO, languages, rate plan);
  report run + export; audit view; staff role change; add-a-locale.

## Loop

1. Run the full matrix + flows (`verify:all` + the widened `verify:e2e|a11y|seo|perf|i18n|theme`).
2. Triage every finding into `stages/STAGE-013-system-qa/defects.md` (D-013-n) with
   category (ui-ux | responsive | translation | theming | branding | seo | a11y | functional |
   visual), severity, repro.
3. Fix; re-run the affected cells; repeat until the run is clean.
4. Update `traceability-matrix.md` Enhancement rows to VALIDATED with the evidence path.

## Acceptance criteria (program close)

- Full matrix green: 0 axe serious/critical, 0 overflow, 0 visible missing translations, 0
  console/network errors, across all routes × 3 locales × 2 themes × 3 viewports, both apps.
- All customer + ops flows pass in en/ar/fr, light + dark.
- `apps/site` SEO + performance budgets met on the key routes.
- `CHANGELOG.md` `[Unreleased]` finalised; `enhancement-program.md` marked COMPLETED;
  `release-readiness.md` addendum with any bounded deferrals (none expected to be
  correctness/a11y/translation blockers).
- Every mandate item (§1.1–§1.8) = VALIDATED in traceability.

## Test evidence (→ `test-evidence.md`)

The full screenshot tree; the matrix run logs; `defects.md` with every D-013-n resolved;
Lighthouse + web-vitals reports; final `verify:all` transcript; traceability diff.
