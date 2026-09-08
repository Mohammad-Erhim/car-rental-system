# Application & Role Inventory — Stage 7 Phase 1

Reconciled from source code (`apps/*`, `apps/api/src/database/seed/system.ts`), the design plan,
and runtime. Verified 2026-09-08 @ `1efea67`.

## Surfaces

| ID         | Surface                      | Stack                                        | Serves                                                                                                                                              | Routing                                                                          | Auth mode                                                                                                                           |
| ---------- | ---------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `APP-SITE` | Public customer site         | Next.js 14 App Router (SSG/ISR), `apps/site` | Discovery, booking, checkout, account, trips, help, legal                                                                                           | `/[locale]/…` for `en`/`ar`/`fr`; middleware locale negotiation                  | Access token in memory + `HttpOnly` refresh cookie; silent refresh; `RequireAuth` client guard on `/account`, `/trips`, `/checkout` |
| `APP-OPS`  | Operations & Admin dashboard | Vite 5 SPA, React 18, `apps/web`             | Reservation queue, rentals, fleet, finance, config/versioning, reference data, translations, branding, SEO, languages, reports, audit, data-quality | Hash-free browser router, `basename=/ops`                                        | Staff sign-in; `RequireAuth audience=staff` + `RequirePermission` per route                                                         |
| `APP-API`  | Backend API                  | NestJS 10, `apps/api`                        | All domain logic, persistence, jobs, events                                                                                                         | `/api/v1/*` (URI-versioned) + non-versioned `/health/*`, `/metrics`, `/dev/mail` | Global `AuthGuard` (HS256 access JWT) + `PermissionsGuard`; `@Public()` opt-out; `@StepUp()` for sensitive ops                      |
| `APP-CMOB` | Mobile customer app          | —                                            | —                                                                                                                                                   | —                                                                                | **OUT OF SCOPE** (`selected-scope.md`; deferred). Backend endpoints that would serve it are in scope.                               |

## Shared packages

`packages/contracts` (zod DTOs + generated API types), `packages/ui` (shadcn/ui primitives, ESM,
`DataTable`/`DetailList`/`Toolbar`/`PageHeader`/command palette), `packages/theme` (design-token
engine, single source → `apps/web`, `apps/site`, `packages/ui` CSS), `packages/i18n` (ICU catalogue

- React/Next bindings), `packages/config` (shared config schema).

## Actors / roles

### Customer (public)

`APP-SITE`. `account.kind = 'customer'`. No staff permission actions. Owns: own profile,
preferences, saved drivers, own reservations/rentals, own data-requests. Guest booking + `claim`
path exists (token, no account).

### Staff roles (`APP-OPS`) — seeded system roles

| Role code       | Name                 | Permission actions                                                                                                            | Dev seed account       |
| --------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `rental_agent`  | Rental agent         | catalogue.read, reservation.{read,create,modify,cancel}, rental.{read,pickup,return}, payment.read, customer.read, fleet.read | `agent@example.test`   |
| `fleet_staff`   | Fleet staff          | catalogue.{read,manage}, fleet.{read,manage}, rental.read, report.read                                                        | `fleet@example.test`   |
| `finance_staff` | Finance staff        | payment.{read,refund,reconcile}, reservation.read, rental.read, report.{read,export}                                          | `finance@example.test` |
| `support_staff` | Support staff        | catalogue.read, reservation.{read,modify}, rental.read, customer.read, payment.read                                           | _none seeded_          |
| `manager`       | Location manager     | **ALL** (26 actions)                                                                                                          | `manager@example.test` |
| `administrator` | System administrator | **ALL** (26 actions)                                                                                                          | `admin@example.test`   |
| `auditor`       | Auditor              | reservation.read, rental.read, payment.read, fleet.read, report.read, audit.read                                              | _none seeded_          |

**Gap flag `S7-GAP-A`:** `support_staff` and `auditor` roles have no dev/test seed account →
their permission scopes are not exercised by any automated test or dev walkthrough. Stage 7 must
either seed them or test their route visibility directly. (Low risk — scopes are subsets/simple.)

### Permission actions (26)

`catalogue.{read,manage}`, `reservation.{read,create,modify,cancel,override}`,
`rental.{read,pickup,return,extend.approve}`, `payment.{read,refund,reconcile}`,
`fleet.{read,manage}`, `customer.{read,manage}`, `config.{read,publish}`, `lookup.manage`,
`staff.manage`, `report.{read,export}`, `audit.read`, `integration.manage`.

Scope model: role → permission-action, with org/location scope on the assignment (`rbac.service.ts`,
`permissions.guard.ts`).

## Launch locales

`en` (default, LTR), `ar` (RTL), `fr` (LTR). All three `isActive`, fully translated (968 keys,
`verify:i18n` green). Locale table also supports `testOnly` + dynamic add via
`POST /api/v1/config/locales`.

## Target devices / viewports

Playwright projects: **phone** (390×844-ish), **tablet**, **laptop** (1440×900). Chromium only on
this host; Firefox/WebKit behind `E2E_ALL_BROWSERS` (env-blocked). Design responsive classes:
phone / tablet / laptop-header+sidebar.

## Environments

| Env                              | Datastores           | Command                                          | Notes                                                           |
| -------------------------------- | -------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| Native local (Stage 7 uses this) | native pg16 + redis7 | `DEV_UP_FORCE_NATIVE=1 pnpm dev:up` → `pnpm dev` | `.env` password `carrental_dev_pw`                              |
| Docker local                     | compose pg + redis   | `pnpm dev:up` (auto) → `pnpm dev`                | compose pg password `carrental` — `.env` mismatch, `S7-OPT-001` |
| Full container stack             | compose all          | `docker compose up`                              | `compose.yaml` dev; `compose.prod.yaml` prod-shaped             |
