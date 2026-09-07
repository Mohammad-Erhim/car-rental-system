# Enhancement Program — public site (Next.js), theming/branding, full i18n, dashboard UX, SEO

**Status:** PLANNED (2026-09-07). Master plan for STAGE-009 … STAGE-013. Supersedes nothing in
STAGE-000..008 behaviour; it re-platforms the customer surface and raises the whole system to a
professional, brand-customizable, fully-localized bar.

This is the "document all planned changes before implementation" artifact. Per-stage detail is in
`stages/STAGE-009…013-*/plan.md`; progress in each stage's `checkpoint.md`; evidence in each
`test-evidence.md`; the running program changelog is the root `CHANGELOG.md` `[Unreleased]`.

---

## 1. Mandate (verbatim intent)

1. Fully enhance **public pages + dashboard** — professional, modern, clean, brand-aligned
   UI/UX; high-quality responsive components at every breakpoint; consistent behaviour and
   visual quality system-wide.
2. System-wide **light / dark mode** + **professional customizable theming**; theme settings in
   the dashboard, applied to **both** the dashboard and the public site.
3. A **branding section** in the dashboard — logos, images, brand assets, colors, themes, and
   related visual settings — so both experiences are professionally customized to the brand.
4. **Complete i18n** — every page, component, field, label, message, validation, option, and UI
   element. Changing language never yields a partially-translated or mixed-direction screen.
   Localization architecture supports adding languages/translations dynamically and easily.
5. **Dashboard UX** — modern components, clear hierarchy, intuitive navigation, short flows,
   strong accessibility, responsive layouts, consistent reusable patterns.
6. **All public-facing pages on Next.js** — optimized for SEO, performance, accessibility,
   responsiveness, metadata, indexing, and technical SEO; SEO settings surfaced in the
   dashboard where applicable.
7. Both surfaces: polished, cohesive, brand-appropriate — not generic.
8. Trace every requirement through implementation **and** validation; checkpoints + changelog
   throughout; test every affected page / flow / language / theme / viewport / state; capture
   screenshots as evidence; verify light+dark × locales × breakpoints; fix everything found;
   iterate implement→test→fix→validate until the scope is complete with no known open issues.

## 2. Locked decisions (confirmed with the user 2026-09-07)

| #              | Decision                                                                                                                                                                                                                                                                               | Record                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Next.js scope  | **Public site only.** New `apps/site` (Next.js App Router) hosts the entire customer surface (the current `/` route tree). `apps/web` (Vite SPA) keeps **only** `/ops` and is overhauled in place. Shared design system stays in `packages/ui`.                                        | DEC-023                                        |
| Launch locales | **en + ar + fr**, all three fully translated and QA'd across every page, theme, and breakpoint. `ar` drives full RTL. Architecture still supports adding more dynamically.                                                                                                             | DEC-024 (supersedes the DEC-020 open question) |
| Theming depth  | **Curated controls** — brand colors (primary/accent/semantic), logo + favicon + OG image upload, font from a curated set, light/dark, radius + density presets → design tokens; versioned through the STAGE-006 `configVersion` workflow; applied to both frontends. No arbitrary CSS. | DEC-025                                        |

## 3. Current-state facts the plan builds on

- **Customer surface** (→ moves to `apps/site`): `/`, `/search`, `/vehicle/:categoryCode`,
  `/checkout`, `/sign-in`, `/register`, `/recovery`, `/account`, `/account/{profile,drivers,
payments,data}`, `/trips`, `/trips/:reference`, `/help`. ~14 route entries, ~20 screens.
- **Ops surface** (stays Vite, overhauled): `/ops` + `/ops/sign-in` `/ops/recovery` +
  `config/reference-data`, `admin/staff`, `config/translations`, `work`, `fleet`,
  `config/rate-plans`, `rentals`, `finance`, `config`, `insights`, `audit`. ~13 screens.
- **i18n is already DB-driven.** `locale` table (`direction`, `fallbackChain`, `isDefault/
isActive/testOnly/sortOrder`) + `translation` table (`namespace`,`key`,`localeCode`,`value`,
  `status` draft|in_review|published|retired, `sourceRevision` for stale detection,
  `reviewedBy/At`, `isFallbackAccepted`). API: `GET /api/v1/meta/locales`,
  `GET/POST /api/v1/config/translations`, `…/completeness`, `…/publish`. Ops editor at
  `/ops/config/translations`. **Only the `common` namespace (~63 keys) is extracted today** —
  the rest of both UIs is hardcoded English. Runtime merge path exists
  (`I18nProvider resources={…}` over `BASE_RESOURCES`).
- **Design tokens** = shadcn HSL-triplet CSS variables, **duplicated** in
  `apps/web/src/index.css` and `packages/ui/src/styles.css`; `.dark` block exists but
  **no `ThemeProvider` / toggle** — dark mode is unbuilt at the app level.
- **`configVersion`** table + draft→submit→approve/reject→publish + `config.version.published.v1`
  event (STAGE-006) — reuse for theme + branding + SEO config.
- **Object storage** (`ObjectStoragePort`, `fs` driver, HMAC-signed URLs) — reuse for brand
  asset uploads.
- Playwright E2E harness with 3 viewports + `en`/`ar` sweep + axe (`e2e/tests/full-sweep.spec.ts`,
  `a11y.spec.ts`). Extend for `fr`, light/dark, and `apps/site`.

## 4. Target architecture

```
apps/
  site/   NEW — Next.js (App Router) customer site. SSG/ISR, /[locale]/… routing, full SEO.
  web/    Vite SPA — /ops ONLY after the split. Operations & Admin dashboard.
  api/    NestJS — + branding/theme/SEO config endpoints, brand-asset upload, i18n admin.
packages/
  ui/         design-token engine (single source), themeable primitives, shared patterns.
  i18n/       message catalogue, ICU, formatters; framework-agnostic core + React + Next bindings.
  theme/      NEW — token schema + resolver (config JSON → CSS variables), shared by site + web.
  contracts/  + zBrandConfig, zThemeConfig, zSeoConfig, zLocaleAdmin, zTranslationAdmin.
```

- **Theme/branding delivery.** Dashboard writes a `configVersion` of kind `branding` (colors,
  radius, density, font key, asset refs) → on publish the API exposes a small public
  `GET /api/v1/meta/branding` (cacheable, ETagged). `apps/site` reads it at build/ISR time and
  inlines critical tokens as a `<style>:root{…}</style>` (no FOUC, SEO-safe); `apps/web` fetches
  it on boot and applies before first paint. `packages/theme` turns the config into the CSS
  variable set for both. Light/dark are two token maps in one config.
- **i18n delivery.** Build-time bundles from `packages/i18n` for first paint; runtime overlay
  from `GET /api/v1/config/translations?...` (published only) merged over the bundle. `apps/site`
  uses `/[locale]/` path routing + `generateStaticParams` for en/ar/fr, `<html lang dir>` per
  locale, `hreflang` alternates. `apps/web` keeps the provider + adds `dir` handling.
- **SEO (apps/site).** Next Metadata API per route (title/description/canonical/OG/Twitter),
  `robots.ts`, `sitemap.ts` (localized), JSON-LD (Organization, LocalBusiness, Product/Vehicle,
  BreadcrumbList), image optimization, `next/font`, per-locale canonical + `hreflang`. A
  dashboard **SEO settings** panel (site name, default meta, social handles, verification tags,
  robots toggle, per-category overrides) via a `seo` configVersion kind.

## 5. Stages

| Stage         | Title                             | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **STAGE-009** | Design system, theming & branding | `packages/theme`; unified single-source tokens; `ThemeProvider` + light/dark/system in both apps; curated theme + branding controls in the dashboard (colors, radius, density, font, logo/favicon/OG upload) versioned via `configVersion`; `GET /meta/branding`; brand-asset upload endpoint. Both apps re-theme live with no rebuild.                                                                                                                                                                     |
| **STAGE-010** | Internationalization completion   | Extract every string in `apps/web` + `apps/site` into namespaced keys; author full `en`/`ar`/`fr` (UI, validation messages, zod/enum/option labels, emails/notifications); RTL pass; locale-aware routing in `apps/site`; dashboard **Languages** admin (add/activate/reorder a locale, per-namespace completeness, inline translation editing, import/export) built on the existing catalogue; a `verify:i18n` gate (no missing/placeholder keys for active locales, no hardcoded literals via lint rule). |
| **STAGE-011** | Public site on Next.js            | `apps/site` scaffold (App Router, TS strict, Tailwind + `packages/ui`, `next/font`); port all customer screens with parity + the UI/UX uplift; `/[locale]/` routing; auth (access token + refresh cookie) against the same API; full technical SEO (metadata, sitemap, robots, JSON-LD, canonical/hreflang, OG images); performance budget (LCP/CLS/INP, bundle); dashboard **SEO settings** panel; container + compose wiring; nginx/routing so `/` → site, `/ops` → web, `/api` → API.                    |
| **STAGE-012** | Operations dashboard UX overhaul  | Rework `apps/web` `/ops`: information hierarchy, navigation (grouped, breadcrumbs, command palette), reusable page/table/detail/form/empty/error patterns in `packages/ui`, density + responsive behaviour to phone, dark mode parity, WCAG 2.2 AA, short-flow reworks of the heavy screens (config versioning, reports, fleet, rentals, finance). No API/behaviour change.                                                                                                                                 |
| **STAGE-013** | System-wide QA & hardening        | Playwright matrix: every route in `apps/site` + `apps/web` × {en, ar, fr} × {light, dark} × {phone, tablet, laptop} — screenshot + axe + no-overflow + no console/network errors + LCP/CLS budget on `apps/site`. Triage → fix → re-run until clean. Update traceability to VALIDATED for every mandate item. Release-readiness + deferrals.                                                                                                                                                                |

Stages land in order; 010 depends on 009 (token/theme context), 011 depends on 009+010,
012 can overlap 011, 013 is last. Each stage: implement → `verify:*` green → screenshots →
fix loop → `checkpoint.md` + `test-evidence.md` + `CHANGELOG.md` + push.

## 6. Verification additions

| Gate           | Adds                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:i18n`  | fails on any missing/`__MISSING__`/placeholder key for an **active** locale in either app; ESLint `i18n/no-literal-string` (allowlisted) on `apps/site` + `apps/web`.                     |
| `verify:theme` | asserts computed contrast ≥ WCAG AA for the seeded brand presets in light **and** dark; asserts no hardcoded hex/rgb in component styles (tokens only).                                   |
| `verify:seo`   | `apps/site` — every route resolves unique `<title>`/description/canonical; `sitemap.xml` + `robots.txt` valid; JSON-LD parses; `hreflang` reciprocity; Lighthouse SEO ≥ 95 (CI-optional). |
| `verify:e2e`   | matrix widened to `fr` + light/dark + `apps/site` routes; screenshots to `stages/STAGE-013-system-qa/screenshots/`.                                                                       |
| `verify:a11y`  | axe over `apps/site` routes + the reworked `/ops` screens, both themes.                                                                                                                   |
| `verify:perf`  | `apps/site` LCP/CLS/INP + JS-transfer budget in addition to the API smoke.                                                                                                                |

## 7. Traceability

`traceability-matrix.md` gets an **Enhancement** section: one row per mandate item (§1.1–§1.8)
→ owning stage → implementation artifact(s) → validation artifact(s) → status
(PLANNED → IN&nbsp;PROGRESS → IMPLEMENTED → VALIDATED). No item closes without a named
validation artifact (test file, screenshot set, or gate run). New decisions: DEC-023
(Next.js public site), DEC-024 (locales en/ar/fr), DEC-025 (curated theming).

## 8. Explicitly out of scope

New booking/rental/payment **business** behaviour; the APP-CMOB mobile frontend; a CMS for
long-form marketing copy beyond the branding/SEO fields; multi-tenant branding (single brand
config); live payment/mail providers; registry publishing / K8s manifests (noted in STAGE-008).

---

## Progress (2026-09-07)

| Stage                                     | State                                   | Shipped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Remaining                                                                                                                                                                 |
| ----------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **009** Design system, theming & branding | **Increments 1–3 (3 partial)**          | as before, plus: **density is functional** — `--control-h`/`-sm`/`-px` vars flip on `[data-density='compact']`, `Button`/`Input` read them (44px comfortable / 38px compact, browser-verified); `apps/site` sets `data-density` on the SSR `<html>`                                                                                                                                                                                                                                                                 | inc 3 residual: web-font loading for the non-Inter fonts; brand-asset **upload** endpoint (currently URL/data-URI refs)                                                   |
| **010** i18n completion                   | **Increments 1 + 2 done**               | as before, plus: **all 13 `/ops` screens** authored end-to-end en/ar/fr (STAGE-012 pass — table headers / states / filters / hints / buttons keyed); staff sign-in + recovery localised; `I18nProvider` syncs `<html lang>`/`dir` on first mount; `field.optional` via new `UiStringsProvider`. **476 keys**, `verify:i18n` green; browser sweep 99/99 (no Latin UI leak under `ar`)                                                                                                                                | zod/validation-message map; email/notification localisation                                                                                                               |
| **011** Public site on Next.js            | **Increments 1 + 2 + SEO + 3a/3b done** | as before, plus: **the full authed customer surface on `apps/site`** — `(auth)` sign-in/register/recovery, `account/{overview,profile,drivers,payments,data}`, `trips` list + `[reference]` detail (cancel/refund, modify, rental extend, history), `checkout` (held quote → one charge → confirmation + guest CTA); browser `AuthProvider` + silent refresh; every authed segment `robots:noindex`; +152 i18n keys en/ar/fr, `verify:i18n --strict` **0 literals** in `apps/site/src`; `next build` 65 pages green | inc 3 residual: **port the customer-flow E2E specs to `apps/site`** (closes RED `verify:e2e`); `verify:seo` (Lighthouse)                                                  |
| **012** Ops dashboard UX overhaul         | **substantially done**                  | routing fixes (basename double-`/ops`, session-on-refresh, single-origin dev — DEC-026); sidebar pinned + scrollable, hidden on auth screens, "View public site" link; **grouped nav** (Operations / Catalogue / Configuration / Administration); `PageHeader` on all 13 screens; full per-page i18n (see 010); density wired (see 009)                                                                                                                                                                             | reusable `DataTable`/`FormLayout`/`DetailLayout` in `packages/ui`; command palette / breadcrumbs; a11y pass on every `/ops` screen                                        |
| **013** System‑wide QA                    | **matrix green; residuals open**        | `qa-matrix.spec` — apps/site routes + key /ops screens × {en,ar,fr} × {light,dark} × {phone,tablet,laptop} = **30/30**, **138 screenshots**; **5 bugs found + fixed** (D‑013‑1..5: hydration, next.config, contrast, overflow)                                                                                                                                                                                                                                                                                      | widen `/ops` route coverage as STAGE‑012 lands; **port the legacy customer‑flow e2e specs** to `apps/site` (`verify:e2e` red until then); `verify:seo`/`verify:perf` runs |

**Pushed:** STAGE‑008 → here across ~20 commits on `implementation`. Every commit is
`verify:static` + `verify:unit` + `verify:theme` + `verify:i18n` green (checkpoint this session:
`verify:static` ✅, `verify:unit` ✅ 72, `verify:api` ✅ 84, `verify:i18n` ✅ 476, `verify:theme` ✅;
`verify:e2e` RED pending the customer-flow spec port). Per‑stage `checkpoint.md` /
`test-evidence` / `defects.md` under `stages/STAGE-0NN-*/`.

## 9. Risk & sequencing notes

- **RAM (DEC-013, ~1.9 GB dev host).** Next.js dev/build is heavier than Vite. Mitigations:
  `next build` in the Docker `build` stage (not the constrained host); `apps/site` dev is
  opt-in; keep server components lean; ISR over SSR. If the authoring host can't run
  `next dev`, development of `apps/site` happens in the dev container (STAGE-011 wires it).
- **Auth across two origins.** Same registrable domain in prod (`/` and `/ops` behind one
  proxy) keeps the `SameSite=Lax` refresh cookie working (DEC-021). Dev: `apps/site` on `:3000`,
  `apps/web` on `:4000`, API on `:3001`, cookie `Domain` unset → per-host; documented.
- **Two token copies today.** STAGE-009 collapses them to one source in `packages/theme` +
  `packages/ui`; both apps import it. Removes the "edit both files" footgun (STAGE-007 note).
- **String extraction volume.** Largest single effort (STAGE-010). Scripted extraction +
  `sourceRevision` stale-tracking + the completeness report keep it auditable.
