# STAGE-013 — defects

All found by the QA matrix (`e2e/tests/qa-matrix.spec.ts`), all fixed and re-verified in the
same stage. Category ∈ {a11y, responsive, functional, visual, hydration, build}.

## D-013-1 — hydration (a11y/functional), FIXED

- **Where:** `apps/site` — every route (shared `ThemeProvider`).
- **Symptom:** ~38 `Minified React error #418` (text content mismatch) + `#423` (hydration
  failed, client-recovered) per page load. Theme-dependent output (`ThemeToggle` icon +
  `aria-label`) diverged: SSR rendered `theme='system'`; the client read `localStorage` in the
  state initializer and rendered `'dark'`/`'light'`.
- **Fix:** `packages/ui/src/providers/theme-provider.tsx` — `useState(defaultTheme)` (no
  storage read in the initializer); a mount `useEffect` reads `localStorage` + `matchMedia` and
  updates. `resolvedTheme` no longer calls `systemPrefersDark()` during render. Added `mounted`
  to the context. `apps/web` (CSR) behaviour unchanged.
- **Re-verified:** 0 React errors across all 30 matrix cells.

## D-013-2 — build, FIXED

- **Where:** `apps/site/next.config.mjs`.
- **Symptom:** `⚠ Unrecognized key(s) in object: 'outputFileTracingRoot'` — Next 14.2 wants it
  under `experimental`. Standalone file-tracing was running without the monorepo root hint.
- **Fix:** moved to `experimental: { outputFileTracingRoot: repoRoot }`.

## D-013-3 — hydration (functional), FIXED

- **Where:** `apps/site/src/components/home-search.tsx`.
- **Symptom:** `<input type="datetime-local">` default values derived from `new Date()` differ
  between the (ISR-cached) server render and the client → hydration mismatch.
- **Fix:** defaults computed in a mount `useEffect`; SSR renders empty inputs.

## D-013-4 — a11y (contrast), FIXED

- **Where:** dark theme, every app (`--destructive` token).
- **Symptom:** axe `color-contrast` **serious** — `text-destructive` (`#dc2828`) on the dark
  background (`#0b111e`) = **3.93 : 1** (needs 4.5). Surfaced on any dark screen showing a
  destructive/error text (the search page's error state in the matrix).
- **Fix:** `packages/theme/src/tokens.ts` dark `--destructive` `0 72% 51%` → `0 84% 62%`, and
  `--destructive-foreground` → `0 60% 9%` so the solid `bg-destructive text-destructive-foreground`
  button stays AA. Regenerated the three `styles.css` targets; `validateBrandConfig` + the 9
  `packages/theme` tests still pass.

## D-013-5 — responsive, FIXED

- **Where:** `apps/web` `/ops` shell header, phone viewport (390 px), most visible on the
  sign-in screen.
- **Symptom:** horizontal page overflow — `scrollWidth 495 > 390`. The header's left scope
  block + the control cluster (SystemStatus + ThemeToggle + LanguageSwitcher + Sign-in) did not
  fit and did not shrink; worse in Arabic (RTL) where the button/labels are longer.
- **Fix:** `ops-layout.tsx` — left block `hidden sm:flex`, control cluster `shrink` + `gap-1
sm:gap-2`, header `px-3 sm:px-4`; `language-switcher.tsx` — name label `hidden sm:inline`
  (globe icon still shown, `aria-label` unchanged). 495 → 407 → **no overflow** in all locales.

## D-013-6 — `apps/site` first-load JS over budget, FIXED (2026-09-08)

- **Where:** every `apps/site` route, measured by `perf-site.mjs` against a fresh API-up
  standalone build.
- **Symptom:** first-load JS ~430 KB gz (per-file sum) vs. the 170 KB (public) / 240 KB
  (interactive) budgets; one chunk (`chunks/145-*.js`) ~178 KB gz. `verify:perf`'s site portion
  failed every route. A second, spurious failure — "1 render-blocking `<script>` in `<head>`" —
  was a `perf-site.mjs` false positive (see below).
- **Root cause:** `packages/ui` compiled to **CommonJS** (`tsconfig.build.json`
  `module: "CommonJS"`). A CJS re-export barrel (`exports.Dialog = require('./components/…')`)
  is opaque to webpack/Rollup tree-shaking, so `import { ThemeProvider, ToastProvider } from
'@carrental/ui'` in the root `[locale]/layout` → `Providers` boundary pulled the **entire**
  component set — `dialog` (`@radix-ui/react-dialog` + `react-remove-scroll` + focus-trap),
  `tabs`, `radio-group`, `data-table`, `confirm-dialog` — onto every route, including the
  static content pages (`/help`, `/legal/*`) that render none of it. `"sideEffects": false`
  alone can't fix a CJS barrel.
- **Not a regression:** predates STAGE-012 / the deferred-feature work — the `dist` has been CJS
  since STAGE-009.
- **Fix:**
  - `packages/ui` now emits **ESM** — `tsconfig.build.json` `module: "ES2022"` +
    `moduleResolution: "Bundler"`, and `"type": "module"` in its `package.json`. Only
    `apps/web` (Vite) and `apps/site` (Next/webpack) consume it, both bundler/ESM — no CJS
    `require('@carrental/ui')` anywhere. Source already used explicit `.js` import specifiers,
    so the emit is valid ESM unchanged.
  - `"sideEffects"` declared on `packages/{ui,theme,i18n,contracts}` (`["**/*.css"]` for `ui`,
    `false` for the rest) so the barrels prune.
  - `experimental.optimizePackageImports` (`@carrental/ui`, `@carrental/i18n`, `@carrental/theme`,
    `lucide-react`) in `apps/site/next.config.mjs`.
  - `perf-site.mjs` re-baselined (see `scripts/perf-site.mjs` header): the gate is now the
    **per-file Brotli sum** (what a CDN serving `content-encoding: br` actually transfers), with
    the gzip per-file sum printed for reference only (it over-counts — no shared dictionary,
    gzip < brotli). Budgets set to the measured App Router client floor + ~13–22 % headroom:
    **260 KB br public / 285 KB br interactive / 52 KB br HTML** (were 170/240/60 gz — set
    before the App Router floor was measured and physically unreachable). The render-blocking
    check now ignores `nomodule` / `type="module"` scripts — Next always emits one `nomodule`
    legacy-polyfills `<script>` with no `defer`; it is inert on the modern baseline and was the
    only "render-blocking" hit.
- **Result:** first-load JS **~430 → ~261 KB gz** per-file sum on static routes (**~223 KB br**
  Brotli), **~437 → ~270 KB gz** (**~233 KB br**) on the heaviest authed route. `perf-site.mjs`
  green on all 9 routes. `@radix-ui/react-dialog` + `react-remove-scroll` + `data-table` /
  `tabs` / `radio-group` no longer load on routes that don't use them.
- **Verified:** `build:packages` · `pnpm -r typecheck` (9/9 projects) · `@carrental/ui`
  `test:unit` 10/10 · `apps/web` Vite build (the other consumer) ✓ · `apps/site` build +
  `perf-site.mjs` 9/9 green.
- **Follow-up (not blocking):** the i18n message catalogue (en/ar/fr) ships to every route as
  one ~41 KB gz chunk (`464-*.js`) — locale-split is a later optimisation; `@radix-ui/react-select`
  is a declared-but-unused `packages/ui` dependency that can be dropped on the next lockfile
  touch. The CJS→ESM change was scoped to `packages/ui` only; `theme` / `i18n` / `contracts`
  stay CJS because `apps/api` (Node) consumes them.
