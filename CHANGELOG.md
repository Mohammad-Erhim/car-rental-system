# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project is
pre-1.0 and versions track the delivery stages in `docs/ai-delivery/04-implementation/`.

## [Unreleased]

### STAGE-012 — Ops dashboard UX · fix pass (2026-09-07)

Reported issues: dashboard navigation double-prefixed `/ops`, the public site was
unreachable from the dashboard, the sign-in screen showed an empty sidebar, the sidebar
did not fit the viewport, and the staff session was dropped on a page refresh. All fixed
and verified in a browser (40/40 route + session checks, 9/9 responsive-evidence checks).

**Fixed**

- **Navigation** — the ops router runs with `basename: '/ops'`, but `ops-layout` nav
  targets and two post-auth redirects still included the `/ops` prefix, so every click
  resolved to `/ops/ops/…` (a 404 caught by the SPA). Nav `to` values and
  `sign-in` / `recovery` redirects are now basename-relative.
- **Session lost on refresh** — the dashboard dev server moved to `:3100`; the API's CSRF
  guard rejected `POST /auth/refresh` from that origin (not in `CORS_ALLOWED_ORIGINS`),
  which cleared the session on boot. `http://localhost:3100` is now an allowed dev origin,
  and the primary dev flow is single-origin (below) where this cannot happen.
- **Sign-in shows an empty sidebar** — the shell `<aside>` rendered for unauthenticated
  routes. It now renders only for an authenticated staff session; sign-in / recovery are a
  bare centred card.
- **Sidebar overflow** — the sidebar is `sticky top-0 h-screen`; the nav list scrolls
  (`overflow-y-auto`) while the brand header and the new footer link stay pinned.

**Added**

- **"View public site" link** — in the sidebar footer, the header (≥sm), and the mobile
  nav strip. Points at `VITE_SITE_URL` (default `/`).
- **Single-origin local dev** — `apps/site` (`:3000`) is the one origin; it proxies
  `/ops` → `apps/web` (`:3100`) and `/api` → the API, mirroring the prod edge, so the
  `SameSite=Lax` refresh cookie stays first-party (DEC-021, DEC-026). `pnpm dev` now runs
  the API, dashboard, and site together; `pnpm dev:ops` keeps the API-plus-dashboard-only
  flow. `Dockerfile.site` gains `ARG WEB_UPSTREAM` (build-time; the prod image builds with
  the proxy off — the edge owns `/ops`).

### STAGE-009 — Design system, theming & branding · increment 2 (2026-09-07)

Dashboard-managed branding, end to end.

**Added**

- `GET /api/v1/meta/branding` — public, cacheable (`ETag` + `Cache-Control`), returns the
  published brand config or the built-in default (revision 0).
- `branding` config-version kind — rides the existing draft → submit → approve (author ≠
  approver) + audit + `config.version.published.v1` workflow; validates structure + WCAG AA +
  `https://`-only asset refs; `preview` returns an AA-cleanliness summary.
- `/ops/config/branding` dashboard editor — preset picker, per-mode colour editor (colour input
  ↔ HSL triple, auto AA-safe foregrounds), radius / density / font, asset URLs, live preview,
  contrast readout, version list with submit/approve. New `Palette` nav entry.
- `apps/web` applies the published config on boot via `BrandedThemeProvider` → `ThemeProvider`;
  re-themes on publish with no reload.
- `zBrandingResponse` contract; `hexToHslTriple` / `hslTripleToHex` in `@carrental/theme`;
  `ops.branding.*` i18n keys (en / ar / fr); `apps/api/test/branding.spec.ts` (6).

**Verified** — `verify:static` PASS · `branding.spec` 6 · `meta`/`config-lookup`/`report`
regression green · `verify:unit` 72 · `verify:theme` PASS · `apps/web` build OK.

### STAGE-009 — Design system, theming & branding · increment 1 (2026-09-07)

Theming foundation. No user-visible behaviour removed; adds a light/dark switch and the
plumbing for dashboard-managed branding.

**Added**

- `@carrental/theme` — shared package: the design-token catalogue (23 shadcn HSL vars, light +
  dark), `brandConfigSchema` + `DEFAULT_BRAND_CONFIG`, WCAG `contrastRatio` + `validateBrandConfig`,
  `resolveCssVars` / `brandConfigToCss`, 4 curated presets (`slate-blue`, `emerald`, `violet`,
  `amber` — all AA-clean in both modes), and a generator that keeps the two `styles.css` copies
  in sync from one source (drift-checked by `verify:theme`). 9 unit tests.
- `@carrental/ui` `ThemeToggle` — Light / Dark / System menu (a11y, localisable), wired into the
  customer and ops layout headers.
- `ThemeProvider` now accepts a `brand` config and injects it as a `<style>` overlay + caches it;
  `apps/web/index.html` applies theme + cached brand tokens pre-paint (no FOUC).
- `verify:theme` gate (token-CSS in sync, presets AA, no literal colours in component TS/TSX).
- `theme.*` i18n keys in `en` / `ar` / `fr`.

**Changed**

- The design-token block in `packages/ui/src/styles.css` and `apps/web/src/index.css` is now
  **generated** from `@carrental/theme` — ends the "keep the two copies in sync by hand" footgun.
- `--font-sans` is a token; `body` and both Tailwind configs read `var(--font-sans)`.
- Dark `--destructive` `0 63% 55%` → `0 72% 51%` (white-on-solid was 4.43:1 — just under AA).
- `deploy/Dockerfile.{api,web}` + `compose.yaml` include `@carrental/theme` (COPY, build order,
  `nm_theme` / `dist_theme` volumes).

**Verified** — `verify:static` PASS · `verify:unit` 72 · `verify:api` 68 · `verify:theme` PASS ·
`apps/web` build OK · compose configs valid.

### STAGE-010 — Internationalization completion · increment 1 (2026-09-07)

The i18n gate + Languages admin. Bulk string extraction follows in increment 2.

**Added**

- `verify:i18n` gate (`scripts/verify-i18n.mjs`) — completeness + empty/placeholder + ICU
  placeholder parity for every active locale (en / ar / fr); `--strict` also flags un-i18n'd
  literals in the app surfaces. Added to `verify:all`.
- `/ops/config/languages` — add a language, activate / deactivate, set the default, see
  per-locale translation coverage, jump to the catalogue. `GET /api/v1/config/locales` +
  `POST /config/locales` + `/:code/{activate,deactivate,default}` (`config.publish`).
- `apps/api/test/locale-admin.spec.ts` (4).

**Changed**

- **DEC-024** — `en` / `ar` / `fr` promoted to production launch locales (`testOnly: false` in
  `packages/i18n` config + the `system` seed; `meta.spec` assertion flipped). Closes the
  DEC-020 open question.
- `openapi.json` regenerated (locale routes); `check:drift` OK.

**Verified** — `verify:static` PASS · `verify:i18n` OK · `verify:theme` PASS · `verify:unit`
72 · api `locale-admin` 4 + `meta`/`config-lookup`/`branding` regression green · `apps/web`
build OK.

### STAGE-011 — Public site on Next.js · increment 1 (2026-09-07)

`apps/site` — the customer-facing product on Next.js (DEC-023).

**Added**

- `apps/site` (Next.js 14 App Router, TS strict, standalone output): `/[locale]/` routing for
  en/ar/fr with locale-negotiation middleware and `<html lang dir>` (full RTL for Arabic);
  home, search (SSR availability), vehicle detail (SSG per category + ISR), help, legal.
- Full technical SEO: per-route Metadata (title / canonical / hreflang `+ x-default` / OG /
  Twitter), `sitemap.ts` (localised, `xhtml:link` alternates), `robots.ts`, `AutoRental` +
  `Product` JSON-LD. First-load JS ≤ 123 KB.
- Server-side i18n (`getT` / `getMessages` = bundled base + published catalogue overrides),
  brand overlay inlined in `<head>` (SSR, no FOUC) from `/meta/branding`, theme + language
  switch in the header. 37 `site.*` keys in en/ar/fr; `verify:i18n --strict` = 0 literals in
  `apps/site/src`.
- `deploy/Dockerfile.site` (Next standalone runtime, non-root, `tini`, healthcheck); `site`
  service in `compose.prod.yaml` (`:3000`) and `compose.yaml` (behind the `site` profile).
  `packages/theme` token generator now also targets `apps/site/src/app/globals.css`.

**Changed**

- `compose.*` — `web` moved to `:3100`; edge-proxy consolidation (one origin for site + web +
  api) is STAGE-011 increment 2.

**Verified** — `next build` OK (peak ~870 MB RSS, 35 static pages); `next start` HTTP checks
(redirect, RTL, per-locale titles, canonical + hreflang, OG, JSON-LD, robots, sitemap, API
proxy); `docker build` OK (368 MB) + container run; `verify:static` PASS (now covers
`apps/site`); `verify:i18n` OK.

### STAGE-013 — System-wide QA matrix (2026-09-07)

**Added**

- `e2e/tests/qa-matrix.spec.ts` + `e2e/playwright.qa.config.ts` — every `apps/site` public
  route + key `/ops` screens × {en, ar, fr} × {light, dark} × {phone, tablet, laptop}. Each
  cell: screenshot, axe (0 serious/critical), no h-overflow, no missing-translation marker,
  `<html lang/dir>`, no console/network errors. **30/30 cells pass**; **138 screenshots** under
  `stages/STAGE-013-system-qa/screenshots/`.

**Fixed** (found by the matrix — see `stages/STAGE-013-system-qa/defects.md`)

- **D-013-1** `@carrental/ui` `ThemeProvider` — SSR-safe first render (was ~38 React
  #418/#423 hydration errors per `apps/site` page).
- **D-013-2** `apps/site/next.config` `outputFileTracingRoot` → `experimental.*`.
- **D-013-3** `HomeSearch` datetime defaults computed after mount (SSR/client mismatch).
- **D-013-4** dark `--destructive` `0 72% 51%` → `0 84% 62%` (+ dark foreground) — `text-destructive`
  on the dark background was 3.93:1 (axe serious).
- **D-013-5** `apps/web` `/ops` header — phone (390 px) horizontal overflow on the sign-in
  screen, worst in Arabic; responsive collapse of the scope block + language label.

**Verified** — `qa-matrix` 30/30 · `verify:static` PASS · `verify:unit` 72 · `verify:theme` 9
· `verify:i18n` OK · `apps/web` + `apps/site` builds OK.

### Enhancement program — STAGE-009 … STAGE-013 (planned 2026-09-07)

Master plan documented in `docs/ai-delivery/04-implementation/enhancement-program.md`;
per-stage plans in `stages/STAGE-009…013-*/plan.md`. Locked decisions: **DEC-023** public
site on Next.js (`apps/site`; `apps/web` → `/ops` only), **DEC-024** launch locales en + ar +
fr (all fully translated), **DEC-025** curated dashboard theming + branding versioned via the
config workflow. Scope: professional UI/UX for both surfaces; system-wide light/dark +
customizable theming + branding assets; complete i18n across every element with dynamic
locale/translation management; Next.js public site with full technical SEO; ops dashboard UX
overhaul; system-wide QA matrix (routes × 3 locales × 2 themes × 3 viewports) with a
fix-until-clean loop. New gates: `verify:i18n`, `verify:theme`, `verify:seo`; widened
`verify:e2e|a11y|perf`. _No implementation in this entry — plan only._

### STAGE-008 — Containerization & local-run parity (2026-09-07)

Docker is now a fully working, tested way to run every stage of the system, and the no-Docker
native path (DEC-013) is retained and retested. Two co-equal local workflows plus a
production-shaped stack. No application or feature behaviour changed.

**Added**

- `compose.yaml` (repo root) — containerised **development** stack: PostgreSQL 16 + Redis 7
  (healthchecked, ports overridable via `DEV_DB_PORT` / `DEV_REDIS_PORT`), `deps` + `migrate`
  one-shots, and `api` + `worker` + `web` with the repo bind-mounted and hot reload (API
  `node --watch`, web Vite HMR).
- `compose.prod.yaml` (repo root) — production-shaped stack. `migrate` (+ seed **system**) runs
  automatically on `up` and `api`/`worker` wait for it, so a bare `docker compose -f
  compose.prod.yaml up -d` boots to a working system; `seed-dev` stays behind the `tools`
  profile.
- `deploy/postgres-init.sql` — first-boot creation of `carrental_test` next to the primary DB.
- `deploy/Dockerfile.api` — `dev` target (bind-mount, hot reload) alongside the `runtime`
  target; `ARG GIT_SHA` / `ARG BUILD_TIME` baked into `ENV` for `GET /health/version`.
- `deploy/Dockerfile.web` — `dev` target (Vite dev server) alongside the nginx `runtime`.
- `CHANGELOG.md` (this file); `docs/ai-delivery/04-implementation/stages/STAGE-008-containerization/`.
- Docker quick-start in `README.md`; container-run sections in `deploy/RUNBOOK.md`.

**Changed**

- `deploy/Dockerfile.api`: `pnpm --prod --legacy deploy` → `pnpm --prod deploy` (`--legacy` is
  pnpm 10+; the project is on pnpm 9.15). Runtime images are multi-stage, non-root (`node`),
  `tini` as PID 1, with `/health/ready` / static healthchecks.
- `compose.prod.yaml`: `worker` healthcheck is a Redis ping (it has no HTTP surface and was
  inheriting the API `/health/ready` probe); `json-file` log rotation (10 MB × 3) on
  long-running services; compose `init: true` removed for image services (the image already
  runs `tini`) — clears the "Tini is not running as PID 1" warning.
- `apps/web/vite.config.ts`: dev/preview proxy target from `VITE_PROXY_TARGET`
  (default `http://localhost:3001`); `VITE_USE_POLLING` opt-in; `host: true`. One config now
  serves native dev and the container; unset vars = previous behaviour.
- `scripts/dev-up.sh` / `dev-down.sh`: detect a **reachable** Docker daemon (`docker info`),
  not just the CLI, so a host with Docker installed but no socket permission cleanly falls
  through to the native services. `DEV_UP_FORCE_NATIVE=1` forces the native branch.
- `.dockerignore`: build context trimmed (`docs/`, `prompts/`, root spec `*.md`, `e2e/tests`,
  `*.tsbuildinfo`, Playwright output).
- `deploy/RUNBOOK.md`, traceability matrix, current-state: `deploy/docker-compose.yml` →
  `compose.prod.yaml`; SRS §17.6 deploy row moved from "build-checked" to "live-verified".

**Fixed**

- **D-008-1** — dev-stack `migrate` failed with `Cannot find module
  '@carrental/i18n/dist/index.js'`. A host-side `tsconfig.build.tsbuildinfo` bind-mounted into
  the container made incremental `tsc` skip emit, leaving the fresh `dist_*` volume without its
  `.js`. The `deps` one-shot now clears `packages/{contracts,i18n,ui}/dist/*` and
  `packages/**/*.tsbuildinfo` before `pnpm build:packages`. Production images were unaffected
  (`.dockerignore` already strips `*.tsbuildinfo`).

**Removed**

- `deploy/docker-compose.yml` — superseded by `compose.yaml` (dev) + `compose.prod.yaml` (prod)
  at the repo root, where Compose can read the repo-root `.env`.

**Verified** — dev + prod images build; both stacks `up` healthy; SPA + `/api` + `/health`
proxy + SPA deep-link + sign-in pass; `verify:static | unit (63) | api (68) | migrate (4)`
green inside the dev container network; native path retested green (`verify:api` 68 + boot
smoke). Evidence:
`docs/ai-delivery/04-implementation/stages/STAGE-008-containerization/test-evidence.md`.

---

## [STAGE-000 .. STAGE-007] — 2026-09-07

Initial build of the Car Rental System for the approved scope (full system minus the APP-CMOB
mobile frontend; its REST/OpenAPI contract is built and served). Customer Web (APP-CWEB),
Operations & Admin Dashboard (APP-OPS), NestJS API + worker, PostgreSQL 16 + Drizzle, Redis 7 +
BullMQ. See `docs/ai-delivery/04-implementation/` — `session-log.md`, `traceability-matrix.md`,
and `stages/STAGE-00{0..7}-*/` — for the per-stage record.

- **STAGE-000** repository & local platform · **STAGE-001** shared identity, config, reference
  data, UI foundation · **STAGE-002** discovery & quote · **STAGE-003** booking & payment ·
  **STAGE-004** reservation operations · **STAGE-005** rental lifecycle · **STAGE-006**
  administration & reporting · **STAGE-007** release hardening (security, a11y, performance,
  backup/restore, deploy artifacts, full responsive/locale sweep).
