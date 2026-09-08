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

## D-013-6 — `apps/site` first-load JS over budget, OPEN

- **Where:** every `apps/site` route, measured by `perf-site.mjs` against a fresh API-up
  standalone build.
- **Symptom:** first-load JS ~430 KB gz vs. the 170 KB (public) / 240 KB (interactive)
  budgets; one chunk (`chunks/145-*.js`) is ~178 KB gz. `verify:perf`'s site portion fails.
  Next's build report ("First Load JS shared 87.5 kB") undercounts — it does not attribute the
  shared chunk the root `[locale]/layout` → `Providers` pulls; the served HTML carries all 15
  scripts as non-deferred `<script src>`.
- **Not a regression:** the bloat predates STAGE-012 / the deferred-feature work — it is
  `@carrental/ui` + Radix + `lucide-react` (barrel imports) + TanStack Query + the theme engine
  in one eagerly-loaded chunk.
- **Fix (own increment):** `@next/bundle-analyzer`; per-icon `lucide-react` imports /
  `optimizePackageImports`; lazy-load client-only providers + query devtools; split
  `@carrental/ui`; re-baseline `perf-site.mjs` (its per-file `gzipSync` sum also slightly
  overstates vs. one HTTP/2 stream).
- **Status:** OPEN — tracked in the STAGE-013 checkpoint "Open finding" section.
