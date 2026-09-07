# STAGE-011 — checkpoint

- **Status:** IN PROGRESS.
- **Increment 1 (done, 2026-09-07):** `apps/site` scaffold + home / search / vehicle-detail /
  help / legal, full technical SEO, `/[locale]/` i18n routing (en/ar/fr + RTL), brand overlay,
  Docker image + compose wiring. Builds + runs verified.
- **Increment 2 (next):** port the authenticated customer flows (auth, account, trips,
  checkout) against the same API; the `/ops/config/seo` dashboard panel + `seo` config kind;
  reduce `apps/web` to `/ops` only + a single edge proxy (site + web + api behind one origin);
  `verify:seo` gate; Lighthouse evidence.

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
