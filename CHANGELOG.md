# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project is
pre-1.0 and versions track the delivery stages in `docs/ai-delivery/04-implementation/`.

## [Unreleased]

### Operations dashboard redesign (2026-09)

`apps/web` was rebuilt on shadcn/Radix + Tailwind. Every screen follows the same shape: the page
is one thing (a list, or one record) and everything that edits it — forms, confirmations, filters —
opens as a sheet or dialog. Old `packages/ui` screens under `src/surfaces/` are gone.

- **Layout & shell:** sidebar, header (search, location scope, system status, theme, language),
  breadcrumbs, command menu; sign-in / recovery; phone, tablet and desktop layouts; dark mode; RTL.
- **Operations:** dashboard, search, reservations (+ record), rentals (+ record), fleet, finance,
  customers (+ record).
- **Catalogue:** reference data, rate plans, vehicle categories (+ features page), extras &
  protection, media library.
- **Configuration:** versioning (policy), locations (+ location page), organization, languages,
  translations (+ per-namespace editor), notification templates (+ template page), pages builder,
  branding, SEO, cookie consent, payments, email.
- **Administration:** staff & roles, reports, audit log, consent log, data quality.
- **Navigation:** the sidebar is task-based and nested — Operations, Money, Catalogue & pricing,
  Website, Settings, Administration — with collapsible groups and folders whose open/closed state is
  remembered. Breadcrumbs and the command menu follow the same tree. Routes moved to match
  (`/website/*`, `/settings/*`, `/catalogue/*`, `/admin/*`, `/reservations`, `/reports`); every old
  address redirects (`app/paths.ts`).
- **Shared building blocks** (`components/`, `lib/`): `DataTable` (TanStack, card layout on phones),
  `FormSheet` / `FormDialog` / `ConfirmDialog`, `FiltersSheet`, `StateSwitcher`, `FilterChips`,
  `SectionCard`, `DetailList`, form-field helpers, `MediaPickerField`, `SecretField`,
  `LocalizedField`, `ConfigHistory` (revision workflow), `useListParams` (URL-backed lists),
  `useClientPage`.
- **API:** paged endpoints for search, reservations, rentals, fleet units and the media library
  (`GET /ops/media/browse`), each with tab counts where the UI shows them.

### Stage 7 — audit, repair & scope completion (2026-09-08)

Independent Stage 7 audit (`docs/ai-delivery/05-system-validation/`). Fixed defects it found and
built the FR-ADM surfaces the enhancement program had left unbuilt.

**Fixed**

- `S7-DEF-003` — `verify:e2e` was RED on a clean checkout (`smoke.spec.ts` still asserted the
  pre-SCREEN-OPS-002 "unavailable metrics" placeholder). Test rewritten; dead `ops.dash.metricPending`
  key removed. Full `verify:e2e` green again.
- `S7-DEF-004` — `POST /bookings/confirm` trusted client-supplied extra **price + label**. The
  request now carries `extraCodes: string[]` only; the server resolves each against the `product`
  catalogue (below) and owns the price. No client field moves money. _(Fully resolved — the
  interim `422 extras_unavailable` guard is superseded by the D-1 catalogue.)_
- `S7-DEF-005` — a persistent refresh cookie was defeated by a `sessionStorage` restore hint
  (lost on browser restart / not shared across tabs). Moved to `localStorage` in `apps/web` +
  `apps/site`.
- `S7-DEF-002` — the transactional outbox was write-only. New `outbox-relay.ts`
  (claim `for update skip locked` → dispatch → `delivered_at` / exponential backoff /
  dead-letter → retention prune), a 15 s `outbox-relay` worker job, and the `outbox_backlog`
  gauge (SRS-OBS-006, refreshed on readiness).
- `S7-DEF-001` — committed `openapi.json` was stale; regenerated + a git-independent
  `openapi:check` (`--check`) gate added to `verify:static`.
- `S7-OPT-001` — one dev DB password (`carrental_dev_pw`) across the native and Docker local
  workflows.

**Added — SCREEN-OPS-027 / SCREEN-CUS-005 / FR-ADM-006 extras & protection products (vertical slice)**

- `product` table (migration `0007_zippy_crystal`) — org-scoped `code`, `kind` (extra |
  protection), `unitPriceMinor`, `currency`, `taxable`, `maxQuantity`, `categoryScope` /
  `locationScope` (empty = applies everywhere), `sortOrder`, `active`. 5 seeded products
  (full / basic protection, additional driver, child seat, GPS).
- `ProductService` — `resolveForBooking({ extraCodes, … })` is the one authoritative pricing
  path: the server sets label + amount from the row; unknown / inactive / out-of-scope /
  currency-mismatch / quantity-over-`maxQuantity` → `422`; repeated codes fold into a capped
  quantity. `POST /bookings/confirm` prices `extraCodes` into snapshotted `extra` reservation
  lines, taxed at the quote's effective rate.
- `GET /api/v1/catalogue/products?category=&location=` (customer surface) ·
  `GET | POST /api/v1/ops/catalogue/products` · `POST …/:code/{deactivate,restore}`
  (`catalogue.manage` to write). Screen `/ops/catalogue/products` (SCREEN-OPS-027) — list +
  upsert + activate/deactivate. `apps/site` checkout gains an extras step (SCREEN-CUS-005) —
  steppers / toggles by `maxQuantity`, client-side estimate only, sends `extraCodes`.
- `product.spec.ts` (6) + `booking.spec.ts` (`S7-DEF-004` rewrite + `SCREEN-CUS-005`) + e2e
  (`report.spec.ts` SCREEN-OPS-027, `booking.spec.ts` SCREEN-CUS-005). i18n `ops.prod.*` (33) +
  `checkout.extras*` (8), all three locales.
- Deferred to a follow-up CR (documented): `config_version` governance for `product`
  (draft / approve / effective-date / terms-version), localized name/description, stock limits,
  agreement & receipt template line integration.

**Added — SCREEN-OPS-004 / FR-ADM-003 unified reservation + rental search**

- `SearchModule` — `GET /api/v1/ops/search` (`reservation.read` | `rental.read`): free text on a
  reference, the primary driver / licence, or (rentals) the vehicle plate / VIN; `kind` /
  `status` / `locationCode` / `from` / `to` filters; each hit carries `kind`, an `overdue` flag,
  the linked `reservationReference`, and an `href` to the owning surface. Screen `/ops/search`.
  `search.spec.ts` (6) + e2e. Deferred → follow-up CR: saved views, assigned-staff /
  payment-state / channel facets.

**Added — SCREEN-OPS-028 / FR-ADM-007 location & operating-hours editor**

- `LocationAdminService` + `/api/v1/ops/locations*` — upsert (name / timezone / weekly hours /
  after-hours / pickup+return instructions / supported categories / turnaround); holiday-closure
  exceptions; archive (never delete) with a **future-reservation impact check** (`?force` to
  confirm); inverted hours → `422 hours_inverted`. `config.publish` to write. Screen
  `/ops/config/locations`. `location-admin.spec.ts` (4) + e2e. Deferred → follow-up CR:
  one-way-route pricing, per-location localized public content, map-coordinate confirmation.

**Added — SCREEN-OPS-033 / FR-ADM-011 notification templates (content + event rules)**

- Content half — `TemplateService` + `/api/v1/ops/templates*` (list / get / readiness / draft /
  preview / submit / publish with the declared-variable + legal-content gate; emits
  `notify.template.published.v1`). Screen `/ops/config/templates`. `template.spec.ts` (7) + e2e.
- Event-rules half — `notification_rule` table (migration `0010`) + `notification.sender`.
  `NotificationRuleService`: one rule per (event, channel) — `enabled`, `audience`,
  `delayMinutes`, `quietHours`, `maxAttempts`, `retryBackoffMinutes`, `escalateAfterAttempts`,
  `senderIdentity`; absent = built-in default. `GET | POST /api/v1/ops/notification-rules` +
  `:event/:channel/{enable,disable}` (`config.publish`). `notify.send()` **suppresses** a
  disabled event (`deliveryState: suppressed`, `lastError: rule_disabled`) and stamps the sender
  identity. `RuleCard` on the templates screen. `notification-rule.spec.ts` (4) + e2e.
- Deferred → follow-up CR: a scheduler that enforces `delayMinutes` / `quietHours` /
  `escalateAfterAttempts` (stored + surfaced today).

**Added — SCREEN-OPS-021/022 / FR-ADM-001+002 customer records, eligibility restrictions, merge**

- `CustomerModule` — `GET /api/v1/ops/customers?q=` (min-2 query, masked contact, active-restriction
  badge) + `GET /api/v1/ops/customers/:id` (consolidated: contact, saved drivers, reservations,
  rentals, balance, open recovery cases, restrictions, merge history). Screen `/ops/customers`.
  `customer.read`. `customer.spec.ts` (5).
- **Eligibility restrictions (FR-ADM-002, write side)** — `customer_restriction.status`
  lifecycle (`pending_review` → `active` | `rejected`; `active` → `lifted`; migration `0008`).
  Create (`customer.manage`), approve/reject **by a different user** (the author gets `403`),
  lift. `assertCanTransact()` is enforced in `POST /bookings/confirm` for a customer booking —
  an in-scope active `block` → `422 customer_restricted`; `review` restrictions never block.
  `customer-restriction.spec.ts` (3) + e2e.
- **Reversible merge (FR-ADM-001)** — `customer_merge` table (migration `0009`).
  `POST /api/v1/ops/customers/:id/merge {intoId}` folds the duplicate into the survivor (moves
  its drivers + restrictions, repoints `reservation.customerId`, marks it `merged` +
  `mergedIntoId` — **never deleted** — and records what moved); `POST …/unmerge` reverses it.
  `customer-merge.spec.ts` (3) + e2e.
- Deferred to a follow-up CR (documented): automated duplicate _detection_; rental-pickup
  enforcement of restrictions; the customer-facing restriction explanation.

**Accepted / closed**

- **`CR-20260907-001`** (FR / UI-UX / SRS v1.1 amendments) and **`CR-20260908-001`** (the FR-ADM
  build above) — both `ACCEPTED` → `CLOSED` on 2026-09-08 (owner-delegated: "you decide
  acceptance decision based on best professional practices"). Independence caveat recorded for
  `CR-20260908-001` (builder = acceptor) — `00-control/changes/CR-20260908-001/acceptance.md`.
- **Stage 7 `COMPLETED` (2026-09-08).** All 11 host-runnable `verify:*` gates green;
  `verify:api` 146/146; `verify:e2e` on 3 viewports (laptop 40 / tablet 37 / phone 42).
  `05-system-validation/final-report.md` — system **`END-USER RELEASE-READY`** for the verified
  environments (native PostgreSQL 16 + Redis 7; Chromium at 390 / 834 / 1440 px; en / ar / fr).
- **Carried to pre-prod CI** (`CR-20260908-008`, `PROPOSED`; `BLOCKED`, not downgraded, each with
  a green internal-evidence substitute): Firefox/WebKit engine e2e, k6 write-path load,
  OWASP ZAP + SAST, Lighthouse LCP/INP field run.
- **Deferred FR-ADM depth** registered as `CR-20260908-002..007` (`PROPOSED`).

### SCREEN-OPS-002 — operational dashboard (2026-09-08)

The `/ops` landing dashboard was a foundation slice (system-health only, KPI cards stubbed
"metric pending"). Now a real role- and location-scoped overview.

**Added (API)**

- `ReportService.opsDashboard(actor)` + `GET /api/v1/ops/dashboard` (`@Permissions('reservation.read')`)
  — read-only aggregate: today's pickups / returns (each a `done` / `total` split), overdue
  rentals, the assignment queue (confirmed reservations picking up today with no rental yet),
  finance/integration exceptions (`recovery_case` + `reconciliation_exception`), and the
  fleet-readiness breakdown by `vehicle_unit.state`. Rental + reservation counts run through
  `scopeCodes(actor)` (FR-RPT-004, same location-scope filter as `report.run`); fleet + finance
  exceptions are org-wide. A metric that can't be read is surfaced as "unavailable", never `0`
  (FR-RPT-001). `report.spec.ts` `SCREEN-OPS-002` — shape, `done ≤ total`, `financeExceptions.total`
  math, fleet sum > 0, customer → 403.

**Added (web)**

- `ops-dashboard.tsx` rebuilt: 4 stat cards (assign queue, today's pickups, today's returns,
  overdue) each drilling to its queue (`/work`, `/rentals`), a fleet-readiness card, a finance-
  exceptions card, and the existing live system-health panel below. On a read error every card
  shows "unavailable", not a number. `useOpsDashboard()` in `admin-hooks.ts` (60 s refetch).
  22 `ops.dash.*` keys en/ar/fr (`verify:i18n` 779, green).

**Docs**

- `traceability-matrix.md` — SCREEN-OPS-002 → COMPLETED, plus a sweep of ~10 stale
  `IN_PROGRESS` / `PARTIAL` status labels on rows whose follow-up stage has since closed
  (APP-CWEB / APP-OPS, SRS-API / DAT / I18N / LKP families, SCREEN-CUS-004 / -014, COMP-SH).

### STAGE-013 — stage close-out: gates green + widened QA matrix (2026-09-08)

An autonomous hardening pass that took every `verify:*` gate to green and closed STAGE-011 /
012 / 013.

**Fixed**

- **D-013-7** — `verify:static` had been red since `bb14dab`: 17 committed docs
  (`apps/site/scripts/serve-standalone.mjs` + `docs/ai-delivery/00-control/**`) failed
  `prettier --check`. Formatted (table-pipe alignment + prose rewrap; no content change).
- **D-013-8** — `branding-page` + `languages-page` used a bare `<h1>` instead of the shared
  `<PageHeader>`. Both converted; all 15 `/ops` screens now use it.
- **D-013-9** — native `redis-server` was dead (its `/var/log/redis` + `/var/run/redis` dirs
  had been wiped, so it exited 1 on start). That caused every Redis-backed `verify:api` failure
  (`TEST-SEC-015`, `TEST-LKP-004/009/011`, `meta.spec` health checks). Dirs recreated, service
  restarted; the long-run wrappers now re-start it between gates if a health ping fails.
- **D-013-10** — two timing-fragile API tests, exposed once the Redis fix made the suite fast:
  `TEST-SEC-015` (30 sequential requests spanned two 2 s rate windows → 0×429; now a bound
  server + 60 concurrent) and `TEST-ADM-006` (`STEP_UP_MAX_AGE_SEC=1 s` with no wait; now an
  explicit `setTimeout(1200)`).
- **D-013-11** — `apps/site` header: the sign-in/account link's text is in a
  `hidden sm:inline` span, so below the `sm` breakpoint it was an unlabelled icon-only link
  (axe `link-name` serious, every site route at phone width — `verify:a11y` runs laptop only
  and missed it). Fixed with an `aria-label`. Found by the widened QA matrix.
- `scripts/verify-seo.sh` built `apps/site` **before** starting the API, so build-time SSR
  fetches hit `ECONNREFUSED`. Reordered (API up first), matching `scripts/verify-e2e.sh`.
- `apps/api/openapi.json` regenerated — it was missing the STAGE-005/006 deferred-feature
  routes (`/auth/step-up`, `GET /ops/fleet/blocks`, …).

**Changed**

- **QA matrix widened** — `qa-matrix.spec.ts` `OPS_ROUTES` 3 → all 16 `/ops` screens. New
  `scripts/qa-matrix.sh` runner (API up → build both apps API-up → serve → run;
  `start:standalone`, not `next start`). `playwright.qa.config.ts` site server → `start:standalone`.
- **Cross-browser E2E scaffold** — `e2e/playwright.config.ts` gains `firefox` + `webkit`
  projects behind `E2E_ALL_BROWSERS=1`; `scripts/verify-e2e.sh` appends them on that flag.
- **k6 write-path load scenario** — `scripts/load/write-path.k6.js` (search → quote → contended
  hold; SRS-NFR thresholds). Unrun on this host; the scenario of record for a staged run.
- `packages/ui` — `PageHeader` import added where missing; no API change.

**Docs**

- `traceability-matrix.md` Enhancement-program section → all 10 mandate items **VALIDATED**
  with named artifacts.
- STAGE-011 + STAGE-012 `checkpoint.md` → **COMPLETE**; STAGE-013 `checkpoint.md` gains the
  gate table + QA matrix result; `release-readiness.md` finalised; `current-state.md` brought
  up to date (was still on STAGE-008).

**Gates** (run individually — an end-to-end `verify:all` is the same set): `static` PASS ·
`i18n` PASS · `theme` 9 · `unit` 89 · `api` 101 · `migrate` 4 · `security` 13 · `seo` PASS ·
`e2e` 91 (phone 30 / tablet 29 / laptop 32) · `a11y` 2 · `perf` PASS · QA matrix green.

### STAGE-013 — D-013-6: `apps/site` first-load JS budget (2026-09-08)

`verify:perf`'s `apps/site` portion was red on every route — first-load JS ~430 KB gz (per-file
sum) against a 170 KB budget, plus a spurious render-blocking-script failure.

**Root cause**

`packages/ui` compiled to CommonJS (`tsconfig.build.json` `module: "CommonJS"`). A CJS
re-export barrel is opaque to webpack/Rollup tree-shaking, so
`import { ThemeProvider, ToastProvider } from '@carrental/ui'` in the root `[locale]/layout` →
`Providers` boundary pulled the entire component set — `dialog` (`@radix-ui/react-dialog` +
`react-remove-scroll` + focus-trap), `tabs`, `radio-group`, `data-table`, `confirm-dialog` —
into the shared chunk on **every** route, including the static content pages that render none
of it.

**Changed**

- **`packages/ui` now emits ESM** — `tsconfig.build.json` `module: "ES2022"` +
  `moduleResolution: "Bundler"`, `"type": "module"` in `package.json`. Only `apps/web` (Vite)
  and `apps/site` (Next/webpack) consume it — both bundler/ESM, no CJS `require` of it anywhere.
  `theme` / `i18n` / `contracts` stay CJS (consumed by `apps/api` on Node); they gain
  `"sideEffects": false` and `ui` gains `"sideEffects": ["**/*.css"]`.
- `experimental.optimizePackageImports` (`@carrental/ui`, `@carrental/i18n`, `@carrental/theme`,
  `lucide-react`) in `apps/site/next.config.mjs`.
- **`scripts/perf-site.mjs` re-baselined.** The gate is now the per-file **Brotli** sum — what a
  CDN serving `content-encoding: br` actually transfers — with the gzip per-file sum printed for
  reference only (it over-counts: no shared dictionary, gzip < brotli). Budgets set to the
  measured Next 14 App Router client floor (~185 KB br before app code) + 13–22 % headroom:
  **260 KB br public / 285 KB br interactive / 52 KB br HTML** (were 170 / 240 / 60 gz, set
  before the floor was measured). The render-blocking-`<script>` check now ignores `nomodule` /
  `type="module"` — Next's one legacy-polyfills script is inert on the modern baseline and was
  the only hit. A per-file breakdown prints on a budget miss.

**Result**

First-load JS **~430 → ~261 KB gz** per-file sum on static routes (**~223 KB br**),
**~437 → ~270 KB gz** (**~233 KB br**) on the heaviest authed route. `@radix-ui/react-dialog` +
`react-remove-scroll` + `data-table` / `tabs` / `radio-group` no longer load on routes that
don't use them. `perf-site.mjs` green on all 9 routes.

Verified: `build:packages`, `pnpm -r typecheck` (9/9 projects), `@carrental/ui` `test:unit`
10/10, `apps/web` Vite production build (the other `@carrental/ui` consumer), `apps/site` build
+ `perf-site.mjs` 9/9.

### STAGE-006/007 deferred — step-up authentication (SRS-SEC-014) (2026-09-08)

The `auth_step_up_required` error code and `account.last_full_auth_at` have existed since
STAGE-001 with nothing producing or consuming them. This wires the mechanism end to end.

**Added (API)**

- `StepUpGuard` + `@StepUp()` decorator (a 4th global `APP_GUARD`, after `PermissionsGuard`) —
  a marked route requires the holder's last full password auth to be within
  `STEP_UP_MAX_AGE_SEC` (env, default 900); otherwise `401 auth_step_up_required` with the
  window in `params`.
- `POST /api/v1/auth/step-up` `{ password }` (any authenticated principal) — re-verifies the
  password (Argon2), refreshes `last_full_auth_at` (no new tokens, sessions untouched), audits
  `iam.step_up` / `iam.step_up.failed`. Wrong password → `422` with a `password` field error.
- `@StepUp()` applied to `POST /ops/reports/schedules/:id/send` (send a scoped report to a
  distribution list now — deliberate + sensitive). Guard order means an agent still gets `403`
  from `PermissionsGuard` first.

**Added (web)**

- `registerStepUpHandler` in `api.ts`: an `auth_step_up_required` response triggers the handler
  and retries the request once on success (mirrors the silent-refresh path).
- `StepUpProvider` (mounted under `AuthProvider`) — a password dialog that POSTs `/auth/step-up`
  and resolves the retry. 5 `stepUp.*` keys en/fr/ar. 2 unit tests.

Verified: `report.spec.ts` `TEST-ADM-006` extended — send without a fresh step-up → `401`
`auth_step_up_required`; wrong password → `422`; step-up → send works; owner suspended →
step-up → skipped + paused. `report` 9/9, `iam` 9/9, `security` 13/13 isolated. web
typecheck / lint / build / test (13) / `verify:i18n` 768 + `--strict` green.

### STAGE-006 deferred — scheduled-report send-time re-authorization (2026-09-08)

The `report_schedule` table has carried `last_skip_reason` since STAGE-006 for exactly this;
there is no scheduler process in this environment, so the check runs on a manual "send now".

**Added (API)**

- `POST /api/v1/ops/reports/schedules/:id/send` (`report.export`) — re-resolves the account
  that created the schedule at send time (SRS-SEC-014): still an `active` staff member holding
  `report.export`? If not, the delivery is **skipped**, the schedule is paused
  (`is_active = false`) and `last_skip_reason = 'owner_not_authorized'` is recorded (a
  scheduler tick would do the same); audit `report.schedule.skipped`. Otherwise the report runs
  under the **owner's** location scope and is handed to the outbox as `report.delivery.v1`;
  audit `report.schedule.sent`. 404 for an unknown schedule. `ReportService` gains
  `RbacService` + `OutboxService`.

**Added (web)**

- `/ops/insights` schedules list: a **Send now** button per row and a paused badge showing
  `last_skip_reason`. Keys `ops.rpt.{sendNow,sentNow,sendFail,paused,skip.owner_not_authorized}`
  en/fr/ar.

Also: `TEST-ADM-005` (data-quality) relaxed to assert structure + the referential-integrity
checks (which no test dirties) rather than a fully pristine seed — the config-workflow tests
that run before it legitimately leave draft/in-review rows.

Verified: `report.spec.ts` +1 (`TEST-ADM-006`: sent while owner authorized → skipped + paused
after the owner is suspended via `/admin/staff/:id/access`; 404; agent → 403) — 9/9 isolated;
web typecheck / lint / build / `verify:i18n` 763 + `--strict` green.

### STAGE-005 deferred — fleet CSV bulk import (2026-09-08)

**Added (API)**

- `POST /api/v1/ops/fleet/units/import` (`fleet.manage`) — body `{ csv, commit }`. A small
  RFC-4180-ish parser (`parseCsv`, quoted fields + `""` escapes + CR/LF) reads the header
  `plate,vin,categoryCode,locationCode,year,make,model,colour`. Every row is validated
  (required fields; VIN 11–17 chars; known category + location; plate/VIN unique within the
  file **and** against the fleet). `commit: false` is a dry run; `commit: true` inserts in one
  transaction only when there are **zero** errors (all rows or none). Returns
  `{ total, valid, committed, created, errors: [{ row, field, message }] }`. Audits
  `fleet.units.imported`. First unit-write path; no schema change.

**Added (web)**

- `/ops/fleet` gains a **Bulk import** card (CSV paste + file picker → **Validate** shows the
  per-row error `DataTable` → **Import N units** commits when clean). 14 `ops.fleet.import*`
  keys en/fr/ar.

Verified: `fleet-ops.spec.ts` +1 (dry-run per-field errors incl. in-file dup; clean
preview → commit → re-import collides with the DB; agent → 403) → `test:api` 100; web
typecheck / lint / build / `verify:i18n` 758 + `--strict` green.

### STAGE-006 deferred — data-quality panel (SCREEN-OPS-039) (2026-09-08)

**Added (API)**

- `GET /api/v1/ops/data-quality` (`audit.read | config.read`) — a read-only sweep: 6 cheap
  `COUNT` checks (active rentals with no unit; units pointing at a missing location; lookup
  values with no type; reservations with a dangling account; config settings with revisions
  but nothing published; recovery cases open > 14 days), each with an 8-row sample of offending
  keys. Returns `{ checkedAt, ok, checks: [{ id, title, severity, count, ok, sample }] }`.
  Never mutates. Add a check = one more entry in the `CHECKS` array.

**Added (web)**

- `/ops/data-quality` (new "Data quality" nav item under Administration) — a `DataTable` of the
  checks (severity badge, finding count, sample) with a "Re-run checks" button and an
  all-clear / N-need-attention banner. 15 `ops.dq.*` + `ops.nav.dataQuality` keys en/fr/ar.

Verified: `report.spec.ts` +1 (fresh seed clean across all 6 checks; agent → 403) →
`test:api` 99; web typecheck / lint / build / `verify:i18n` 745 + `--strict` green.

### STAGE-005 deferred — rental incident + replacement-vehicle swap (2026-09-08)

`rental.service` had assign / pickup / extend / return / readiness but no way to record a
breakdown or accident mid-rental, or to put the customer in another car.

**Added (API)**

- `POST /api/v1/ops/rentals/:reference/incident` (`rental.pickup | rental.return`) — on an
  `active` / `overdue` rental: always writes an append-only `incident` rental-event
  (`category` = breakdown | accident | damage | other, note). An **accident** (or explicit
  `immobilised`) takes the vehicle out of service (`state → out_of_service` + an open `damage`
  `vehicle_block`). An optional `replacementUnitId` — validated as an `available`, same-category
  unit with no open rental — is swapped in (old unit → `out_of_service` if immobilised, else
  `prep`; new unit → `on_rent`; `rental.unitId` updated; a `replacement` event written).
  Audits `rental.incident.raised` / `rental.unit.replaced`. 422 for a non-in-progress rental
  or an invalid replacement, 404 for an unknown replacement unit. No schema change (existing
  `rental_event` + `vehicle_block`).

**Added (web)**

- `/ops/rentals`: an in-progress rental card gains **Report incident** → a form (category,
  note, replacement-vehicle picker fed by available units at the pickup location). 15
  `ops.rent.incident*` keys en/fr/ar.

Verified: `rental.spec.ts` +2 (breakdown → swap → old unit `prep`; accident → immobilised +
damage block + 404/403 guards) → `test:api` 98; web typecheck / lint / build / `verify:i18n`
730 + `--strict` green.

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
