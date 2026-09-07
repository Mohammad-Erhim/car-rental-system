# STAGE-000 — checkpoint

- **Status:** COMPLETED (2026-09-07).
- **Current subtask:** none — stage gate passed.
- **Completed work:**
  - pnpm workspace (`apps/{api,web}`, `packages/{config,contracts,i18n,ui}`, `e2e`).
  - `packages/config` — shared tsconfig presets + ESLint flat presets incl. `apiModuleBoundaries()`
    dependency-boundary rule + a "no parseFloat on money" rule.
  - `packages/contracts` — zod primitives (Money as minor units, cursor page, localized ref),
    stable error-code taxonomy (code → category → http status → retryable), Problem envelope,
    `meta` DTOs. Built to CJS `dist`. `check:drift` script.
  - `packages/i18n` — locale config (`en`/`fr`/`ar`, fallback chains, direction), ICU translator
    (never renders a raw key; missing-key observability), `Intl` formatters (money in own
    currency regardless of display locale; zoned datetime always names the zone), React bindings
    (`I18nProvider`/`useI18n`/`useT`), static `en/fr/ar` `common` bundle. 11 unit tests.
  - `packages/ui` — Tailwind preset + HSL token set (light/dark, WCAG AA target), `cn()`,
    shadcn/ui-derived primitives (Button w/ loading, Card, Skeleton, Alert, Badge, Spinner),
    `AppStateView` rendering all 12 SRS §7.2 states with `data-appstate` locators, `ThemeProvider`.
    4 component tests.
  - `apps/api` — NestJS modular monolith:
    - `config/` zod-validated env (fails fast); `bootstrap-env` side-effect dotenv loader.
    - `observability/` correlation ALS middleware (traceId/requestId), Pino JSON logger + redaction,
      `HealthService` (db/redis/migrations/lookup-integrity), `/health/live|ready|version`,
      `/metrics` (prom-client), `MetricsInterceptor` with route-template labels.
    - `common/` `AppError` + `GlobalErrorFilter` (Problem envelope, no leak), `ZodValidationPipe`,
      cursor pagination helpers.
    - `database/` Drizzle client (`postgres` driver), migration runner, `reset` (guards _dev/_test),
      seed framework with `system` / `development` / `test` profiles. Schema: `i18n` (locale,
      translation), `lookup` (type, value), `org` (organization, location, hours-exception,
      one-way-route), `iam` (account, session, auth-challenge, role, permission-action,
      staff-profile), `platform` (audit-event, outbox-message, idempotency-key, job, stored-object).
      Migration `0000_lively_mockingbird` (32 tables).
    - `modules/meta` — `GET /api/v1/meta/{locales,build,health-summary}` with full test set.
    - `bootstrap.ts` helmet + CORS allowlist + compression + cookie-parser + global zod pipe +
      error filter + metrics interceptor + URI versioning (`/api/v1`, health/metrics VERSION_NEUTRAL)
      + OpenAPI at `/api/v1/docs` + `/api/v1/openapi.json`.
    - `worker.ts` BullMQ `housekeeping` queue (reaps expired challenges/idempotency keys, logs
      outbox backlog) + dead-letter queue.
    - `openapi.ts` emits committed `apps/api/openapi.json`.
  - `apps/web` — React 18 + Vite 5 + shadcn/ui SPA:
    - `lib/api.ts` typed fetch client (credentials, `X-Request-Id`, `Idempotency-Key`/`If-Match`
      support, Problem-envelope parsing → `ApiError`).
    - `app/providers.tsx` QueryClient + Theme + I18n (initial-locale detection, missing-key console
      warn), `app/router.tsx` React Router trees `/` (APP-CWEB) + `/ops` (APP-OPS).
    - `CustomerLayout` (responsive header + phone bottom nav), `OpsLayout` (sidebar + scope bar +
      narrow-screen section nav), `LanguageSwitcher` (EL-SH-001), `SystemStatus` (FR-GBL-005),
      `RootErrorBoundary`.
    - `HomePage` (SCREEN-CUS-001 foundation) + `OpsDashboard` (SCREEN-OPS-002 foundation) both
      call `meta` endpoints and render loading/failure/success via `AppStateView`.
    - Placeholder routes for trips/account/help and ops work/fleet/finance/config/insights.
  - `e2e` — Playwright, 3 responsive projects (chromium), `smoke.spec.ts` (12 tests), screenshot
    + console/network guards, HTML report.
  - Local platform: `scripts/dev-up.sh`/`dev-down.sh` (native pg+redis or docker compose),
    `check-env.sh`, `evidence-bundle.sh`. `.env.example` (placeholders), generated local `.env`.
  - Root `README.md`, verify:* scripts.
- **Files changed:** whole repo scaffold (see git).
- **Commands run / verified results:**
  - `pnpm install` clean · `pnpm dev:up` · `pnpm db:migrate` · `pnpm db:seed` (3 locales, 34
    lookup types, 238 values, 189 translations, 6 accounts, 3 locations, 7 roles, 25 perms).
  - `pnpm verify:static` → 0 errors / 0 warnings, openapi generated, drift OK.
  - `pnpm verify:unit` → 27 pass. `pnpm verify:api` → 10 pass. `pnpm verify:migrate` → 4 pass.
  - `pnpm verify:e2e` → 12 pass, 9 screenshots, 0 console/network errors.
- **Next exact action:** begin STAGE-001 (shared identity, config, reference data, UI foundation).
- **Resume notes:** API runs via `@swc-node/register` (not a tsc build); clear `/tmp/swc-node-1000`
  if you see stale-code behaviour. `@typescript-eslint/consistent-type-imports` is OFF for
  `apps/api` (it breaks NestJS DI by eliding constructor-param class refs). Shared packages are
  CJS `dist` for Node, but `apps/web` vite/vitest alias them to `src` (see `vite.config.ts`).
