# STAGE-009 — checkpoint

- **Status:** IN PROGRESS.
- **Increment 1 (done, 2026-09-07):** the token engine + light/dark foundation.
- **Increment 2 (next):** API `branding` config-version kind + `GET /meta/branding` + brand-asset
  upload + `/ops/config/branding` dashboard UI + system seed.
- **Increment 3 (next):** apply the brand overlay across `apps/web` surfaces; density; wire into
  `apps/site` when it exists (STAGE-011).

## Completed — increment 1

### `packages/theme` (new shared package)

- `tokens.ts` — the token catalogue: `COLOR_TOKENS` (23 shadcn HSL vars), `DEFAULT_LIGHT` /
  `DEFAULT_DARK` (byte-for-byte the pre-STAGE-009 values, **one** exception: dark `--destructive`
  nudged `0 63% 55%`→`0 72% 51%` — white-on-solid was 4.43:1, just under AA), `RADII`,
  `DENSITIES`, `FONTS` (curated set incl. Arabic faces).
- `contrast.ts` — WCAG relative-luminance + `contrastRatio` working on `"H S% L%"` triples.
- `schema.ts` — `brandConfigSchema` (colors light+dark, radius, density, font, assets) +
  `DEFAULT_BRAND_CONFIG` + `validateBrandConfig` (12 contrast rules × 2 modes → `[]` = safe).
- `resolve.ts` — `resolveCssVars(config, mode)`, `brandConfigToCss(config)` (`:root` + `.dark`
  diff), `brandConfigToVarMaps`.
- `presets.ts` — 4 curated presets (`slate-blue` default, `emerald`, `violet`, `amber`), each
  AA-clean in both modes (asserted).
- `scripts/gen-tokens-css.mjs` — writes the default token block into the two `styles.css` files
  between `/* @carrental/theme:start … end */` markers; `--check` mode powers `verify:theme`.
- `theme.test.ts` — 9 tests (contrast maths, all presets AA, resolve/serialise).

### Token unification

- `packages/ui/src/styles.css` and `apps/web/src/index.css` no longer hand-maintain the token
  block — it's generated from `packages/theme` and drift-checked. The "keep the two copies in
  sync by hand" footgun (STAGE-007 note) is gone.
- `--font-sans` added as a token; `body` + both Tailwind configs now read `var(--font-sans)`.

### Light / dark + brand overlay

- `@carrental/ui` `ThemeProvider` extended: optional `brand?: BrandConfig` → injects
  `<style id="carrental-brand-tokens">`, sets `data-density`, caches config + rendered CSS to
  `localStorage` (`carrental.brand.v1` / `carrental.brand.css.v1`). `applyBrandTokens()` exported.
- New `@carrental/ui` `ThemeToggle` — Light/Dark/System menu, a11y (`aria-label`, menu items),
  localisable `labels` prop.
- `apps/web/index.html` — pre-paint head script applies the saved theme class + cached brand
  CSS + density before first render (no FOUC).
- `ThemeToggle` wired into the customer **and** ops layout headers; `theme.*` i18n keys added to
  `en` / `ar` / `fr`.
- `apps/web/vite.config.ts` — `@carrental/theme` aliased to source, matching the other packages.

### Build / infra

- Root `build:packages`, `verify:unit`, new `verify:theme` include `@carrental/theme`.
- `deploy/Dockerfile.{api,web}` — copy `packages/theme/package.json`, build `@carrental/theme`
  first. `compose.yaml` — `nm_theme` + `dist_theme` volumes; `deps` one-shot cleans
  `packages/theme/dist`.

## Verified — increment 1

`verify:static` PASS (lint + typecheck incl. `packages/theme` + prettier + openapi + drift) ·
`verify:unit` **72** (theme **9** new) · `verify:api` **68** · `verify:theme` PASS (css in sync,
9 tests, 0 literal colours) · `apps/web` production build OK (+~2 KB gz) · `compose.yaml` /
`compose.prod.yaml` config valid.

## Not done yet (this stage)

Branding/theme **dashboard UI** + the API that backs it (increment 2); applying the brand
overlay + density to every `apps/web` surface and (later) `apps/site` (increment 3);
before/after screenshots in light + dark + 2 presets (with increment 3).
