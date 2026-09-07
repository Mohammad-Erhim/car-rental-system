# STAGE-009 — checkpoint

- **Status:** IN PROGRESS.
- **Increment 1 (done, 2026-09-07):** the token engine + light/dark foundation.
- **Increment 2 (done, 2026-09-07):** the branding API + dashboard editor + live overlay.
- **Increment 3 (next):** density applied to `packages/ui` control sizes; brand fonts loaded
  (`next/font` / `@font-face`); apply to `apps/site` when it exists (STAGE-011);
  before/after screenshots (light + dark + 2 presets) — folded into STAGE-013.

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

## Completed — increment 2

### API — branding config + public endpoint

- `packages/contracts` depends on `@carrental/theme`; new `zBrandingResponse` (`config` +
  `revision` + `updatedAt`) in `meta.ts`.
- `config-version.service.ts` — `branding` `kind` in `validate()` (zod structure + WCAG AA via
  `validateBrandConfig` + `https://`-only asset refs, `data:` allowed for favicon) and in
  `preview()` (returns `aaClean` + a human summary). `report.controller.ts` `zDraft` kind enum
  gains `branding`. The whole draft→submit→approve (author≠approver) + audit + outbox
  `config.version.published.v1` flow is reused as-is.
- `GET /api/v1/meta/branding` — **public**, `Cache-Control: public, max-age=60,
stale-while-revalidate=300`, custom `ETag` (`"brand-<rev>-<hash>"`). Falls back to the
  built-in default (revision 0) when nothing is published. `MetaModule` imports `ConfigModule`.
- `apps/api` deps `@carrental/theme`; `openapi.json` regenerated (88 paths); `check:drift` OK.

### API — tests (`apps/api/test/branding.spec.ts`, 6)

Default response + ETag; draft → submit → different reviewer approves → served publicly with the
new colours/radius/wordmark; sub-AA foreground/background pair rejected (422 `contrast_below_*`);
non-`https` asset rejected; `preview` reports AA cleanliness; a `rental_agent` (no
`config.publish`) is 403.

### Web — dashboard editor (`/ops/config/branding`)

- `surfaces/ops/branding-page.tsx` — preset picker (the 4 `@carrental/theme` presets), per-mode
  colour editor (native colour input ↔ HSL-triple, 11 curated tokens; `*Foreground` auto-set to
  the AA-readable black/white), radius / density / font selects, asset URL fields, a live
  preview panel driven by the draft's CSS vars, a WCAG readout, `Save draft`, `Check contrast`,
  and an inline version list with submit / approve.
- `lib/branding-hooks.ts` — `usePublishedBranding` / `useBrandingVersions` / `useDraftBranding`
  / `useBrandingPreview` / `useBrandingTransition`.
- `@carrental/theme` — `hexToHslTriple` / `hslTripleToHex` for the colour inputs.
- Route + `Palette` nav entry (`config.read`/`config.publish`); `theme.*`… → `ops.branding.*`
  (21 keys) in `en` / `ar` / `fr`.

### Web — live application

- `app/providers.tsx` — `BrandedThemeProvider` fetches `GET /meta/branding` and feeds
  `ThemeProvider brand={…}`; the overlay `<style>` + `data-density` update on publish (the
  transition mutation invalidates the `['meta','branding']` query).

### Verified — increment 2

`verify:static` PASS (lint 0/0 after `--fix`, typecheck, prettier, openapi + drift) ·
`branding.spec.ts` **6** · `meta.spec.ts` 6 · `config-lookup.spec.ts` 5 · `report.spec.ts` 7
(no regression) · `verify:unit` **72** · `verify:theme` PASS · `apps/web` build OK (424 KB /
117 KB gz) · native smoke: `GET /meta/branding` → 200, revision 0, correct `Cache-Control` +
`ETag`.

## Increment 3 (done, 2026-09-07)

- **Density** → real control-size changes: `--control-h`/`-sm`/`-px` flip on
  `[data-density='compact']`, `Button`/`Input` read them (44 → 38 px).
- **Brand-asset upload** — `common/object-storage/` fs `ObjectStorageService` (content under
  `OBJECT_STORAGE_FS_ROOT`, `stored_object` row, HMAC-signed `/api/v1/assets/:key` reads) +
  `image.util.ts` (magic-byte sniff, PNG/JPEG/WebP/ICO dimension readers, allowlist SVG
  sanitiser). `POST /api/v1/config/branding/assets` (`config.publish`, base64 body):
  sniff-vs-declared check, per-purpose byte + dimension caps, SVG sanitised pre-storage →
  `{ ref: "obj:<key>", url, width, height }`. `GET /api/v1/assets/*` public + signed (locked
  CSP for SVG). `meta/branding` resolves `obj:` refs → signed URLs; config-version validation
  accepts `obj:` alongside `https://`. Body limit 100 KB → 3 MB. Editor: a file `<input>` per
  asset (logo/logoDark/favicon/ogImage). `test/brand-asset.spec.ts` **8** (`api test:api` 92).
- **Self-hosted web fonts** — `apps/site/src/lib/fonts.ts` uses `next/font/google` for Inter,
  IBM Plex Sans (+ IBM Plex Sans Arabic), Cairo, Tajawal — built into `.next/static/media`
  (38 woff2), `font-display: swap`, no runtime Google request. `packages/theme` `--font-sans`
  is now `var(--font-brand, <primary>), <fallbacks>`; `[locale]/layout` sets `--font-brand`
  via `fontClassName(branding.config.font)`. Token CSS regenerated; `verify:theme` green.

STAGE-009 has **no open residual**. The light/dark × preset screenshot set rolls into STAGE-013.
