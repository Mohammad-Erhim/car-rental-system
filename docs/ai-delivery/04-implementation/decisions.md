# Decision Records

Append-only. Do not rewrite history. Newest at the bottom of each area.

---

### DEC-001 — Operation mode: START with pre-answered scope

- Date: 2026-09-07
- Context: Prompt 06 START normally asks the user to pick a scope. The user's instruction already
  fixed it ("entire system except Mobile App frontend").
- Decision: Treat as explicit scope instruction. Skip the scope question; still produce the
  roadmap and run the per-stage gate.
- Source IDs: SRS §18, prompt 06 "Operation modes".
- Consequences: `selected-scope.md` records full system minus APP-CMOB frontend.

### DEC-002 — Backend stack

- Date: 2026-09-07
- Decision: NestJS + TypeScript (strict), modular monolith, separately runnable worker process.
- Source IDs: SRS DEC-004, DEC-011, SRS-ARC-001..008.

### DEC-003 — Persistence + ORM

- Date: 2026-09-07
- Decision: PostgreSQL 16 (native service on this host), Drizzle ORM, versioned SQL migrations
  via drizzle-kit, integer minor units for money, UTC instants + IANA zones.
- Source IDs: SRS DEC-005, SRS-DAT-001..012.

### DEC-004 — Web stack: React + Vite + shadcn/ui (supersedes SRS "Next.js")

- Date: 2026-09-07
- Context: SRS §5.2 names "React, Next.js App Router" as the web baseline. The user gave an
  explicit later constraint: "For frontend web use https://github.com/shadcn-ui/ui with react
  vite instead of next js". Prompt 06 technology-selection order puts explicit user constraints
  first. This host also has ~1.9 GB RAM, where a Vite SPA dev/build is much lighter than Next.js.
- Decision: `apps/web` = React 18 + Vite 5 + TypeScript (strict) single-page app, styled with
  **shadcn/ui** (Radix UI primitives + Tailwind CSS + CVA + tailwind-merge + lucide-react),
  routed with React Router v6. Two surface trees in one app:
  - `(customer)` → APP-CWEB, served at `/`
  - `(ops)` → APP-OPS, served at `/ops`
    with separate layouts, navigation, auth token audiences, permission gates, and design
    treatments. They build/test as distinct surfaces and can be split into two deployables
    (or two Vite ent- points) without domain change.
- SRS clauses affected: SRS-CMP-WEB / SRS-CMP-OPS ("Next.js routes") now read "React Router
  routes"; SRS-UI-014's "hydration warnings" is N/A for a CSR SPA (still assert: no console
  errors, no unhandled rejections, no failed unexpected requests, no a11y violations). SSR/SEO
  concerns for the public catalogue are handled with `react-helmet-async` meta + a prerender
  step deferred to release hardening if needed.
- Source IDs: prompt 06 "Technology selection" (explicit user constraint), SRS-UI-001..015,
  SRS §1.2 ("implementation may split files or modules"), SRS-NFR-005.
- Consequences: DEC-018 updated; `packages/ui` hosts the shadcn-derived component set; API may
  serve the built static assets in production; traceability still treats APP-CWEB / APP-OPS
  independently.

### DEC-005 — Auth mechanism

- Date: 2026-09-07
- Decision: First-party email+password (argon2id) + short-lived signed access JWT (~15 min) +
  opaque rotated refresh sessions stored hashed, with reuse detection + family revocation.
  Browser uses Secure/HttpOnly/SameSite cookie for the refresh token + CSRF token for cookie
  writes. OAuth/OIDC left as an optional adapter interface (not wired to a live provider).
- Source IDs: SRS DEC-007, SRS-SEC-001..006.

### DEC-006 — Payment provider

- Date: 2026-09-07
- Decision: Provider-neutral `PaymentPort`; the only implementation wired by default is the
  local deterministic simulator with named scenarios (success, decline, action-required,
  timeout-before-effect, timeout-after-effect/unknown, duplicate/out-of-order webhook,
  signature failure, outage, recovery) and an event-replay endpoint.
- Source IDs: SRS DEC-008, SRS §4.3, §12.3, TEST-ERR-005/006.
- Superseded by: DEC-027 adds a real Stripe implementation of the same port, dashboard-switchable
  against the simulator. (Note: this entry previously and inaccurately claimed a Stripe adapter
  was "left as a stub" — no such file ever existed; corrected 2026-09-12.)

---

## Environment-driven decisions

### DEC-013 — No container runtime on this host

- Date: 2026-09-07
- Context: `docker`/`podman` absent; `packagekit` masked; cannot install a runtime reliably.
  Passwordless sudo + apt available.
- Decision: Local dependencies run as native services (`postgresql-16`, `redis-server`) started
  by `scripts/dev-up.sh`. `compose.yaml` + per-app `Dockerfile` are still committed and kept
  accurate for any environment that has Docker; CI docs describe both paths.
- Source IDs: SRS DEC-003, SRS §5.2 ("must be fully buildable and testable locally"),
  SRS §2.2 ("a self-managed server is sufficient for the MVP").
- Consequences: "one documented command starts dependencies and apps" is `pnpm dev:up` here
  rather than `docker compose up`.

### DEC-014 — Redis in place of Valkey

- Date: 2026-09-07
- Decision: Use Redis 7 for BullMQ queues, rate limits, ephemeral cache, lookup-cache
  invalidation pub/sub. Valkey is API/wire compatible; `REDIS_URL` is the only touch point.
- Source IDs: SRS DEC-011, SRS §5.2 cache/queue row.

### DEC-015 — Filesystem object storage adapter

- Date: 2026-09-07
- Decision: `ObjectStoragePort` with an `fs` driver (writes under `var/objects/`, signed links
  are HMAC-signed time-boxed URLs served by the API) as default; `s3` driver (AWS SDK /
  MinIO-compatible) kept behind `OBJECT_STORAGE_DRIVER`. Same checksum/scan/retention metadata
  path in PostgreSQL either way.
- Source IDs: SRS DEC-006, SRS-DAT-009, IF-OBJ-ADAPTER.

### DEC-016 — Mail outbox instead of Mailpit

- Date: 2026-09-07
- Decision: `MailPort` default driver `outbox` persists rendered messages to `notification`
  rows + object storage and exposes them at `/ops/dev/mail` (dev only) and via API for tests.
  `smtp` driver (nodemailer) kept behind `MAIL_DRIVER`. SMS/push use the same outbox pattern
  with a dev viewer.
- Source IDs: SRS DEC-010, SRS §4.3, IF-MSG-ADAPTER, FR-INT-002.

### DEC-017 — Lightweight observability locally

- Date: 2026-09-07
- Decision: Pino JSON logs to stdout + `var/log/*.log`, request/trace/job correlation IDs,
  `/health/live|ready|version`, `/metrics` (Prometheus text exposition), and an evidence
  bundler for failed E2E. OpenTelemetry SDK is initialized and exports only when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set, so a full collector stack is optional.
- Source IDs: SRS DEC (observability row), SRS-OBS-001..012.

### DEC-018 — Two surfaces, one Vite codebase (see DEC-004)

- Date: 2026-09-07
- Decision: `apps/web` is one Vite React SPA. React Router route trees `/` (APP-CWEB) and
  `/ops` (APP-OPS) with independent layout shells, nav, auth audiences, and permission gates —
  route-tree split, not repo split, for the MVP on this host.

### DEC-021 — Frontend/backend delivery topology

- Date: 2026-09-07
- Decision: Vite SPA talks to the NestJS API at `/api/v1`. Dev: Vite dev server on `:3000`
  proxies `/api` → NestJS `:3001`. Test/prod: `vite build` static output is served by the API
  (or any static host) and API stays at `/api/v1`; SPA deep links fall back to `index.html`.
  Refresh-token cookie is `SameSite=Lax` on a shared origin so no cross-site CSRF surface for
  the browser flow; CSRF token still required for cookie-authenticated writes.
- Source IDs: SRS-API-001, SRS-SEC-003/015.

### DEC-019 — Maps: MapLibre optional, written address is the base

- Date: 2026-09-07
- Decision: `MapPort` default driver returns stored addresses/instructions and a static
  bounding-box; MapLibre GL is loaded on the client only when `NEXT_PUBLIC_MAPS_ENABLED=1`
  with a configurable style URL. No paid token is required for build/test.
- Source IDs: SRS DEC-009, FR-INT-003, IF-MAP-ADAPTER.

### DEC-020 — Launch locales for development/testing

- Date: 2026-09-07
- Context: SRS-I18N-001 keeps launch locales as business configuration; absence must not block
  building/testing; English-only must not be silently assumed.
- Decision: Seed `system` locale profile with `en` (default) + `ar` (RTL, for bidi coverage) +
  `fr` (LTR second locale) as **test/development** locales, clearly marked non-production in the
  seed profile. Production activation still blocks until the business confirms the real list.
- Source IDs: SRS-I18N-001, SRS §5.4, BR-028, FR-GBL-002.
- Open question surfaced to user: confirm the real launch locale list before any production release.

### DEC-022 — Two co-equal local workflows; Compose split dev / prod at the repo root

- Date: 2026-09-07 (STAGE-008)
- Context: DEC-013 records that the delivery host has no container runtime, so the native
  `postgresql-16` + `redis-server` path is the working default. The STAGE-007 deploy artifacts
  (`deploy/Dockerfile.*`, `docker-compose.yml`) were authored and `tsc→dist` build-checked but
  never run. A later instruction: support Docker "for all stages, best practices, tested and
  guaranteed" **and** keep a no-Docker option for constrained devices.
- Decision:
  - **Native and Docker are co-equal, documented local workflows.** Neither is deprecated. The
    native path (`pnpm dev:up` → `pnpm dev`) stays the lowest-footprint option; Docker
    (`docker compose up`) is the one-command isolated option.
  - **Two compose files at the repo root**, replacing `deploy/docker-compose.yml`:
    - `compose.yaml` — development (bind-mount + hot reload; pg/redis published, overridable);
      `name: carrental-dev`.
    - `compose.prod.yaml` — production-**shaped** (compiled images, auto `migrate` + seed
      `system`, `seed-dev` behind the `tools` profile); `name: carrental`.
      Repo-root placement is required: Compose resolves `.env` (for `${VAR}` interpolation) from
      the project directory, i.e. the first compose file's directory.
  - `deploy/` keeps the build inputs: `Dockerfile.api`, `Dockerfile.web`, `nginx.conf`,
    `postgres-init.sql`, `RUNBOOK.md`.
  - `scripts/dev-up.sh` / `dev-down.sh` branch on a **reachable** daemon (`docker info`), not
    just the CLI, and honour `DEV_UP_FORCE_NATIVE=1`.
- SRS clauses affected: SRS §17.6 deploy topology now has a live-verified container stack
  (traceability row updated from "build-checked" to "live-verified"). No change to app
  behaviour, DEC-004/018 (single Vite SPA served by nginx in prod) still hold.
- Source IDs: SRS §17.6, §22.4, SRS-NFR-005, DEC-013, DEC-014.
- Consequences: `deploy/docker-compose.yml` removed; `RUNBOOK.md` / `README.md` / traceability
  updated; BuildKit (`docker-buildx`) required to build the images. Defect D-008-1 (stale
  bind-mounted `*.tsbuildinfo` → empty `dist_*` volume) fixed in the `deps` one-shot.

---

## Enhancement program (STAGE-009..013) — see `enhancement-program.md`

### DEC-023 — Public site on Next.js (supersedes DEC-004 for the customer surface)

- Date: 2026-09-07 (enhancement program)
- Context: DEC-004 chose one React + Vite SPA for both surfaces, citing an explicit earlier user
  constraint and the ~1.9 GB RAM authoring host, and deferred SSR/SEO "to release hardening if
  needed". A later explicit instruction: **"ensure all public-facing pages use Next.js"** and be
  optimized for SEO / metadata / indexing / performance. Confirmed with the user: **public site
  only** — not the dashboard.
- Decision: New `apps/site` = Next.js (App Router, TS strict) hosting the **entire customer
  surface** (the current `/` route tree) with SSG/ISR, `/[locale]/` routing, and full technical
  SEO. `apps/web` (Vite SPA) is reduced to **`/ops` only** and overhauled in place (STAGE-012).
  Shared design system in `packages/ui` + new `packages/theme`; shared contracts + i18n. In
  prod both sit behind one proxy/origin (`/` → site, `/ops` → web, `/api` → API) so the
  `SameSite=Lax` refresh cookie (DEC-021) is unaffected.
- SRS clauses affected: SRS-CMP-WEB "React Router routes" → Next.js App Router for the customer
  surface (SRS-CMP-OPS unchanged). SRS-UI-014 hydration-warning assertions now **do** apply to
  `apps/site`.
- Source IDs: explicit user instruction (2026-09-07), SRS §5.2, SRS-UI-001..015, SRS-NFR-005,
  DEC-021.
- Consequences: DEC-004/018 remain in force for `/ops`. New `deploy/Dockerfile.site`, compose +
  nginx routing changes, `RUNBOOK.md` update. RAM risk handled by building/running `apps/site`
  in the Docker `build` stage / dev container (DEC-013).
- STAGE-011 inc.1 (2026-09-07): `apps/site` scaffolded + home/search/vehicle-detail/help/legal
  shipped; `next build` verified on the 1.9 GB host (peak ~870 MB). Edge-proxy consolidation +
  the authed flows + `apps/web`→`/ops`-only are inc.2.

### DEC-024 — Launch locales: en + ar + fr (closes the DEC-020 open question)

- Date: 2026-09-07 (enhancement program)
- Context: DEC-020 seeded `en`/`ar`/`fr` as **test/dev** locales and surfaced "confirm the real
  launch locale list" to the user. The user confirmed: ship **all three, fully translated**.
- Decision: `en` (default, LTR), `ar` (RTL), `fr` (LTR) are **production** launch locales. Every
  page/component/field/label/message/validation/option/UI element and every email/notification
  is authored in all three; no screen renders mixed-language or mixed-direction. `testOnly` is
  cleared for the three in the system seed. The dynamic add-a-locale + translation-catalogue
  machinery (SRS §9.2, `/ops/config/languages`) still lets the business add more with no code
  change.
- Source IDs: explicit user instruction (2026-09-07), SRS-I18N-001..009, SRS §21.1, BR-028,
  FR-GBL-002..005.
- Consequences: `verify:i18n` gate added; full string extraction (STAGE-010); RTL pass; QA
  matrix ×3 locales (STAGE-013).

### DEC-025 — Curated dashboard theming + branding, versioned via config

- Date: 2026-09-07 (enhancement program)
- Context: mandate for "professional customizable theming" + a branding section, applied to both
  the public site and the dashboard. User chose **curated controls** over raw-CSS/token-JSON.
- Decision: A `branding` `configVersion` kind (reusing the STAGE-006 draft→submit→approve→
  publish workflow + audit + `config.version.published.v1`) holds: brand colors
  (primary/accent/semantic, light + dark maps), radius scale, density (`comfortable|compact`),
  font key (curated set incl. an Arabic face), and logo/favicon/OG asset refs. `packages/theme`
  resolves the config to the shadcn CSS-variable set; `GET /api/v1/meta/branding` (public,
  ETagged) serves it; `apps/site` inlines critical tokens at build/ISR, `apps/web` applies
  pre-paint. No arbitrary CSS or script injection. Brand assets upload via `ObjectStoragePort`
  with MIME/size/dimension limits and SVG sanitisation. A `system` seed writes the default
  preset as published `branding` v1.
- Source IDs: explicit user choice (2026-09-07), SRS-UI-002, SRS-NFR-010/012, SRS-ADM-006,
  SRS-DAT-009, SRS-SEC-\* (upload hardening).
- Consequences: token duplication (`apps/web/src/index.css` + `packages/ui/src/styles.css`)
  collapsed to one source; `verify:theme` gate (AA contrast for presets, no literal colours);
  new `/ops/config/branding` + `/ops/config/seo` screens.

### DEC-026 — Single-origin local dev; dashboard on `:3100` under `/ops`

- Date: 2026-09-07 (enhancement program, STAGE-012 fix pass)
- Context: DEC-021 keeps one browser origin so the `SameSite=Lax` refresh cookie is first-party;
  DEC-023 split the customer surface (`apps/site`, Next) from the dashboard (`apps/web`, Vite,
  served under `/ops`). In prod the `edge` nginx is that origin. Local dev had no equivalent:
  `apps/web` ran on `:3000` standalone, `apps/site` was not started by `pnpm dev` at all, and a
  refresh on the dashboard hit the API from an origin the CSRF guard did not trust → the session
  was cleared on every reload. Nav also broke: `apps/web`'s router uses `basename: '/ops'`, but
  the nav targets still carried a literal `/ops`, resolving to `/ops/ops/…`.
- Decision:
  - `apps/site` (`:3000`) is the single dev origin. It proxies `/ops` → `apps/web` (`:3100`)
    and `/api` + `/health` → the API via `next.config.mjs` rewrites (`WEB_UPSTREAM`,
    default `http://localhost:3100`; `next dev` re-evaluates per request, a production build
    bakes it — so `Dockerfile.site` builds with `WEB_UPSTREAM=""` since the edge owns `/ops`
    there). The site `middleware` lets `/ops*` pass through untouched.
  - `apps/web` dev + preview move to `:3100` (was `:3000`); Vite `base` stays `/ops/`.
  - `pnpm dev` runs API + dashboard + site together; `pnpm dev:ops` is the lighter
    API-plus-dashboard flow.
  - Every `apps/web` route target is basename-relative (`/work`, not `/ops/work`); the same
    for the post-sign-in and post-recovery redirects.
  - `CORS_ALLOWED_ORIGINS` gains `http://localhost:3100` for direct dashboard-dev-server
    access; the single-origin flow does not need it.
  - The dashboard links out to the site via `VITE_SITE_URL` (default `/`, correct behind the
    edge; a full navigation, not an SPA route).
- Source IDs: user bug report (2026-09-07), DEC-021, DEC-023, SRS-SEC-003 (CSRF), SRS-UI-006.
- Consequences: `apps/web/vite.config.ts`, `apps/web/package.json`, `apps/site/next.config.mjs`,
  `apps/site/src/middleware.ts`, `deploy/Dockerfile.site`, `compose.yaml`, `.env.example`, root
  `package.json`, `e2e/playwright.config.ts` (`E2E_WEB_URL` default → `:3100`) updated. Verified
  in-browser: 40/40 route + session checks, 9/9 responsive-evidence checks.

### DEC-027 — Real Stripe adapter, dashboard-configurable (supersedes DEC-006's "stub" note)

- Date: 2026-09-12
- Context: DEC-006 shipped only the simulator; no Stripe code existed anywhere in the repo
  (verified by exhaustive search on user request). The user asked for a professional, fully
  dashboard-configurable Stripe integration — test and live accounts, including secret keys,
  switchable live against the simulator, with a deliberately narrower permission than every
  other admin action, and guaranteed correctness across every payment scenario the system has.
- Decision:
  - `StripePaymentAdapter implements PaymentPort` — the same port DEC-006 defined, so the
    simulator and Stripe are interchangeable from every caller's point of view. Constructed with
    an already-configured `Stripe` client (dependency injection), not reading credentials itself.
  - Runtime driver selection is DB-backed and dashboard-editable (`payment_provider_config`
    table, one row per org), not a static NestJS DI binding or an env var — a new
    `RoutingPaymentAdapter` resolves the active adapter fresh on every call (never cached; a
    switch must take effect on the very next payment, not the next deploy).
  - Secret keys are AES-256-GCM encrypted at rest (`PAYMENT_CONFIG_ENCRYPTION_KEY`, same operator-
    secret tier as `PASSWORD_PEPPER`), and validated with a real, side-effect-free
    `stripe.balance.retrieve()` call before being stored — a bad paste is caught at save time, not
    at a guest's checkout.
  - `payment.manage` is deliberately excluded from every role's blanket `'ALL'` grant — only
    `administrator` holds it (a new, stricter allow-list pattern than the existing `audit.manage`
    precedent, which both `administrator` and `manager` get) — plus `@StepUp()` on every write.
  - Off-session saved-payment-method reuse (Stripe Customer + `setup_future_usage: 'off_session'`
    on the first charge) lets extend/modify charges reuse the card already on file with no new UI.
  - Webhook signature verification (`req.rawBody`) + idempotent event dedup (existing
    `IdempotencyService`); any local/remote ledger mismatch opens a `reconciliation_exception`
    for human review rather than auto-correcting — same rule this app already applies to every
    other money discrepancy.
  - Disclosed, deliberate scope boundary: a PaymentIntent returning `requires_action` (3-D Secure)
    is mapped to a decline rather than driving a client-side confirmation/redirect flow — that is
    a materially different, larger checkout architecture than this system's current single-
    request confirm flow.
- Source IDs: user request (2026-09-12, Telegram), DEC-006, SRS §4.3/§12.3, FR-PAY-010,
  SCREEN-OPS-041.
- Consequences: `apps/api/src/modules/payment/{stripe-payment.adapter,payment-config.service,
routing-payment.adapter,payment-config.controller,stripe-webhook.controller}.ts`,
  `apps/api/src/common/crypto/secret-cipher.ts`, migration `0021_fresh_warbird.sql`,
  `apps/web/src/surfaces/ops/payments-page.tsx`, `apps/site` checkout (`@stripe/react-stripe-js`
  Payment Element, deferred/no-`clientSecret` pattern) and trip-extend token omission. 18 backend
  unit tests + 8 integration tests added, zero regressions in the full API suite. No live Stripe
  test-mode account was available to verify against the real Stripe API end-to-end — the adapter
  is verified against the documented Stripe error/response shape and a mocked SDK client only.

### DEC-028 — Audience-scoped sessions and a refresh that never signs the user out by accident

- Context: the ops dashboard (`/ops`) and the customer site share one origin, so one refresh
  cookie / CSRF cookie / localStorage hint served both — a customer sign-in replaced a staff
  session, a customer sign-out ended it, and the dashboard's refresh could return a customer
  actor. Separately, refresh-token rotation was non-atomic with no grace window (two tabs, a retry
  or a lost response revoked the whole family), and the client treated _any_ refresh error
  (network, 5xx, API restart) as a logout, clearing the hint in every tab.
- Decision:
  - Cookies are per audience: `carrental_rt_{staff|customer}` / `carrental_csrf_{staff|customer}`;
    the client sends `X-Auth-Audience` on `/auth/*` (`configureClient({ audience })`), the API
    resolves the pair from it (falls back to the only cookie present, never guesses when both are)
    and rejects a session whose audience differs. localStorage hint and applied-locale keys are
    per audience too. Legacy shared cookies are cleared on the next sign-in/out.
  - `SessionService.rotate` runs in one transaction holding a row lock on the presented token.
    A token rotated within `REFRESH_REUSE_GRACE_SECONDS` (20) yields a sibling session in the
    same family; a replay after the window (or of a token revoked for another reason) is theft →
    family revoked. Absolute lifetime `REFRESH_ABSOLUTE_TTL_DAYS` (90) from the family's first row;
    `REFRESH_TOKEN_TTL_DAYS` (30) remains the idle window. Refresh also rejects suspended/closed
    accounts and clears the cookies on a definitive 401. Dead sessions are pruned opportunistically.
  - Client (`AuthProvider`): only a 401 from `/auth/refresh` ends the session; network/5xx/429 are
    retried inline (400/1200/3000 ms) then in the background (bounded backoff) and on `online` /
    tab-visible / focus, keeping the hint. Refresh is serialised across tabs with Web Locks and the
    winner shares the session over a `BroadcastChannel`; a queued tab skips a redundant call.
    The mobile provider follows the same 401-only rule.
- Source IDs: user request (2026-09-19, Telegram), SRS-SEC-002/003.
- Consequences: `apps/api/src/common/{auth/session.service,security/*}`, `modules/iam/*`,
  `packages/client/src/{config,api-fetch,session-sync}.ts`, `react/auth.tsx`, mobile
  `lib/api/*` + `lib/auth/auth-provider.tsx`; tests `apps/api/test/session-resilience.spec.ts`,
  `packages/client/src/react/auth-session.test.tsx`. Users signed in before the deploy are asked
  to sign in once (cookie names changed). Not covered: session-list UI, reuse-event alerting.

### DEC-029 — One location filter, one scope policy

- Context: the ops console had a global location switcher AND a per-page location filter on five
  pages (seeded once from the switcher, never kept in sync), built from the public customer
  endpoint (active only, cached 5 min, not refreshed when a location changed) and the session's
  stale copy of the account's scope. Backend scope was enforced by pickup branch only and in six
  modules; reports labelled organisation-wide figures "Scoped to X"; several org-wide areas
  (audit, payments, settings, rate plans, products, staff directory) ignored the account's
  location scope entirely; archived branches could still receive cars; "no location selected"
  meant "every location" (fail-open) in the staff and product editors.
- Decision (web):
  - **One filter** in the top bar (`LocationSwitcher`, multi-select, searchable, always visible,
    short code on phones). Its state IS the URL (`?location=LHR,JFK`) on branch-aware pages
    (`isLocationScopedPath`: dashboard, search, reservations, rentals, fleet, reports, rate
    plans); the last choice is remembered per account and re-applied. Pages have no location
    filter of their own. It is inactive (with a tooltip) elsewhere, and a single reachable branch
    shows as a badge.
  - Options come from `GET /ops/locations/options` — `{ restricted, options }`: active AND archived,
    narrowed to the account's scope as of the request — so a scope change (and the navigation /
    picker rules that follow `restricted`) applies on the next refetch/focus, not at next sign-in. Codes the account can't see are dropped from the URL with a notice; a 403 on a list
    offers "show all my locations". Location mutations invalidate every cached list.
  - Editors (staff, product) use an explicit **All locations / Specific locations** choice, never an
    empty checklist; a limited account can't grant or pick "all". Rate plans/products: a limited
    account can only choose its own branches. Row actions that belong to one branch (assign, pickup
    = pickup branch; return = return branch) are hidden elsewhere.
  - Organisation-wide areas are hidden from a limited account's navigation and answered with an
    explanation (`OrgWideGate`) — mirroring `@OrgWide()` on the API.
- Decision (API): `effectiveLocationCodes()` (comma-separated `locationCode`, validated against the
  actor's scope, 403 not silent-empty) is the single entry point for lists, dashboard, search,
  reports. A reservation/rental belongs to its pickup AND return branch (`assertRecordInScope`,
  per-action mode); the work queue and pickup/assign remain the pickup branch's, return the
  return branch's. `@OrgWide()` refuses limited accounts on settings, audit, payments config,
  reconciliation/cases, data quality, reference-data writes, catalogue-setup writes, customer
  merge, location create/archive. Reports declare `location` vs `org_wide` (`REPORT_SCOPE`): location
  ones (incl. fleet utilisation, refunds) are narrowed truthfully; org-wide ones are refused to a
  limited account. Rate plans / products / holds / staff directory / locations list are filtered to
  the account's branches, and writes limited to entities pinned inside its scope. Archiving reports
  cars, staff scope, rate plans and products tied to the branch; cars can't be created at,
  transferred to or imported into an archived branch.
- Policy matrix (limited account): branch data (reservations, rentals, fleet, holds, search,
  dashboard, reports on location-keyed kinds) = own branches; shared reference reads (categories,
  lookups, public locations) = read; customers = org-wide directory by design (a customer rents
  anywhere); everything in `@OrgWide()` = refused.
- Source IDs: user request (2026-09-19, Telegram), FR-RPT-004, SRS-SEC-007, DEC-028.
- Consequences: `apps/api/src/common/auth/{location-scope,permissions.guard}.ts`, report / rental /
  reservation-ops / fleet / search / pricing / product / staff / availability / location-admin
  services, `apps/web/src/lib/location-{scope,hooks}.ts(x)`, `layouts/location-switcher.tsx`,
  `components/{location-scope-field,location-scope-gate,org-wide-gate,list-error}.tsx`; tests
  `apps/api/test/location-scope.spec.ts` and the web unit tests beside each. New env: none.
  Not covered: a transfer-request / receiving-branch approval flow (a product decision), and
  invoices/customers stay org-wide reads.

### DEC-030 — No hard-coded "second person"

- Context: config versions, message templates and customer restrictions refused the author as
  approver (`author_cannot_approve`). The owner wants no action to _require_ another person by
  default, and any review to be something they configure.
- Decision (phase 1 of `plan-workflows-roles-permissions.md`): the three author-exclusion checks are
  removed. A config revision can be published straight from `draft` (or from `in_review`);
  the review path (submit → approve/reject) stays available and optional; a template's author can
  publish it; any `customer.manage` holder can approve a restriction, including its author. Draft
  remains a content state (preview, diff, rollback). The `approval_required` error code stays in the
  contract for the upcoming workflow engine. The remaining guard rails are unchanged: only an
  administrator grants `administrator`, the last administrator can't be removed, step-up on
  payments/email config.
- Consequences: `config-version.service.ts` (`approve` accepts `draft`), `template.service.ts`,
  `customer-restriction.service.ts`; web `config-history.tsx` (Publish + Submit on a draft),
  customers restriction row; copy moved to new i18n keys (`*2`) — published translations from an
  earlier seed are not overwritten; tests `direct-publish.spec.ts` and updated specs.
  Not yet: a restriction is still created `pending_review` and needs one explicit approve click
  (it can be the author); the workflow engine (phase 3) makes "Direct" a real per-action choice.

### DEC-031 — Authorization v2: roles, assignments, overrides, teams, the matrix

- Context: roles were seed data; `staff_profile.role_codes` and `role.permission_actions` were
  unvalidated free text; `approvalLimitMinor` was stored and never enforced; two permissions were
  never checked; the UI's copy of a person's permissions went stale; no per-person exceptions, teams,
  time-bound access or "who can do X".
- Decision (phase 2 of `plan-workflows-roles-permissions.md`):
  - **Model.** `staff_role_assignment` (real FK to `role`, optional start/end) replaces the free-text
    role list; `staff_permission_override` (allow / deny, optional expiry, reason); `staff_group` +
    members; `role` gains `locked`, `conditions`, `archived_at`. Migration 0030 backfills assignments,
    locks system roles, drops `role_codes` and `approval_limit_minor`, and removes the dead
    `rental.extend.approve` / `reservation.override`.
  - **Evaluation** is one pure module (`common/auth/access-graph.ts`): union of active assignments,
    minus DENY overrides (deny always wins), plus ALLOW overrides; the wildcard `*` (administrator)
    expands to the catalogue at request time; when several roles grant an action the most permissive
    limit wins. `AccessService` loads it per request (no cache yet: a change applies to the next call).
  - **Conditions.** A role's grant may carry `amountMinorMax` (today: `payment.refund`); the manual
    refund endpoint refuses above it (`over_limit`).
  - **Administration** (`AccessAdminService`, `admin/*`): roles CRUD/clone/archive (system roles
    read-only, cloneable), bulk matrix change with a dry-run preview, assignments and overrides per
    person, teams, users×permissions matrix, who-can, explain, access history, `GET /auth/me/access`.
    Every write is validated against the live catalogue, audited, step-up protected, and guarded: no
    granting what you don't hold, no changing your own access, roles in use can't be archived, and at
    least one active person must always be able to manage access. The new endpoints are `@OrgWide()`.
  - **Catalogue** is kept honest at boot (`PermissionCatalogueService` adds any action a decorator
    names and the catalogue lacks) and by a test.
  - **UI** `Administration → Access`: roles × permissions grid (edits staged, reviewed via dry-run,
    then saved), people × permissions grid with sources, per-person sheet (roles incl. time-bound,
    allow/deny exceptions, effective permissions), teams, history. The auth provider re-reads the
    person's access on focus so the UI stops trusting the sign-in snapshot.
- Not yet (later phases): granular split of `config.publish`, a Redis cache with invalidation,
  workflow steps addressing roles/teams/people, per-assignment location scope.
- Consequences: `apps/api/src/common/auth/{access-graph,access.service,permission-catalogue.service}.ts`,
  `modules/admin/{access-admin,staff}.service.ts`, migration `0030_*`, seeds (`staff-roles.ts`),
  web `features/access/*`, `lib/access-hooks.ts`, `packages/client` auth provider; tests
  `access-graph.test.ts`, `access-admin.spec.ts`, web matrix/roles/user-sheet tests.

### DEC-032 — Workflow engine core: configurable approval pipelines (plan phase 3)

- Context: "another person must review" was hard-coded three times (config versions, templates,
  customer restrictions); there was no way to ask a role or a named person, "all of these", or an
  amount-based route, and nothing that reminded, escalated or timed out.
- Decision (phase 3 of `plan-workflows-roles-permissions.md`):
  - **Definitions are data.** `workflow_definition` + immutable `workflow_definition_version`
    (`spec` JSON, shape and graph rules in `@carrental/contracts` `workflow.ts`, shared by API and
    dashboard). Steps: `approval`, `task`, `auto` (notify), `condition` (JSON-logic), `wait`,
    `parallel` (branches of inline steps, join all/any). Actors per step: roles (by code), named
    people, teams, or dynamic (`initiator`, `subject_owner`), with modes any / all / quorum N / in
    order, "exclude the requester" (off by default), "must be in the record's location". Every
    definition has mandatory **fallback actors**. Built in: **Direct** (no steps) and **Two-person
    review**; both are per-organisation, created at boot, and cannot be edited (clone them).
  - **Bindings.** `workflow_binding` attaches a definition to a governed action, optionally with a
    condition and priority; none = Direct. Highest matching priority wins.
  - **Governed actions are declared in code** by the module that owns the change and registered at
    boot (`WorkflowPublic.register`): key, variables, `fingerprint` (stale detection), `execute`
    (idempotent), `onClosed`. Phase 3 wires `config.version.publish`, `template.publish` and
    `customer.restriction.activate`.
  - **Runtime.** `WorkflowEngineService.gate()` → Direct (caller applies inline, as before) or a
    captured request (`workflow_instance`, one open per subject by a partial unique index). Every
    decision is one transaction that locks instance → task → assignee, re-checks eligibility, and
    settles the step by mode; the last step hands the change to the executor once, after commit
    (`apply`, retried with backoff on failure, never asks approvers again). A subject that changed
    after the request closes it as `stale` (409). Changes-requested returns the draft to its author
    (bounded by `maxRevisions`). Security-critical actions can never be approved by their subject.
  - **Time.** The worker ticks every 30 s (`engine.tick`): releases waits, reminds, escalates or
    auto-approves/rejects overdue tasks, refreshes who is eligible (a suspended approver drops out, a
    new role holder is added, nobody left → fallback), retries failed applies. Everything is derived
    from rows, so a missed or doubled tick is harmless.
  - **Notifications** are email only via a port (`WorkflowMessenger`, implemented by
    `NotifyPublic`); the in-app side is the task list and the header bell.
  - **Behaviour changes.** With nothing bound: publishing is direct (as after phase 1) and a new
    customer restriction is now **active at once** instead of waiting for one "approve" click.
    Legacy `approve` / `reject` endpoints act on the open request when the caller is one of the
    people asked; restrictions still `pending_review` from before can be decided as before.
  - **Permissions.** `workflow.manage` (administrator only; define, publish, bind — step-up) and
    `workflow.monitor` (see all requests, cancel, force through, reassign — audited, reasons required).
    Deciding needs no permission: it is by assignment.
- Not yet (later phases): the visual pipeline builder, versions diff/rollback UI, import/export,
  conditional-binding editor (phase 4); refunds with amount bands, rate plans, translations,
  cancellations, extensions, merges, archives, staff access changes, recovery cases (phase 5);
  delegation / out-of-office, business-hours due times, digest notifications, keyset pagination on
  the inbox, property-based and two-organisation isolation tests (phase 6).
- Consequences: `apps/api/src/modules/workflow/*`, `modules/notify/notify.public.ts`, migration
  `0031_workflow_engine.sql`, seeds (`workflow.manage`, `workflow.monitor`), worker `workflow-tick`,
  config/template/customer services, `packages/contracts/src/workflow.ts`, web
  `features/workflows/*` and `lib/workflow-hooks.ts`; tests `workflow.spec.ts`, `workflow.test.ts`.

### DEC-033 — Workflow builder, and tabs instead of dropdowns (plan phase 4)

- Context: phase 3 let an owner bind a built-in workflow to an action; changing who is asked, in what
  mode, with what rule, still needed code. Separately, dropdowns were used to switch views on some
  pages (`StateSwitcher` collapsed into a select on phones) and to pick values in forms — which hides
  the choices and reads as a form field, not as navigation.
- Decision:
  - **Builder** (`Administration → Workflows → open a workflow`): the pipeline is an ordered list of
    step cards. Where a step goes next follows the order unless the step says otherwise
    (`editor model`: `next` absent = "the following step"), so dragging, inserting or deleting never
    leaves a dangling pointer; `toSpec` / `fromSpec` convert to and from the saved graph and are
    round-trip tested. Reorder by drag, by keyboard (dnd-kit), or by up/down buttons.
  - **Editing** one step in a side panel: name, who (roles, named people, teams, requester / owner),
    how many (any / all / N / in order), exclude the requester, location cover, send-back and comment
    rules, deadline (reminders, escalate / wait / auto-approve / auto-reject), notify, wait, branch on a
    rule (form for the common shape, read-only JSON for anything fancier — never silently rewritten),
    parallel routes (join all / any).
  - **Check & test**: graph rules run instantly in the browser (shared `validateWorkflowGraph`), the
    server checks people and variables shortly after typing stops; publishing is blocked while anything
    is wrong. The simulator runs the _unsaved_ pipeline against real people. **Versions**: every saved
    version with a step-level diff; restore copies an old one into the editor as a new draft. **Import /
    export** as JSON, all-or-nothing. **Templates** for a new workflow. Unsaved changes are guarded.
  - **Tabs, not dropdowns.** `StateSwitcher` is now tabs everywhere (they scroll sideways on a phone; the
    old collapse to a select is opt-in and unused). A new `ChoiceTabs` / `ChoiceField` picks one value as
    a radio group styled as tabs (or as a described list) and replaces the selects in: assigning a role,
    choosing a permission for an exception (module tabs → permission list), the phone role matrix, and
    choosing which workflow governs an action. Panels are switched with tabs; values are chosen with
    `ChoiceTabs`.
- Not yet: a visual graph view (`@xyflow/react`), conditional-binding editor (several bindings per
  action with rules — the API supports it), and the phase 5 / 6 items in DEC-032.
- Consequences: web `features/workflows/builder/*`, `builder-page.tsx`, `clone-dialog.tsx`,
  `new-workflow-dialog.tsx`, `components/choice-tabs.tsx`, `components/state-switcher.tsx`,
  `features/access/*`; API `GET /admin/workflows/options`; new web dependency `@dnd-kit/*`; tests
  `builder/model.test.ts`, `builder/builder-components.test.tsx`, `choice-tabs.test.tsx`.

### DEC-034 — Remaining actions, routes, delegation, business hours, paging (plan phases 5–6)

- Decision:
  - **More governed actions**: `payment.refund`, `reservation.cancel.withFee` (staff cancellations where a
    late fee applies or is waived; a customer's own cancellation is never held), `rateplan.publish`,
    `translation.publish`, `rental.extend` (staff), `location.archive`, `customer.merge`,
    `staff.access.change` (security-critical: the subject can never approve) and
    `recovery.case.resolve`. Each domain method splits into a request-time part (validation, refusing the
    impossible up front) and an `…Now` part the executor calls; with no binding the request-time part
    simply runs it (`WorkflowPublic.govern`).
  - **Executor identity**: the executor acts with a snapshot of the requester's rights (taken when they
    asked) under the final approver's name (`asActor`), so nothing is re-checked against today's rights and
    nothing is granted beyond what the requester could do. Refund and rental effects are idempotent per
    request (a retry after a failure never moves money twice).
  - **Routes**: an action may have several bindings with conditions and priorities; the dashboard has a
    routes editor. The per-role refund cap applies to direct refunds.
  - **Delegation** (`workflow_delegation`, `assignee.on_behalf_of`, migration 0032): time-boxed (≤ 90 days),
    revocable, never transitive, no loops; delegate rows mirror the person covered (counted once in ALL /
    quorum) and are kept in step by the reconciler; the requester exclusion and the security rule still
    apply to delegates; history records "decided by X on behalf of Y".
  - **Business hours**: `due.businessHours` / `wait.businessHours` count the request's location hours,
    closures and time zone (pure calculator, tested across weekends, half days and daylight saving).
  - **Inbox** pages by keyset (deadline, created, id) — overdue first, stable while tasks change.
  - **Diagram**: a read-only layered Flow view beside the editable list.
- Tests: `workflow-actions.spec.ts`, `workflow-delegation.spec.ts`, `workflow-isolation.spec.ts` (two
  organisations), `workflow-load.spec.ts` (6,000 open requests), `business-hours.test.ts`,
  `flow-layout.test.ts`, property tests (`workflow.property.test.ts`, `model.property.test.ts`) and
  Playwright flows (`e2e/tests/workflows.spec.ts`, phone + laptop + Arabic, run with the machine's own
  Chrome via `playwright.workflows.config.ts`).
- Not yet: digest emails / SMS / push, per-assignment location scope, editing by dragging connectors in
  the diagram, and governing role / permission-matrix edits (they keep their own guard rails).

### DEC-035 — The reporting hub: one definition of every number

- Status: accepted (2026-09-21). Replaces the four single-table reports (they still run, so existing
  schedules keep working, but are no longer offered).
- Why: the old reports were a table of keys ("totalMinor") with no period, no comparison, no currency
  and no way to tell what a number meant. A manager needs to answer "how did we do in _this_ period,
  compared with _that_ one, and where did it come from" — and to trust that a card, a chart and a table
  that show the same number agree.
- Decisions:
  - **Six reports** answer for a period — overview, sales & revenue, bookings, fleet utilisation,
    payments & refunds, operations — plus the two whole-organisation checks (open cases, data quality).
    The overview is built _from_ the other reports' measures, so it cannot disagree with them.
  - **Time frame.** A period is whole calendar days in the report's time zone, both ends included.
    Presets (today … last year) are resolved on the server against "today" in that zone, so a schedule
    means the same thing whenever it runs. A period longer than two years, or with the end before the
    start, is refused. The zone is the branch's when one branch is chosen, else the one most branches in
    scope use (ties alphabetical) — and is always shown.
  - **Comparison.** "Previous" is the calendar period before for calendar presets (last month → the month
    before), the same number of elapsed days at the start of the previous one for running presets
    (this month so far → the same days last month), else the same number of days straight before.
    "Same period last year" shifts the dates by 12 months. Change is relative (%), except for shares,
    which move in points; colour says good/bad for the business (`betterWhen`), the arrow says which way.
  - **Date basis** (booking date / pick-up date / return date) is an explicit choice on the reservation-
    based reports, defaulting to booking date, and is printed on the report.
  - **Sales** count confirmed and completed bookings, revenue **without tax**; tax, cancellations and
    no-shows are shown beside it, never inside it. **Payments** are on a cash basis (the day the ledger
    records the capture or refund). **Fleet**: utilisation = rented days ÷ rentable days (fleet days minus
    blocked days); earned revenue spreads a trip's price over its days; RevPAC = utilisation × ADR;
    vehicles belong to their home location and the fleet is today's fleet.
  - **Money is never added across currencies**: the report is in one currency (asked for, else the
    organisation's, else the busiest), the others are listed as left out, and can be switched to.
  - **Scope**: every analytic report is limited to the branches the person may see (a narrower request
    is allowed, a wider one is a 403).
  - **Preview vs run**: changing a filter previews (nothing stored, nothing audited); exporting saves a
    run (audited, listed under Recent runs, reopenable exactly as shown). Schedules store a _relative_
    period.
  - **Export** is a spreadsheet built from the figures on screen: who/what/when at the top, summary,
    trend, each breakdown and the detail, words for headings, plain numbers, money in major units,
    UTF-8 with a byte-order mark.
- Consequences: migration 0033 (`report_run.summary`); `POST /ops/reports/:code/preview`,
  `GET /ops/reports/runs/:id`; the result contract lives in `@carrental/contracts` (`report.ts`).
- Tests: `period.test.ts` (time-frame arithmetic), `report-analytics.spec.ts` (every figure agrees with
  every other place it appears; scope; refused periods), web unit tests for formatting, params and the
  spreadsheet, Playwright flows (laptop + phone).

### DEC-036 — Operator-managed currencies, and what Stripe is told

- Context: money was already "integer minor units + a currency code", and rate plans and extras already
  carried a currency, but the system behaved as if there were one: `÷ 100` was written in the site, the app,
  the dashboard and server messages (wrong for a zero-decimal currency such as JPY), a new price list in a
  second currency would have retired the first, the dashboard added takings across currencies, and
  customers had no way to choose a currency. Stripe only ever received `reservationReference`.
- Decisions:
  - **One catalogue of currencies** (`@carrental/i18n` → `currency.ts`): ISO code, name, decimal digits.
    It is limited to currencies whose minor unit equals Stripe's smallest unit, so an amount never needs
    rescaling on the way to Stripe. Three-decimal currencies (KWD, BHD, JOD, OMR, TND — Stripe wants a
    multiple of 10) and Stripe's special cases (ISK, UGX, HUF, TWD) are left out on purpose; adding them
    later is a catalogue edit plus a rounding rule. Every conversion — display, form input, server
    sentence, Stripe amount, webhook comparison — goes through this module; no `÷ 100` anywhere.
  - **Operators manage currencies from Settings → Currencies.** Storage stays the `currency` reference-data
    list (so rate plans, extras and `assertLookupCode` are untouched); the page only adds the rules: only a
    catalogue currency can be added (no free text), exactly one default that is always enabled, and a
    disabled currency stays valid for reservations already made in it. Names come from `Intl.DisplayNames`
    per enabled language — nothing to translate by hand. Migration 0034 is data-only: the five seeded
    currencies stop being "system managed" and the organisation's currency becomes the flagged default.
  - **Price lists per currency, no automatic conversion.** A rate plan and an extra are each priced in one
    currency; a customer picks a currency and gets the price list in it. No list in it → the default
    currency, and the option says which currency it is in. We do not convert with exchange rates: a rate
    goes stale, someone has to own it, and charging a converted price is a decision to make deliberately,
    not on day one. Publishing a price list supersedes only lists in the **same** currency.
  - **A booking keeps the currency of its quote** through payment, extension, change of dates, refund and
    invoice. Existing reservations are re-priced strictly in their own currency, even after that currency
    has been disabled.
  - **The customer's choice is a cookie** (site) / stored preference (app), read by the server-rendered
    search page; a stale choice quietly resolves to the default. The switcher lists only currencies that
    are enabled **and** have a live price list.
  - **Stripe gets identifiers, never facts that change.** On the PaymentIntent: `reservation_reference`,
    `payment_id` (our ledger row), `purpose`, `customer_id` (our account id, or `guest`), `channel`,
    `quote_reference`, `env`, `source`, and a description such as "Booking RES-…". The saved-card Stripe
    Customer carries ids only — no name, email or phone. Refunds carry the same reference and payment id.
    Names, dates, plates, prices and locations are not sent: they change, and a stale copy in Stripe is worse
    than none. Amount and currency are Stripe's own fields. Each payment records whether it went through
    the test or live key (`payment_intent.provider`).
  - The dashboard headline revenue is the default currency alone, with other currencies listed beside it.
- Known limits: a role's refund limit is one number applied to the raw minor units of whichever currency is
  refunded (no conversion); Stripe Customers are still created per reservation, not per account.
- Tests: `currency.test.ts` (catalogue agrees with ICU, integer-only parsing/formatting, Stripe gate),
  `stripe-payment.adapter.test.ts` (what Stripe is sent, and not), `currency.spec.ts` (which currencies can
  exist, price lists coexisting, the customer's choice, a EUR booking, disabling without stranding anything).

### DEC-037 — Text typed on the dashboard is translatable like categories and features

- Context: category and feature names were translatable on the Translations screen and seeded in
  French and Arabic, but the other text a customer reads that a dashboard user types — a branch's name
  and its pickup / return instructions, the name of an extra — was English only, in every language.
- Decisions:
  - Two more database-backed translation namespaces, `catalogue:location` (key = branch code; the
    instructions are `<code>.pickup` and `<code>.return`) and `catalogue:product` (key = product code).
    The English stays on the row; every other language is a `translation` row. They appear on the
    Translations screen with no code change, and a branch or extra added later shows up as "missing" for
    each language straight away — the same machinery as `lookup:*`, categories and features.
  - `GET /config/locations` and `GET /catalogue/products` take an optional `locale` and return the
    published translation where there is one, else the English as typed (the language's own fallback
    chain applies). Drafts are never served. Staff endpoints are unchanged: the dashboard shows the
    text as typed.
  - The published-text lookup that `CatalogueService` had privately now lives in `LocaleRepo` and is
    shared by all of these.
  - Seeds: French and Arabic for every seeded branch, its instructions, and every seeded extra
    (`reference-i18n.ts`, checked by `reference-i18n.spec.ts`); and every currency in the reference
    data is named in French and Arabic from ICU data, so a currency enabled from the dashboard is not
    "missing" either.
  - **The public bundle always carries the app's own strings.** `GET /meta/translations` now returns the
    bundled text for the language with the published database overrides on top (an override wins). A
    build that adds strings is therefore translated the moment it runs — before the seed catches up,
    and on a database seeded by an older build — instead of showing raw key names ("Title",
    "Subtitle") on the dashboard. The seed still writes the rows so the Translations screen shows
    them; deploy runs it automatically.
  - Currency names are seeded from ICU for every **active** language, not only fr/ar.
- Known limit: an extra's name on an already-made reservation is the English snapshot taken at
  booking, by design (a booking keeps the terms it accepted).
- Tests: `entity-translations.spec.ts` (served per language, English fallback, drafts unserved, a new
  branch appears to translate and is served once published, completeness of both namespaces).

### DEC-038 — Routes customers and staff both use need a staff permission

- Context: the routes a customer uses on their own reservation or rental (`GET /reservations/:ref`,
  `…/cancel`, `…/modify`, `GET /rentals/:ref`, `…/extend`, `GET /bookings/:ref`) are the ones the
  dashboard calls too. The ownership check (`assertOwnerOrStaff`) only asked "is this staff?", and
  `PermissionsGuard` lets a signed-in user through any route that declares no permission — so a role
  holding NO reservation or payment permission (an audit used `config.read` only) could read, cancel and
  fully refund any booking. The route-manifest test that CLAUDE.md said guarded this snapshotted only
  method and path.
- Decisions:
  - `@StaffPermissions(...actions)`: customers pass straight through to the service's ownership check; a
    staff actor needs one of the actions. Applied at the controller, not in the service — the deferred
    (workflow-approved) executions and the services' own internal calls are untouched.
  - The sets mirror what the dashboard and the matching `/ops` route already require: view =
    reservation.read | modify | cancel; invoices = reservation.read | payment.read | payment.reconcile;
    cancel = reservation.cancel | modify; modify = reservation.modify; rental view = rental.read | pickup |
    return; extend = rental.pickup | return. **Cancel deliberately accepts `reservation.modify`** — the
    dashboard's own Cancel button and `/ops/.../no-show` do, and `support_staff` cancels today.
  - The route manifest now records each route's guards (public / optional / audience / permissions /
    staff-permissions / org-wide / step-up / rate-limit), read from the same Nest metadata the guards read.
    It fails on a dropped guard, requires `@Permissions` on every `/ops` and `/admin` route (two named
    exceptions) and makes every signed-in route without a permission choose: one audience, or own-data-only.
- Known limit: a modify-only role can still cancel (as the dashboard already lets it). Tightening that is
  one decorator plus the dashboard's `canCancel`. Authenticated routes still default to "allow"; the
  manifest census is what stops a new one slipping through.
- Tests: `staff-permission-gate.spec.ts` (role matrix, no side effects on refusal, owner / stranger /
  guest), `route-manifest.spec.ts`.

### DEC-039 — Stripe webhooks: a failed delivery is retried, and disputes reach finance

- Context: a delivery that failed was stored `failed`; Stripe's retry then found that row and was answered
  `200 handled:false, replay:true` — the event was lost for good after one transient error. Chargebacks
  (`charge.dispute.*`) were not handled at all.
- Decisions:
  - `IdempotencyService.begin({ retryFailed: true })` takes over a `failed` claim — or an `in_progress` one
    older than five minutes (its owner died) — in one atomic statement, so of several concurrent retries
    exactly one runs. Only the webhook opts in; client commands still replay their stored result.
  - The five `charge.dispute.*` events open ONE `dispute` reconciliation exception per dispute, carrying the
    reason, status and evidence deadline (`detail`); later events refresh it; once finance has resolved it, a
    further event (a loss, say) opens a fresh one. The ledger is never edited by a dispute.
  - A payment still `requires_action` is a legitimate place for a failed / cancelled payment to be (a
    customer who fails or abandons a bank challenge), so it no longer raises "missing in ledger".
  - The dashboard labels the new kind and shows the deadline; `missing_in_ledger` / `missing_in_provider`
    had no label (a raw key) and now do.
- Operator step: subscribe the webhook endpoint in the Stripe dashboard to `charge.dispute.created`,
  `.updated`, `.funds_withdrawn`, `.funds_reinstated`, `.closed` — an event Stripe is not asked to send
  cannot be handled (deploy/RUNBOOK.md).
- Known limit: evidence is still submitted in Stripe's dashboard; the exception queue is how finance learns
  of a dispute and its deadline.
- Tests: `stripe-webhook.spec.ts` (retry after failure, concurrent retries, abandoned claim, the dispute
  lifecycle, pending-challenge intents).

### DEC-040 — Card payments: 3-D Secure, and a throttled guest checkout

- Context: (1) a card whose bank asked the customer to authenticate was a flat decline, so SCA-mandated
  cards (most European cards) could not pay; (2) `POST /bookings/confirm` — reachable with no account, every
  call a card authorisation — had no rate limit (80 of 80 rapid calls went through: a card-testing vector).
- Decisions:
  - Only the checkout can run a challenge (`allowAction`). It answers `payment_action_required` (402) with
    the processor's client secret — nothing charged, no reservation, the hold still live. The client runs the
    bank's challenge (`stripe.handleNextAction`) and submits the SAME request again; `PaymentPort.resume`
    finds the authenticated payment and it is captured. A different card, or a changed total, since the
    challenge began drops that attempt and starts afresh (its own idempotency key). Modify, extend and
    off-session charges have no customer in the loop, so a challenge there is still a decline.
  - `packages/client` `submitWithBankChallenge` is that round trip, DOM-free so the app can reuse it.
  - `POST /bookings/confirm` has its own limiter (`RATE_LIMIT_BOOKING_CONFIRM_MAX` / `_WINDOW_SEC`, default 20
    per 60 s per client IP). The env flags now really honour `0` / `false` / `off` (`z.coerce.boolean()` made
    every string true, so the runbook's `RATE_LIMIT_ENABLED=0` emergency switch did nothing).
- Known limits: the mobile app does not run the challenge yet (`handleNextAction` from
  `@stripe/stripe-react-native` with the same helper — it could not be built or run where this was made), so
  it shows "your bank needs to confirm this payment". Verified with the simulator, a mocked Stripe client and
  unit tests; not against live Stripe. `trust proxy` counts one hop — behind a TLS terminator every visitor
  shares one bucket (deploy/RUNBOOK.md).
- Tests: `payment-sca.spec.ts`, `stripe-payment.adapter.test.ts`, `bank-challenge.test.ts`,
  `security.spec.ts` (checkout burst), `env.schema.test.ts`.

### DEC-041 — Data requests are fulfilled

- Context: FR-IAM-008 requests were only recorded. A closure was always "blocked" by a placeholder retention
  line, nothing moved a request past `received`, and there was no export, no erasure and no screen for staff.
- Decisions:
  - The whole feature lives in IAM (`privacy.service.ts`). A customer files; staff with `customer.manage`
    work the queue (`/ops/privacy-requests`, org-wide); a reply is due one month after filing.
  - **Access**: completing it releases a download built when the customer asks (current, never stored as a
    second copy), available 30 days, audited. **Correction**: completed with a note of what was fixed.
    **Rejection** needs a reason the customer can read. The customer is emailed (templated en / fr / ar).
  - **Closure** is blocked by what is really open — a current or upcoming reservation, an open rental, an
    unresolved payment issue — recomputed on every look, so it unblocks itself when the trip ends. Past
    records being retained is NOT a blocker. Completing it (fresh password required): the payment processor
    is asked to drop the saved cards FIRST (if it cannot, nothing changes and staff retry); then in one
    transaction the login is retired (sessions revoked, password and contact removed, the address freed), the
    profile, saved drivers and their documents are erased and messages sent to the person are redacted; the
    document files are deleted afterwards.
  - **Kept, on purpose**: reservations, rentals, invoices, payments, the per-reservation driver details on
    them, and the audit trail — financial and contractual records with a legal retention period. Erasing
    those is a separate, scheduled retention decision.
- Known limits: nothing yet erases the retained records when their retention period ends; the closure
  confirmation email is the one message that keeps the address (proof that we replied); audit events keep the
  display name the account had at the time.
- Tests: `privacy.spec.ts`, `iam.spec.ts` (TEST-IAM-008 rewritten — it asserted the stub), the web
  `privacy-page.test.tsx`.
