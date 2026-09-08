# Car Rental System — SRS v1.1 (Enhancement-Program Amendment)

## 1. Document Control

| Field | Value |
| --- | --- |
| Document | Software Requirements Specification — Amendment v1.1 |
| Version | 1.1 (amends v1.0; does not supersede it) |
| Status | Proposed — pending Stage-gate acceptance (`00-control/changes/CR-20260907-001`) |
| Baseline date | 2026-09-08 |
| Base document | `srs-v1.0.md` (unchanged; all SRS-* IDs remain stable) |

### 1.1 Nature of this amendment

Specifies system-level behaviour implemented on branch `implementation` and not covered by
SRS v1.0: the `apps/site` (Next.js) customer surface, `packages/theme`, the `branding` and
`seo` configuration kinds, the locale-admin API, the ops-UX component contract, and step-up
authentication. It adds new IDs (**SRS-SITE-***, **SRS-BRAND-***, **SRS-SEC-018**) and records
the enhancement-program fulfilment of existing IDs in §A. No behaviour is changed here.

---

## 2. Amendments to v1.0

### 2.1 §4.1 Applications — the surface split (SRS-SITE-001)

| App | v1.1 disposition |
| --- | --- |
| APP-CWEB | Delivered by **`apps/site`** — Next.js 14 App Router, TypeScript strict, `output: 'standalone'`, self-hosted Node container. `/{locale}/…` routing (en/ar/fr). SSG + ISR (`revalidate`) for catalogue/marketing routes; SSR for query-driven routes (search); no route depends on client JS for its primary content. |
| APP-OPS | The existing Vite SPA (`apps/web`), reduced to `/ops`, router `basename=/ops`, Vite `base=/ops/`. |
| APP-CMOB | React Native; unchanged scope; built and released outside this branch. |
| Edge | One reverse proxy presents a single production origin: `/` → APP-CWEB, `/ops` → APP-OPS, `/api` + `/health` → API. In development `apps/site` proxies `/ops` and `/api` so the browser still sees one origin (keeps the `SameSite=Lax` refresh cookie first-party — DEC-021). |

This satisfies §5.2's "Web/admin: React, Next.js App Router … self-hosted Node/container output;
no Vercel dependency".

### 2.2 §5.2 Implementation technology baseline — additions

- `packages/theme` — a framework-agnostic token schema (`brandConfigSchema`) + resolver
  (config JSON → CSS custom properties). One generator writes the same variable set to three
  targets (`packages/ui`, `apps/web`, `apps/site`); a drift check (`verify:theme`, part of
  `verify:all`) fails on a literal colour in component source or a stale generated file, and on
  any token pair below WCAG AA in light or dark.
- `apps/site` build is produced in the container `build` stage (not on the constrained dev
  host) and its `next build` requires the API reachable so `generateStaticParams` and
  per-page data loads resolve real content; a build with the API down bakes soft-404s for
  data-backed routes and must not be shipped.

### 2.3 §11 Multilingual — resolved posture

Launch locales are **en (default), ar, fr**, each fully translated and QA'd; **ar** is RTL
(`<html dir>`, logical CSS, bidi-isolation of codes). The locale set is data-driven (the
`locale` + `translation` tables, SRS §10) and manageable without a deploy through the Languages
admin and the translation catalogue (draft → in-review → published; completeness report; a
mandatory legal key blocks publish while untranslated). Both front ends take a build-time
bundle for first paint and merge the published DB overlay at runtime
(`GET /api/v1/meta/translations`, public, published-only). `verify:i18n` gates en/ar/fr key +
ICU-placeholder parity; `verify:i18n --strict` fails on an un-i18n'd literal in either app.

### 2.4 §18.2 Recommended stages — extension

The roadmap is extended with the enhancement program: **STAGE-009** design system / theming /
branding, **STAGE-010** i18n completion, **STAGE-011** the Next.js public site + SEO,
**STAGE-012** ops-dashboard UX, **STAGE-013** system-wide QA. STAGE-005/006 features that v1.0
listed as configuration decisions (incident/replacement, transfers, maintenance UI, fleet
import, recovery-case handling, data-quality, scheduled-delivery policy) are implemented on
this branch (see §A).

---

## 3. New requirements

### 3.1 Public site (SRS-SITE-*)

- **SRS-SITE-001** — APP-CWEB is `apps/site` as described in §2.1.
- **SRS-SITE-002 (SEO):** every indexable route × active locale emits a unique title + meta
  description, a self-consistent `rel=canonical`, reciprocal `hreflang` (en/ar/fr + `x-default`),
  correct `<html lang>`/`dir`, OG + `twitter:card`, and parseable JSON-LD. `robots.txt` carries
  a `Sitemap:` line; `sitemap.xml` is valid, covers exactly the indexable routes with
  `xhtml:link` alternates, and omits `noindex` routes (account, checkout, trips). Enforced by
  `verify:seo` (in `verify:all`).
- **SRS-SITE-003 (performance):** each key route's summed gzip transferred JavaScript stays
  within a documented budget (public ≤170 KB, interactive ≤240 KB); served HTML ≤60 KB gz; no
  render-blocking script in `<head>`; images carry intrinsic size. Enforced by `perf-site.mjs`
  (in `verify:perf`).
- **SRS-SITE-004:** the standalone server is started by a repo script that stages `public/` and
  `.next/static/` beside `server.js` (Next's `next start` mis-renders error boundaries under
  `output: standalone`); the E2E harness and the container image use this path.

### 3.2 Branding / theming (SRS-BRAND-*)

- **SRS-BRAND-001:** a `configVersion` of kind `branding` holds colours, radius, density, font
  key, and asset refs (`obj:` keys or `https:` URLs). It rides the STAGE-006 draft → submit →
  approve → publish workflow with separation of duties. On publish, `config.version.published.v1`
  fires and `GET /api/v1/meta/branding` (public, cacheable) reflects it with no redeploy;
  `obj:` refs resolve to short-lived signed URLs.
- **SRS-BRAND-002:** brand-asset upload (`POST /config/branding/assets`, `config.publish`)
  decodes base64, sniffs the media type by magic bytes and rejects a mismatch, enforces
  per-purpose byte and pixel caps, requires favicon = ICO/PNG, forbids SVG for the OG image,
  and sanitises accepted SVG (removes `<script>`/`<foreignObject>`/`<style>`, `on*=` handlers,
  external `href`/`src`, off-document `url()`). Stored via the S3-compatible object port
  (`OBJECT_STORAGE_FS_ROOT` locally); served by a `@Public()` signed route with an immutable
  cache and a locked CSP for SVG.
- **SRS-BRAND-003 (kind `seo`):** a `configVersion` of kind `seo` holds the default title
  template, default description, canonical base URL, and a global indexable flag, validated by
  a zod schema, surfaced at `GET /api/v1/meta/seo`, consumed by `apps/site` metadata.

### 3.3 Security — SRS-SEC-018 (step-up authentication)

A configured set of high-consequence staff actions must require the actor's last full password
authentication to be within `STEP_UP_MAX_AGE_SEC` (default 900). Otherwise the request is
refused with `auth_step_up_required` (HTTP 401) carrying the window in `params`. The actor
re-confirms at `POST /api/v1/auth/step-up { password }` (any authenticated principal): the
password is re-verified with Argon2, `account.last_full_auth_at` is refreshed (no token is
minted, sessions are untouched), and `iam.step_up` / `iam.step_up.failed` are audited (audit
scope extends SRS-SEC-016 "authentication risk"). A wrong password returns HTTP 422 with a
`password` field error and does not grant elevation. The guard runs after the permission
guard, so a caller lacking the permission still receives 403. The clients (`apps/site`,
`apps/web`) intercept `auth_step_up_required`, prompt for the password, and retry the original
request once. First protected action: `POST /ops/reports/schedules/:id/send`.

### 3.4 UI/UX component contract — SRS-UI-011 extension

Every `/ops` tabular list uses one `DataTable` component: one implementation of the
loading/error(+retry)/empty state machine, uppercase-muted headers, bordered rows, horizontal
scroll contained in its own box, an optional full-width detail row, and stable `data-testid`
hooks; filters in a `Toolbar`; detail panes in a `DetailList`. `/ops` also provides a
command palette (`⌘K`, permission-filtered destinations) and a breadcrumb. `verify:a11y`
(axe, WCAG 2.1 A/AA) reports 0 serious/critical across every `/ops` screen and the key customer
routes.

---

## Appendix A — Enhancement-program fulfilment of existing SRS IDs

| SRS ID | Fulfilled by |
| --- | --- |
| SRS-FLOW / FR-FLT-005 | fleet maintenance blocks take a unit out of service and back; `verify` via `fleet-ops.spec.ts`. |
| SRS-FLOW / FR-FLT-003 | `POST /ops/fleet/units/:id/transfer` with open-rental guard. |
| SRS-DAT / FR-FLT-001 | `POST /ops/fleet/units/import` — validated CSV, dry-run, atomic commit. |
| SRS-FLOW / FR-RNT-010 | `POST /ops/rentals/:ref/incident` — incident log, immobilise, validated vehicle swap. |
| SRS §9.2 DAT-CASE / FR-INT-002 | `POST /ops/cases/:id/retry` — re-signal + re-check + auto-resolve; `/ops/finance` screen. |
| SRS §16.3 / FR-RPT-006 | `GET /ops/data-quality` — 6 referential-integrity checks; `/ops/data-quality` screen. |
| SRS-SEC-016 / FR-RPT-006 | scheduled-report send re-authorises the owner; pauses + records `last_skip_reason`. |
| SRS-I18N-003 / FR-ADM-012 | Languages admin + translation catalogue + public published overlay. |
| SRS-UI-007..012 | `verify:a11y` 0 serious/critical; keyboard operability; `DataTable`/palette/breadcrumb. |
| SRS-SEC-011 / SRS-DAT-008 | audit before/after masking unchanged; new audit actions redacted per SRS-SEC-017. |

## Appendix B — Verification

Documentation-only. Re-run and green: `verify:static`, `verify:i18n` (+`--strict`, 768 keys),
`verify:theme`, `verify:unit`, `test:api` (15 files / 101 tests), `verify:seo`, `verify:a11y`,
`verify:e2e` (customer + ops flows). Per-increment record in the root `CHANGELOG.md`.
