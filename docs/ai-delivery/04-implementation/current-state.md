# Current State

_Concise, authoritative. Update after every meaningful verified unit._

- **Approved scope:** Full system minus APP-CMOB frontend (see `selected-scope.md`). Backend,
  APP-CWEB, APP-OPS all in scope. Autonomous multi-stage build (user: "never stop before 100%").
- **Source versions:** FR 1.0, UI/UX 1.0, SRS 1.0 (v1.1 amendment docs drafted under
  `CR-20260907-001`; hashes in `source-manifest.md`).
- **Active stage:** STAGE-013 — System-wide QA & hardening (Enhancement Program). Closing out
  2026-09-08. STAGE-000..008 (SRS roadmap + containerization) and STAGE-009..012 (theming,
  i18n, Next.js public site, `/ops` UX overhaul) are **COMPLETE**.
- **Stage status:** STAGE-013 CLOSING — all `verify:*` gates green this session; widened QA
  screenshot matrix run; `defects.md` D-013-1..11 resolved.
- **Last completed (2026-09-08):** STAGE-013 hardening pass —
  - `verify:all` gates all green individually: `static` (after formatting 17 stale docs,
    D-013-7), `i18n`, `theme`, `unit` **89**, `api` **101** (Redis outage fixed + 2 timing-
    fragile tests hardened, D-013-9/10), `migrate` 4, `security` 13, `seo` (verify-seo.sh
    build-order fix), `e2e` **91** across phone/tablet/laptop, `a11y` 2, `perf` (D-013-6 —
    `apps/site` first-load JS ~430→~261 KB gz via the `packages/ui` CJS→ESM fix).
  - STAGE-012 close-out: `PageHeader` on 15/15 `/ops` screens (D-013-8); `FormLayout`/
    `DetailLayout` closed as an explicit no-build decision.
  - STAGE-013 QA matrix widened to all 16 `/ops` screens (was 3); site-header `link-name`
    a11y bug on phone found + fixed (D-013-11).
  - `openapi.json` regenerated (was missing the STAGE-005/006 deferred-feature routes);
    traceability matrix Enhancement section → all 10 mandate items VALIDATED.
  - **SCREEN-OPS-002 completed** — the `/ops` dashboard was a foundation slice (health only);
    now `GET /ops/dashboard` (`report.service.opsDashboard`, location-scoped) + real cards:
    today's pickups/returns (done/total), overdue, assign queue, finance exceptions, fleet
    readiness — each drilling to its queue. `report.spec` `SCREEN-OPS-002`; `verify:i18n` 779.
  - traceability matrix status sweep — ~10 stale `IN_PROGRESS` / `PARTIAL` labels on rows
    whose follow-up stage has since closed → `COMPLETED`.
- **Prior stages (Enhancement Program):** 009 theming/branding, 010 i18n (en/ar/fr),
  011 `apps/site` Next.js public site + full SEO, 012 `/ops` dashboard UX (DataTable / command
  palette / breadcrumbs). All COMPLETE — see each `stages/STAGE-0NN-*/checkpoint.md`.
- **Unresolved defects / blockers:** none. D-001..D-008 and D-013-1..11 all fixed.
  Environment-blocked (need CI / staged deploy, not code): Firefox/WebKit E2E, k6 write-path
  load, ZAP baseline, SAST — scaffolds in `e2e/playwright.config.ts` (`E2E_ALL_BROWSERS`) +
  `scripts/load/write-path.k6.js`; documented in `stages/STAGE-013-system-qa/release-readiness.md`.
- **Environment:** PostgreSQL 16 + Redis 7 — native (`scripts/dev-up.sh`, the low-footprint
  default, DEC-013) **or** containers (`docker compose up`, STAGE-008 / DEC-022); both verified.
  ~1.9 GB RAM host; API runs via `@swc-node/register` on source in dev, `tsc→dist` in the
  runtime image. Chromium-only E2E (Firefox/WebKit behind `E2E_ALL_BROWSERS`, CI-only).
- **Frontend stack (post STAGE-011 split, DEC-023):** customer surface = `apps/site`
  (Next.js 14 App Router, SSG/ISR, `/[locale]/` routing en/ar/fr, full technical SEO);
  operations dashboard = `apps/web` (Vite 5 SPA, `/ops` only). Shared: `packages/ui`
  (shadcn/ui primitives, now ESM — D-013-6), `packages/theme` (design-token engine),
  `packages/i18n`, TanStack Query, React 18 + TS strict.
- **DB state (dev):** migrated to `0006` (STAGE-007 added no migration); seeded system + development. Discovery fixture: 5
  vehicle categories, 8 features, ~54 units across JFK/LHR/PAR, one published rate plan (+ tiers)
  per category. `system` seed also loads 5 `report_definition` rows. Demo customer
  (`customer@example.test`) has a `customer` domain row and is a resettable fixture.
  `pnpm --filter @carrental/api db:reset` re-baselines everything.
- **What works now (STAGE-000 + 001):**
  - IAM: register→verify→sign-in→refresh(rotate/reuse-detect)→sign-out; recovery (neutral,
    single-use, revoke-all + security_alert); change-password; profile & preferences (optimistic
    `version`); saved drivers; account data-requests + closure blockers. argon2id + pepper,
    HS256 access JWT, opaque hashed rotated refresh sessions, RBAC (role→permission-action,
    org/location scope), global AuthGuard + PermissionsGuard.
  - Config: lookup catalogue — dynamic value API (locale fallback, active-at, ETag from Redis
    version counter), management (create/edit/reorder/deactivate/restore) with audit + outbox
    `lookup.invalidated` + cache-bust; `system_fixed`/`system_managed` read-only; translation
    catalogue (completeness, draft→review→publish, `legal.*` publish block); organization +
    locations read.
  - Admin: staff & roles (invite, access change, last-admin / privilege-escalation guards).
  - Notify: template render + outbox mail driver + dev viewer; verification / recovery /
    security_alert templates (en/fr/ar).
  - Cross-cutting: append-only audit, transactional outbox, idempotency interceptor, CacheBus.
  - Discovery (STAGE-002): `POST /discovery/search` — real-time availability (units − blocks −
    holds, turnaround-padded, operating-hours-gated) per category with a live "from" price;
    `POST /discovery/quote` — itemised versioned expiring quote + `pg_advisory_xact_lock`
    checkout hold (last-unit race proven safe); rate plans (draft → publish, immutable once
    published, publish reflects on search with no redeploy); catalogue + fleet-inventory read.
  - Booking (STAGE-003): `POST /bookings/confirm` — deterministic `RES-` ref, quote+hold
    re-validation, idempotent authorize+capture (`PaymentPort` simulator), atomic reservation
    persist, hold consume, non-fatal email; guest token + `claim`; recovery case on
    write-after-charge.
  - Reservation ops (STAGE-004): `POST /reservations/:ref/{cancel,modify}` (cancel — idempotent
    - policy refund; modify — hold-new-before-old, re-price + delta settle, capacity-safe),
      `GET .../history`; staff queue + `no-show`; `reconcile` → owned `reconciliation_exception`;
      `recovery_case` list/resolve. Availability now subtracts confirmed reservations.
  - Rental lifecycle (STAGE-005): assign → pickup (agreement) → extend → return (inspection +
    fuel/damage settlement) → readiness; one open rental per unit (partial unique index).
  - Administration (STAGE-006): `config` versioning — append-only `config_version`, draft →
    submit → approve/reject, author-cannot-approve (FR-ADM-006), approve supersedes prior
    published + emits event; `policy` config (cancellation fee, fuel rate) drives the cancel +
    return flows via `ConfigVersionService.policy()`. `report` — 5 whitelisted aggregates,
    location-scoped rows, `report_run` history, CSV export, `report_schedule`. `GET /ops/audit`
    (masked before/after, read-only).
  - Web: auth context + guards + silent refresh + return-to; shared UI kit; customer
    SCREEN-CUS-001..019 slices + real checkout + trips + reservation detail/modify/cancel/history;
    ops SCREEN-OPS-001/004(+assign)/009/012/013/016/025/026/030/031/032/033/034/035/038 + rental
    board + config versioning + reports hub + audit viewer;
    responsive (phone/tablet bottom-nav, laptop header/sidebar; wide tables scroll in-box; no
    horizontal page overflow — `responsive.spec.ts` guard, now incl. `/ops/config|insights|audit`);
    RTL (Arabic) verified incl. the config editor.
- **Exact next action:** the approved-scope build (STAGE-000..007) is complete. Pre-production
  follow-ups are enumerated in `stages/STAGE-007-release-hardening/release-readiness.md`: k6
  write-path load + ZAP baseline + SAST against a staged multi-instance deploy; Firefox/WebKit in
  the E2E matrix; full step-up-auth UI; and the STAGE-005/006 feature deferrals
  (incident/replacement, transfers, maintenance UI, fleet import, case retry, data-quality
  panel, non-`policy` config kinds, scheduled-report send-time re-auth).
- **New verify gates:** `verify:security` (SEC suite), `verify:a11y` (axe), `verify:perf`
  (autocannon smoke) alongside `verify:static|unit|api|migrate|e2e`.
- **Deploy (STAGE-008 — live-verified):** two co-equal local workflows —
  **native** (`pnpm dev:up` → `pnpm dev`, lowest footprint, DEC-013) and **Docker**
  (`docker compose up`). `compose.yaml` (dev) + `compose.prod.yaml` (prod-shaped, auto
  migrate + seed:system) at the repo root; `deploy/` keeps `Dockerfile.{api,web}`,
  `nginx.conf`, `postgres-init.sql`, `RUNBOOK.md`. Both stacks build + run green and pass
  `verify:static|unit|api|migrate` inside the container network; native path retested green.
  See `stages/STAGE-008-containerization/`. `scripts/{backup-db,restore-db,perf-smoke,verify-perf}`
  for ops. (`deploy/docker-compose.yml` removed — DEC-022.)
- **Known pre-existing / unrelated working-tree changes:** none (greenfield; specs, `prompts/`,
  and this build only).
- **Lookup / localization status:** system-fixed state sets + configurable lookups are SERVED
  (dynamic API + selectors) and MANAGED (CRUD + audit + invalidation) as of STAGE-001; see
  `lookup-registry.md`. Locales `en`/`fr`/`ar` ACTIVE with fallback + RTL proven;
  `localization-registry.md` updated.
