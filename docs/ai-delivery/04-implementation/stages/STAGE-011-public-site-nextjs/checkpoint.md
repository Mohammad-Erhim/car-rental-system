# STAGE-011 — checkpoint

- **Status:** IN PROGRESS (increment 3 underway).
- **Increment 1 (done, 2026-09-07):** `apps/site` scaffold + home / search / vehicle-detail /
  help / legal, full technical SEO, `/[locale]/` i18n routing (en/ar/fr + RTL), brand overlay,
  Docker image + compose wiring. Builds + runs verified.
- **Increment 2 core (done, 2026-09-07):** `apps/web` reduced to `/ops` only (router `basename`,
  Vite `base: /ops/`, customer surface deleted) + a single **edge** nginx proxy (`/`→site,
  `/ops`→web, `/api`+`/health`→api). Full prod-stack edge integration verified.
- **Increment 2b — SEO panel (done, 2026-09-07):** `/ops/config/seo` + `seo` config kind +
  `GET /meta/seo` + `og-default.png` (see the STAGE-011 SEO CHANGELOG entry).
- **Increment 3a — auth surface (done, 2026-09-07):** `apps/site` `sign-in` / `register` /
  `recovery` under a `(auth)` route group (`robots:noindex`); `lib/api-client.ts` (browser
  token + silent refresh), `lib/auth-context.tsx` (`AuthProvider`, customer audience),
  `lib/{use-form-errors,return-to,nav}.ts`, `lib/customer-hooks.ts`; `RequireAuth` guard;
  auth-aware `SiteHeader`. next build green (SSG en/fr/ar).
- **Increment 3b — account / trips / checkout (done, 2026-09-07):** `account/` (overview,
  profile, drivers, payments, data — server layout `RequireAuth` + `AccountShell` +
  `robots:noindex`), `trips/` (list + `[reference]` detail: cancel/refund, modify, rental
  extend, history), `checkout/` (held-quote review, one charge, confirmation + guest CTA).
  Full en/ar/fr; `verify:i18n` 638 + `--strict` reports **0** literals in `apps/site/src`.
  `pnpm -r typecheck` green; next build green (65 static pages, `trips/[reference]` dynamic).
- **Increment 3c — `verify:seo` (done, 2026-09-07):** `scripts/verify-seo.{mjs,sh}` — per
  indexable route × {en,ar,fr}: unique title/description, self-consistent canonical, reciprocal
  hreflang, `<html lang/dir>`, OG + `twitter:card`, parseable JSON-LD; + `robots.txt` /
  `sitemap.xml` validity + coverage + `noindex` on the private routes. In `verify:all`. Green.
- **Increment 3d — E2E port (in progress, 2026-09-08):** `playwright.config.ts` reworked to the
  single-origin model — `apps/site` (`start:standalone`, :3000) is the browser origin; it
  proxies `/ops` → `apps/web` (`vite preview`, :3100) and `/api` → the API (:3001). `verify:e2e`
  now also builds `apps/site` and `db:reset`s first. `apps/site` gained the E2E contract the
  specs rely on: `search-*` / `result-*` testids on the search island + results, a client
  `VehicleReserve` island (`detail-total`, `reserve-button` → checkout), a `/[locale]/vehicle/*`
  → `/vehicles/*` redirect, per-page `<h1>`s on the account sub-pages, `<title>` via per-route
  layouts on every noindex segment, a `[locale]/[...notFound]` localised soft-404 (Next 14
  mis-renders `not-found.tsx` from a dynamic segment under `output: standalone`), bottom-nav at
  the `lg` breakpoint. Ops nav group-label contrast fixed (`text-muted-foreground/70` → full).
  New public `GET /api/v1/meta/translations` (published overlay, no auth) — the site was hitting
  the staff-gated `/config/translations` and always falling back. Translation catalogue gains a
  filter + 50-row cap (650 keys made the page's full-page screenshot time out).
  **Laptop project: green** (a handful of hydration-race + shared-fixture flakes hardened);
  full phone/tablet sweep next.

## Completed — increment 1

### `apps/site` (new — Next.js 14 App Router, TS strict, DEC-023)

- `next.config.mjs` — `output: 'standalone'`, `outputFileTracingRoot` = repo root,
  `transpilePackages` for the workspace UI/theme/i18n/contracts, `/api` + `/health` rewrites to
  the API (same-origin in the browser, DEC-021), `poweredByHeader: false`.
- `middleware.ts` — locale negotiation (cookie → `Accept-Language` → default) and redirect of
  any non-`/[locale]/…` path; sets the `carrental.locale` cookie.
- `src/lib/` — `api.ts` (server `apiGet`/`apiPost` with ISR `revalidate`), `i18n.ts`
  (`getMessages` = bundled base + published catalogue overrides, `getT` server translator,
  `ACTIVE_LOCALES`), `branding.ts` (`getBranding` → `/meta/branding`, `brandingCss`),
  `seo.ts` (`buildMetadata` — title, canonical, hreflang alternates + `x-default`, OG/Twitter;
  `jsonLd`).
- `app/layout.tsx` pass-through root; `app/[locale]/layout.tsx` — `<html lang dir>` per locale,
  SSR brand-token `<style>` + pre-paint theme script (no FOUC), `Providers` (i18n + theme +
  react-query), `SiteHeader` / `SiteFooter`, skip link.
- Pages: `/[locale]` (home — hero, search island, category grid, `AutoRental` JSON-LD),
  `/[locale]/search` (SSR availability from `POST /discovery/search` on query params),
  `/[locale]/vehicles/[categoryCode]` (SSG per category × locale + ISR, `Product` JSON-LD,
  breadcrumb), `/[locale]/help` (FAQ), `/[locale]/legal/[slug]` (terms / privacy).
- `app/sitemap.ts` (all indexable routes × locales with `xhtml:link` hreflang; pulls category
  slugs from the API), `app/robots.ts` (allow `/`, disallow `/api/` + `/*/account` +
  `/*/checkout`; `Host` + `Sitemap`).
- `SiteHeader` — logo, nav, locale `<select>` (switches the URL segment + cookie), `ThemeToggle`
  from `@carrental/ui`. `SiteFooter` — legal links.
- `globals.css` — a **third** generated target of `packages/theme`'s token generator (drift-checked).
- Fully localised: every visible string is `t('…')`; 37 new `site.*` keys in `en` / `ar` / `fr`
  (`verify:i18n` OK, 195 keys). `verify:i18n --strict` reports **0** literals in `apps/site/src`.

### Deploy

- `deploy/Dockerfile.site` — `base → deps → {dev | build → runtime}`. Runtime = Next standalone
  output (`server.js` + minimal `node_modules` + `.next/static` + `public`), non-root `node`,
  `tini`, healthcheck on `/en`.
- `compose.prod.yaml` — `site` service on `:3000` (customer entry), `web` moved to `:3100`
  (edge proxy consolidation is increment 2). `compose.yaml` — `site` behind a `site` **profile**
  (`docker compose --profile site up`) since `next dev` is heavy on the constrained host;
  `web` dev → `:3100`; `nm_site` + `next_site` volumes.

## Verified — increment 1

- `pnpm --filter @carrental/site build` — **OK**, peak RSS ~870 MB (fits the 1.9 GB host);
  35 static pages (home/help/legal/search/vehicles × en/ar/fr) with the API up, 20 with it down
  (resilient — `.catch` fallbacks). First-load JS: **87.5 KB** shared, **123 KB** home,
  **96 KB** search — within the STAGE-011 budget (≤130 KB).
- `next start` HTTP checks: `/` → 307 → `/en`; `<html lang="ar" dir="rtl">`; localised
  `<title>` per locale; `rel=canonical` + 4 `hreflang` alternates; full OG tags; `AutoRental` /
  `Product` JSON-LD; valid `robots.txt` + `sitemap.xml`; brand tokens inlined in `<head>`;
  `/en/vehicles/economy` 200; `/api/v1/meta/locales` proxied through Next → real data.
- `docker build -f deploy/Dockerfile.site --target runtime` — **OK** (368 MB). Container run
  (`--network host`): `/`→`/en`, `/ar` RTL, vehicle SSG 200, API proxy 200.
- `verify:static` PASS (lint + typecheck + prettier now cover `apps/site`); `verify:i18n` OK.

## Not done yet (→ increment 2)

Auth / account / trips / checkout pages; `/ops/config/seo` panel + `seo` config kind;
`apps/web` → `/ops` only + `apps/web` router `basename=/ops` + a single edge proxy in
`compose.prod.yaml` / `deploy/nginx.conf`; `verify:seo` gate + Lighthouse run; `og-default.png`
generation from the brand config.

## Completed — increment 2 core (the split + edge)

- `apps/web/src/app/router.tsx` — ops-only route tree; `createBrowserRouter(…, { basename:
'/ops' })`; the customer `/` tree removed.
- `apps/web/vite.config.ts` — `base: '/ops/'`; every `NavLink` / `Navigate` `/ops/x` → `/x`
  (the basename prepends). `index.html` `<title>` → "Operations Console".
- Deleted `apps/web/src/surfaces/customer/` (13 files) + `components/search-form.tsx` +
  `surfaces/auth/register-page.tsx` — all customer-only, now `apps/site`'s job.
- `deploy/Dockerfile.web` — SPA copied to `/usr/share/nginx/html/ops`; `deploy/nginx.conf` —
  `/ops/` SPA fallback, `/` + `/ops` → `302 /ops/`, `absolute_redirect off` (no `:8080` leak
  behind the edge).
- `deploy/nginx.edge.conf` + `edge` service in `compose.prod.yaml` — one origin on
  `${EDGE_PORT:-3000}`; `site` + `web` are now `expose`-only (internal).

### Verified — increment 2 core (full prod stack through the edge, `localhost:3000`)

`/` → 307 → `/en` (site); `/en` localised `<title>`; `/ar` `<html dir="rtl">`; `/ops` → 302 →
`/ops/` (relative, no port leak) → "Operations Console" SPA with `/ops/assets/…`;
`/api/v1/meta/branding` + `/meta/locales` + `/health/ready` → 200 through the edge;
`sitemap.xml` + `robots.txt` → 200. (`/en/vehicles/economy` 404 + ops sign-in 401 are correct —
the prod stack seeds `system` only; `run --rm seed-dev` loads the fixtures.) All 7 services
healthy.
