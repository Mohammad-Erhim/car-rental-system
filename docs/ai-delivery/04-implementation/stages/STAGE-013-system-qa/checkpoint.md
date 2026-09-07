# STAGE-013 — checkpoint

- **Status:** IN PROGRESS — the matrix is green; the residual list below (legacy e2e port,
  wider ops-route coverage) closes the stage.

## The QA matrix — `e2e/tests/qa-matrix.spec.ts` (+ `playwright.qa.config.ts`)

Every public route of `apps/site` (`/`, `/search`, `/help`, `/legal/terms`, `/legal/privacy`)
and the key `/ops` screens (`sign-in`, `config/branding`, `config/languages`) ×
`en` / `ar` / `fr` × `light` / `dark` × phone (390) / tablet (820) / laptop (1440).

Per cell:

- **screenshot** → `stages/STAGE-013-system-qa/screenshots/<app>/<route>-<locale>-<theme>.<vp>.png`
  (**138** captured: 46 × 3 viewports).
- **axe** WCAG 2.1 A + AA — **0 serious/critical**.
- **no horizontal page overflow** (`scrollWidth ≤ clientWidth + 1`).
- **no visible missing-translation marker** (`⟦key⟧` / `__MISSING__`).
- **`<html lang>` + `dir`** correct for the locale (site); `.dark` class present in dark.
- **no console errors / unhandled rejections / unexpected failed requests**
  (`attachConsoleGuards`).

Servers: `apps/api` (`:3001`), `apps/site` Next standalone (`:3000`), `apps/web` `vite preview`
(`:4000`, `base=/ops/`). Run: `pnpm --filter @carrental/e2e exec playwright test --config
playwright.qa.config.ts` (with the three servers up + `QA_REUSE_SERVER=1`).

## Result

**30 / 30 cells pass** (10 test bodies × 3 viewport projects) — after the fixes below.

## Defects found + fixed (see `defects.md`)

| id      | where                    | fix                                                                                                                                                                                                                                |
| ------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-013-1 | `apps/site` — every page | **React #418/#423 hydration** (~38/page). `@carrental/ui` `ThemeProvider` now renders `defaultTheme` on SSR + first client paint, then applies the stored preference in a mount effect.                                            |
| D-013-2 | `apps/site` build        | `next.config` `outputFileTracingRoot` → `experimental.outputFileTracingRoot` (Next 14.2 rejected the top-level key → degraded standalone tracing).                                                                                 |
| D-013-3 | `apps/site` home         | `HomeSearch` datetime-local defaults (`new Date()`) computed in a mount effect — SSR/client mismatch.                                                                                                                              |
| D-013-4 | dark theme, all apps     | `--destructive` `0 72% 51%` → `0 84% 62%` (+ dark foreground): `text-destructive` on the dark background was 3.93:1 (axe serious). Solid-button variant stays AA via the flipped foreground; `verify:theme` + 9 tests still green. |
| D-013-5 | `apps/web` `/ops` header | phone (390) horizontal overflow on the sign-in screen: left scope block → `hidden sm:flex`; language-switcher label → `hidden sm:inline`; tighter header gaps. 495 → 407 → **no overflow**.                                        |

## Residuals (tracked, not blockers)

- The **legacy customer-flow e2e specs** (`discovery`, `booking`, `account-and-i18n`,
  `auth-and-reference` customer half, `full-sweep` customer half, `smoke`, `rtl`, `responsive`)
  still target the pre-split single `apps/web` at `/` — superseded by the split (STAGE-011).
  They need porting to `apps/site` / the new `/ops` routing. `verify:e2e` is red until then;
  `qa-matrix` is the STAGE-013 evidence in the interim.
- Matrix `/ops` coverage is 3 screens — widen to all 15 as STAGE-012 reworks them.
- `apps/site` authed flows (auth/account/trips/checkout) — STAGE-011 increment 3.
- `verify:seo` (Lighthouse) — STAGE-011 increment 3.
- `og-default.png` — referenced by OG meta, not yet generated.

## Verified

`qa-matrix` 30/30 · `verify:static` PASS · `verify:unit` 72 · `verify:theme` 9 · `verify:i18n`
OK · `apps/web` + `apps/site` builds OK.
