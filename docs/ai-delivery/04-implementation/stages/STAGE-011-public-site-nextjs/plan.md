# STAGE-011 — Public site on Next.js · plan

## Objective / outcome

A new `apps/site` (Next.js App Router) that **is** the customer-facing product: every current
`/` screen, ported with parity plus the professional UI/UX + theming + i18n uplift, and
optimized for SEO, performance, accessibility, responsiveness, metadata, and indexing.
`apps/web` is reduced to `/ops` only.

## Source IDs

Mandate §1.1, §1.6, §1.7 (enhancement-program.md); DEC-023 (supersedes DEC-004 for the customer
surface); DEC-021 (delivery topology), SRS-UI-001..015, SRS-NFR-005/010, SRS-API-001, SRS-SEC-003.

## Workstreams

### 1. Scaffold

- `apps/site`: Next.js (App Router, TS strict), Tailwind + `packages/ui` + `packages/theme` +
  `packages/i18n/next`, `next/font`, ESLint/Prettier shared config, `pnpm --filter @carrental/site`.
- Route group `app/[locale]/(marketing|shop|account)/…`. Server components by default; client
  islands for interactive widgets (search, checkout, account forms).
- API client: typed fetch against `/api/v1` (same contracts package); access token in memory,
  refresh via the `HttpOnly` cookie; SSR passes cookies through.

### 2. Page port (parity + uplift)

| Route                                              | From                  | Notes                                                                                                  |
| -------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| `/[locale]`                                        | `home-page`           | hero + search + value props + featured categories; SSG + ISR; LocalBusiness JSON-LD                    |
| `/[locale]/search`                                 | `search-results-page` | server-rendered results from query params; filters as client island; canonical without volatile params |
| `/[locale]/vehicles/[categoryCode]`                | `vehicle-detail-page` | SSG per active category + ISR; Product/Vehicle JSON-LD, OG image                                       |
| `/[locale]/checkout`                               | `checkout-page`       | client; guarded; held-quote countdown                                                                  |
| `/[locale]/sign-in` `/register` `/recovery`        | `auth/*`              | client; `noindex`                                                                                      |
| `/[locale]/account…`, `/trips…`                    | `customer/*`          | client; `noindex`; auth-gated                                                                          |
| `/[locale]/help`, `/legal/*`, `/about`, `/contact` | new/`placeholder`     | static content pages, indexable                                                                        |

- Shared shell: header (brand logo from `/meta/branding`, nav, language + theme switch, account
  menu), footer, skip link, breadcrumb.

### 3. Technical SEO

- Next **Metadata API** per route: unique `title`, `description`, `canonical`, OG + Twitter,
  `alternates.languages` (`hreflang` for en/ar/fr + `x-default`).
- `app/sitemap.ts` (all indexable routes × locales), `app/robots.ts` (toggle + host from SEO
  config), JSON-LD: Organization + LocalBusiness (home), Product/Vehicle (detail),
  BreadcrumbList, WebSite + SearchAction.
- `next/image` for all imagery (brand + vehicle), `next/font` self-hosted, no layout shift.
- Dashboard **SEO settings** (`/ops/config/seo`, `seo` `configVersion` kind): site name,
  title template, default description, social handles, verification meta tags, robots
  allow/deny, per-category title/description overrides, default OG image.

### 4. Performance

- Budgets: LCP ≤ 2.0 s (lab, mid-tier), CLS ≤ 0.05, INP ≤ 200 ms, first-load JS ≤ 130 KB gz per
  route. RSC + route-level code split + streaming; ISR revalidate for catalogue pages; cache
  `/meta/*`. `verify:perf` extended with a Lighthouse/`web-vitals` lab run.

### 5. Deploy / routing

- `deploy/Dockerfile.site` (multi-stage: `deps → build (next build, standalone) → runtime`
  (non-root node, `next start` or the standalone server), healthcheck `/[defaultLocale]`).
- `compose.yaml` + `compose.prod.yaml`: add `site`; nginx/front proxy — `/` → `site:3000`,
  `/ops` → `web` static, `/api` + `/health` → `api`. Update `deploy/nginx.conf` + `RUNBOOK.md`.
- `apps/web` (Vite) `base` / router basename → `/ops`; drop the customer routes; keep the shared
  auth/token libs it still needs.

### 6. Auth across surfaces

- Prod: one origin via the proxy → `SameSite=Lax` refresh cookie unchanged (DEC-021).
- Dev: `site:3000`, `web:4000`, `api:3001`; cookie host-scoped; `CORS_ALLOWED_ORIGINS` +
  `APP_URL` updated; documented in `.env.example`.

## Acceptance criteria

- Every customer route works in `apps/site` with feature parity (search → quote → checkout →
  confirmation → trips → account all pass an E2E walkthrough) in en/ar/fr and light/dark.
- Each indexable route has a unique, correct `<title>`/description/canonical/OG + valid JSON-LD;
  `sitemap.xml` + `robots.txt` correct; `hreflang` reciprocal; Lighthouse SEO ≥ 95, PWA n/a,
  Best-Practices ≥ 95, Perf within budget (lab).
- `/ops` still works from `apps/web` after the split; no dead customer routes.
- `verify:static | unit | api | migrate | e2e | a11y | seo | perf` green; images build; both
  compose stacks up healthy with the new `site` service.

## Test evidence (→ `test-evidence.md`)

Lighthouse reports (home, search, vehicle detail) per locale; `sitemap.xml` / `robots.txt` /
JSON-LD dumps; E2E walkthrough video/screens; bundle-size report; compose `ps` + curl matrix;
`site-e2e` spec results.
