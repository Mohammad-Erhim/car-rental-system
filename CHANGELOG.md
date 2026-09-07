# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project is
pre-1.0 and versions track the delivery stages in `docs/ai-delivery/04-implementation/`.

## [Unreleased]

### STAGE-005/006 deferred — fleet operations: maintenance blocks + transfers (2026-09-08)

`vehicleBlock` and the `addBlock` / `releaseBlock` endpoints existed since STAGE-002 but were
availability-only with no state effect and no UI; unit transfers had no path at all.

**Added / changed (API)**

- `POST /api/v1/ops/fleet/units/:id/transfer` (`fleet.manage`) — moves a unit to another
  location. Rejected (422) while the unit is `on_rent` or has an open rental, or if it is
  already there; 404 for an unknown unit or destination. Takes effect immediately (availability
  counts by current location). Audits `fleet.unit.transferred`.
- `GET /api/v1/ops/fleet/blocks?unitId=&status=` (`fleet.read`) — the block list (with the
  unit plate), newest first.
- `addBlock` now also takes an `available` unit **out of service** (`state → maintenance`) for
  a `maintenance` block, and rejects one that has an open rental; `releaseBlock` returns the
  unit to `available` when its last active maintenance block is lifted (and it has no open
  rental). Both audit (`fleet.block.opened` / `fleet.block.released`). No schema change.

**Added (web)**

- `/ops/fleet` gains, for a `fleet.manage` holder: a per-row **Maintenance** / **Transfer**
  action, and a **Maintenance & blocks** card (active blocks + **Release**). `fleet-table` /
  `fleet-rows` testids unchanged. 16 `ops.fleet.*` keys en/fr/ar.

Verified: `apps/api/test/fleet-ops.spec.ts` (3) — block lifecycle incl. availability drop-out,
transfer + guards, RBAC; full `test:api` green; web typecheck / lint / build / `verify:i18n`
(716) + `--strict` green.

### STAGE-005/006 deferred — recovery-case retry + the Recovery & reconciliation screen (2026-09-08)

The `ops/cases` + `ops/payments/reconciliation` endpoints had no UI; `/ops/finance` was a
placeholder.

**Added (API)**

- `POST /api/v1/ops/cases/:id/retry` (`payment.reconcile`) — re-emits
  `recovery_case.retry_requested.v1`, re-checks the inconsistency the case tracks (reservation
  row present / no remaining reconciliation exception), auto-resolves the case when consistent
  and otherwise records the attempt (`detail.retryCount` / `lastRetryAt` / `lastRetryOutcome`)
  and leaves it open. Audits `recovery_case.retried`. Resolved → 422, unknown → 404. No schema
  change. `PaymentService` gains `getCase` + `patchCaseDetail`.

**Added (web)**

- `finance-cases-page.tsx` at `/ops/finance` (replaces the placeholder) — a `DataTable` of open
  recovery cases (Retry / Resolve) and one of reconciliation exceptions (+ Run reconciliation).
  Guard `payment.read | payment.reconcile`; writes gated on `payment.reconcile`. 29
  `ops.fin.*` keys en/fr/ar.

Verified: `test:api` 93 (+1 retry lifecycle test); web typecheck / lint / build /
`verify:i18n` + `--strict` green.

### STAGE-012 — shared `DataTable` + `/ops` command palette (2026-09-08)

Every `/ops` screen that renders a tabular list now uses one primitive for the
loading / error / empty / scroll-in-box state machine it was each re-implementing.

**Added (`packages/ui`)**

- `DataTable<T>` — `columns` (`key` / `header` / `cell` / `className`), `rows`,
  `rowKey(row, index)`, react-query-ish `isLoading` / `isError` / `onRetry`,
  already-localised `labels`, `rowProps` (per-row `data-*`), `rowClassName`,
  `renderSubRow(row)` (a full-width `<td colSpan>` detail row under a row; the
  caller owns the open/closed state), `minWidth`, `caption`. Renders
  `AppStateView` for the three non-data states, else an uppercase-muted-header
  bordered table inside an `overflow-x-auto` box. 6 unit tests.
- `DetailList`, `Toolbar` (from the earlier increment) unchanged.

**Changed — `/ops` screens onto `DataTable`**

- fleet-inventory, reservation-queue, rate-plans, staff-roles, config-versions
  (revision history + `data-state` / `data-rev` / `config-row-<rev>` preserved),
  audit-log (event table + expandable before/after diff via `renderSubRow`),
  reports (the run-result table with run-defined columns, plus the "recent runs"
  mini-table — which had no `<thead>` at all and now has proper headers),
  reference-data (lookup values with the inline-edit label cell), translations
  (coverage-by-namespace). All existing testids / row `data-*` kept; the ops
  E2E specs (`report`, `auth-and-reference`, `discovery`) pass on phone / tablet
  / laptop, 11/11 each.
- Deliberately not converted: `rental-board` (kanban cards), `languages` (rich
  wrapping rows), the translations per-key `<ul>` inline editor — none are
  tables.

**Added — command palette**

- `apps/web/src/surfaces/ops/command-palette.tsx` — mounted in the `/ops` header
  for an authenticated staff session. `⌘K` / `Ctrl+K` or the header button opens
  it; it lists the same permission-filtered nav destinations the left rail shows
  (built from the one `NAV_GROUPS` source), so it can never route to a section
  the user cannot open. Substring match ranks above a fuzzy subsequence
  (`rp` → "Rate plans"); `↑` / `↓` move, `Enter` navigates, `Esc` closes.
  `sr-only` `DialogTitle` / `DialogDescription`. 5 unit tests.
- Keys `ops.ref.noValues`, `ops.rpt.thRows`, `ops.rpt.thWhen`,
  `ops.cmdk.{open,placeholder,empty,hint}` (en / fr / ar).

### STAGE-011 — E2E suite ported to the single-origin `apps/site` stack (2026-09-08)

The 13 Playwright specs (customer + operations flows, interleaved) now run against one browser
origin, closing the `verify:e2e` gap left by the `apps/web` → `/ops` split.

**Changed**

- `e2e/playwright.config.ts` — `baseURL` is `apps/site` (`:3000`, served by the new
  `start:standalone` script — `next start` mis-renders error/not-found boundaries with
  `output: 'standalone'`). It proxies `/ops` → `apps/web` (`vite preview :3100`) and `/api` →
  the API (`:3001`). `qa-matrix.spec` is ignored here (it has its own config).
- `verify:e2e` / `verify:a11y` also build `apps/site`; `verify:e2e` runs `db:reset` first so
  every run starts from a full fleet.
- `_helpers` — Next's benign "Failed to fetch RSC payload … falling back to browser
  navigation" console line is allow-listed; the evidence-screenshot budget is 30s → 60s.

**Added / adjusted in `apps/site` for the on-page contract the specs assert**

- Search island + results: `search-form` / `search-location` / `search-pickup-at` /
  `search-return-at` / `search-submit` testids; `results-list`, `result-<code>` +
  `-price` + `-count`, and a "View & reserve" link. The no-results state is now keyed off
  *bookable* options (a closed-hours search returns sold-out options plus a notice).
- `components/vehicle-reserve.tsx` — a client island on the vehicle page: live price
  (`detail-total`) and a `reserve-button` that creates a quote + hold and routes to checkout.
- `next.config` redirect `/[locale]/vehicle/:c` → `/[locale]/vehicles/:c` (legacy path).
- Account sub-pages render their own `<h1>`; every noindex segment (auth / account / trips /
  checkout) gets a localised `<title>` from a per-route `generateMetadata` layout.
- `[locale]/[...notFound]` — a localised soft-404 (Next 14 breaks `not-found.tsx` triggered
  from a dynamic segment in a `standalone` build); `[locale]/not-found.tsx` kept as a static
  fallback.
- Header nav / bottom nav switch at the `lg` breakpoint (was `sm`) so tablet keeps the bottom
  nav; the bottom nav is `fixed`.

**Added (API)**

- `GET /api/v1/meta/translations` — public, published-only translation overlay for a namespace
  + locale. `apps/site` was calling the staff-gated `/config/translations` and always falling
  back to the bundled strings.
- Translation catalogue (`/ops/config/translations`): a filter box + a 50-row cap + "show
  more" (650 keys made the page's full-page screenshot time out; also a real UX win).
- `/ops` grouped-nav section labels: `text-muted-foreground/70` → full opacity (axe
  `color-contrast`).

### STAGE-011 — `verify:seo` gate for `apps/site` (2026-09-07)

**Added**

- `scripts/verify-seo.{mjs,sh}` + `pnpm verify:seo` (in `verify:all`) — for every indexable
  route × {en, ar, fr}: a unique non-empty `<title>` and meta description, a self-consistent
  `rel=canonical`, `hreflang` alternates (en/ar/fr + `x-default`) that are reciprocal across
  locales, the right `<html lang>` / `dir`, OG + `twitter:card`, and parseable JSON-LD; plus
  `robots.txt` (Sitemap line) and `sitemap.xml` (valid, covers the routes, carries
  `xhtml:link` alternates), and `robots: noindex` on `/account` · `/checkout` · `/trips`.
- Fix it surfaced: the legal pages used their (short) title as the meta description →
  `site.legal.{terms,privacy}.description` authored en/ar/fr.

### STAGE-009 — Brand-asset upload + self-hosted web fonts (2026-09-07)

**Added**

- `POST /api/v1/config/branding/assets` (staff, `config.publish`) — upload a brand image
  (logo / logoDark / favicon / ogImage) as a base64 JSON body and get an opaque `obj:` ref to
  store in the branding config. The server magic-byte-sniffs the real media type (rejects a
  mismatch with the declared one), enforces per-purpose byte caps (favicon 128 KB, logo
  512 KB, OG 2 MB) and pixel-dimension bounds, and runs SVG through an allowlist sanitiser
  that strips `<script>` / `<foreignObject>` / `<style>`, `on*` handlers, and external
  `href` / `src` / `url()` before storage.
- `common/object-storage/` — an fs `ObjectStorageService` (DEC-015): content under
  `OBJECT_STORAGE_FS_ROOT`, a `stored_object` metadata row, and reads handed out only as
  short-lived HMAC-signed `GET /api/v1/assets/:key?exp&sig` URLs (SVG served with a locked
  `Content-Security-Policy`). `image.util.ts` carries dependency-free PNG/JPEG/WebP/ICO
  dimension readers and the SVG sanitiser.
- `GET /api/v1/meta/branding` now resolves `obj:` asset refs to signed URLs; the branding
  editor gains a file `<input>` per asset (upload → base64 → store the ref).
- **Self-hosted web fonts** — `apps/site` loads the curated font set (Inter, IBM Plex Sans +
  IBM Plex Sans Arabic, Cairo, Tajawal) via `next/font/google`: 38 `.woff2` built into
  `.next/static/media`, `font-display: swap`, computed fallback metrics, **no runtime request
  to Google**. `packages/theme` emits `--font-sans: var(--font-brand, <primary>), <fallbacks>`
  and `[locale]/layout` sets `--font-brand` from the brand `font` key. `system` loads nothing.

**Changed**

- Global JSON body limit 100 KB → 3 MB (the staff-only, rate-limited brand-asset route needs
  room for a base64 OG image).

**Verified**

- `api test:api` 92 (14 files; +8 `brand-asset.spec.ts`: PNG round-trip, tampered-sig 404,
  MIME mismatch, dimension cap, byte cap, SVG sanitisation, RBAC, `meta/branding` resolution).
- `verify:theme` green (token CSS regenerated + `check:css` clean, 9 unit tests, no literal
  colours); `pnpm -r typecheck` + lint green; `next build` green with fonts self-hosted.

### STAGE-011 — Authenticated customer surface on `apps/site` (2026-09-07)

The customer flows deferred at the `apps/web` → `/ops` split are now on the Next.js App Router,
fully localised (en/ar/fr), and private (`robots: noindex` on every authed segment).

**Added**

- **Auth** — `/[locale]/sign-in`, `/register`, `/recovery` in a `(auth)` route group.
  `lib/api-client.ts` (browser access-token holder + one silent `/auth/refresh` on 401,
  same-origin `/api/v1` via the `next.config` rewrite), `lib/auth-context.tsx`
  (`AuthProvider`/`useAuth`, customer audience only) wired into `components/providers.tsx`
  with a `ToastProvider`. `RequireAuth` client guard stashes the return target and redirects
  anonymous visitors to sign-in (FLOW-CUS-002, SRS-UI-006).
- **Account** — `/[locale]/account` (server layout: `RequireAuth` + `AccountShell` tab nav +
  `robots:noindex`): overview (SCREEN-CUS-011), profile & preferences (SCREEN-CUS-012, keeps
  the optimistic `version` + 409→reload), saved drivers (SCREEN-CUS-013), payments & receipts
  (SCREEN-CUS-023 — charges per booking, link to the breakdown), data requests & closure
  (SCREEN-CUS-024, blocker surfacing).
- **Trips** — `/[locale]/trips` list (SCREEN-CUS-014) + `/[locale]/trips/[reference]` detail
  (SCREEN-CUS-015/016/019): itinerary, cancel with refund shown, modify return → re-price
  delta, in-progress rental extend, change history.
- **Checkout** — `/[locale]/checkout` (SCREEN-CUS-004..007): held-quote review with a live
  hold timer, driver + payer details, one intended charge, confirmation with the booking
  reference and a guest add-to-account CTA. `useSearchParams` under a `Suspense` boundary.
- `lib/customer-hooks.ts` — the customer-relevant React Query hooks (profile, drivers,
  privacy, discovery quote/confirm, reservations, rental), ported from the pre-split
  `apps/web` hooks. `lib/{use-form-errors,return-to,nav}.ts` ported.
- `[locale]/not-found.tsx` now renders a localised body (`components/not-found-content.tsx`).
- **i18n** — +152 keys (`auth.register.*`, `account.*`, `profile.*`, `driver.*`, `privacy.*`,
  `payments.*`, `trips.*`, `reservation.*`, `checkout.*`, `notFound.home`) authored in
  en / ar / fr. `verify:i18n` 638 keys green; `verify:i18n --strict` — **0** un-i18n'd
  literals in `apps/site/src`.

**Verified**

- `pnpm -r typecheck` green; `apps/site` lint + prettier clean.
- `pnpm --filter @carrental/site build` — green: 65 static pages
  (`sign-in`/`register`/`recovery`/`account*`/`trips`/`checkout` × en/fr/ar SSG),
  `trips/[reference]` server-rendered on demand.

### STAGE-009 — Density controls + default OG image (2026-09-07)

**Added**

- The brand `density` token (`comfortable` / `compact`) now actually resizes controls.
  `--control-h` / `--control-h-sm` / `--control-px` custom properties in the token
  stylesheets flip on `:root[data-density='compact']`; `Button` and `Input` read them.
  `comfortable` keeps the 44px touch target (SRS-NFR-012); `compact` drops to 38px for
  data-dense dashboard screens. `apps/site` sets `data-density` on the SSR `<html>`.
- `apps/site/public/og-default.png` — a branded 1200×630 fallback Open Graph / Twitter card
  (used when the dashboard SEO config sets no `ogImageUrl`), with
  `apps/site/scripts/gen-og-default.mjs` to regenerate it.

### STAGE-011 — Dashboard-managed SEO (2026-09-07)

Technical SEO is now configured from the dashboard, no redeploy (SRS-ADM-006).

**Added**

- `seo` config-version kind — rides the draft → submit → approve (author ≠ approver) + audit
  workflow. Validates structure + `https://` URLs + `@handle` shape; `preview` echoes the
  resolved home / vehicle `<title>`, the canonical base, and a description-length note.
- `GET /api/v1/meta/seo` — public, cacheable (`ETag` + `Cache-Control`); returns the published
  config or the built-in default (revision 0). `seoConfigSchema` + `DEFAULT_SEO_CONFIG` in
  `@carrental/contracts`.
- `/ops/config/seo` dashboard screen (new `Search` nav entry, Configuration group): site name,
  title template, default title / description (with a live length hint), canonical base URL,
  OG image, Twitter handle, organisation logo, an **indexable** master switch, and Google /
  Bing verification tokens — with live preview and the version list (submit / approve). 33
  `ops.seo.*` keys ×{en,ar,fr}.
- `apps/site` consumes it: `buildMetadata` applies the title template, canonical + hreflang
  origin, robots, `verification` meta, and OG/Twitter (`site`/`creator` from the handle);
  `robots.ts` + `sitemap.ts` honour the indexable switch (deny-all + empty sitemap when off);
  home / vehicle JSON-LD use the configured site name + logo.

### STAGE-012 — Ops nav grouping, auth-screen i18n, `<html lang>` sync (2026-09-07)

**Added**

- Grouped sidebar navigation — Operations / Catalogue / Configuration / Administration
  section headings (design §4.2 hierarchy). Groups are permission-filtered; an empty group
  is not rendered. Mobile keeps the flat scroll strip. New `ops.navGroup.*` keys ×3.

**Changed**

- Staff sign-in and account-recovery screens are fully localised (title, field labels,
  show/hide, loading label, links, the reset-complete message) — 17 `auth.*` keys ×3.
- `I18nProvider` now syncs `<html lang>` / `dir` on first mount, not only on switch, so a
  page opened straight into `ar` is `dir="rtl"` immediately (a11y + RTL CSS). Benefits both
  `apps/web` and `apps/site`.

### STAGE-012 — Ops dashboard · full per-page i18n (2026-09-07)

Every operations screen is now authored end-to-end in **English, Arabic, and French** —
no screen renders mixed-language or mixed-direction. Swept in a browser across the 13 ops
routes × 3 locales × light/dark: 99/99 checks (correct `<html lang>`/`dir`, zero Latin-script
UI-string leaks under `ar`, zero console errors).

**Added**

- 63 `ops.*` message keys ×3 locales covering the eight screens that still had inline
  English: audit log, staff & roles, rate plans, translations, reference data, configuration
  versioning, reports, rental board. Includes the config-versioning area / setting / field
  labels + hints, which now resolve through `ops.cfg.{kind,key,field}.*` instead of a
  hard-coded structure.
- `packages/ui` `PageHeader` adopted on all 13 ops screens (consistent title / description /
  actions; replaces ad-hoc `<h1>` blocks).
- `UiStringsProvider` / `useUiStrings` in `packages/ui` — feeds the micro-copy the shared
  components render themselves (the `Field` "(optional)" suffix) from the host's i18n
  runtime; English defaults keep `packages/ui` usable without a provider. Wired in both
  `apps/web` and `apps/site`. New `field.optional` key ×3.

**Changed**

- Table headers, empty / error / loading states, filter labels, and every button on the
  eight screens above route through `t()` (`ops.st.*`, `ops.tbl.*`, per-screen namespaces).

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
