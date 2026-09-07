# STAGE-000 — Repository & local platform · plan

## Source IDs

SRS §5.2/5.3, §16, §18.2 stage 0, §22.4; SRS-ARC-001..008, SRS-API-001/002/004/008,
SRS-DAT-001/002/003/004/010/011, SRS-OBS-001..012, SRS-NFR-013/014/017.

## Tasks

1. **Workspace** — `package.json` (private, packageManager pnpm), `pnpm-workspace.yaml`,
   root `tsconfig.base.json`, `.editorconfig`, `.gitignore`, `.nvmrc`, `.env.example`,
   `.prettierrc`, ESLint flat config with an import-boundary rule, root `README.md`.
2. **packages/config** — shared `tsconfig` presets, eslint preset, `zod` env-schema helper.
3. **apps/api (NestJS)**
   - `main.ts` bootstrap: helmet, CORS allowlist, compression, cookie parser, global
     `ValidationPipe`, global exception filter (error envelope), global response-shape,
     Pino logger, OpenAPI (`@nestjs/swagger`) served at `/api/v1/docs` + JSON at
     `/api/v1/openapi.json`, graceful shutdown.
   - `config/` — zod-validated env (`DATABASE_URL`, `REDIS_URL`, `JWT_*`, `APP_URL`, driver
     switches, `NODE_ENV`).
   - `observability/` — request-id + trace-id middleware, Pino redaction, `/health/live`,
     `/health/ready` (checks DB + Redis + migration + lookup integrity), `/health/version`,
     `/metrics` (prom-client), OTel SDK init (no-op unless endpoint set).
   - `database/` — Drizzle client, migration runner (`drizzle-kit`), `schema/` folder,
     `_meta` migration bootstrap, `seed/` with `system|development|test` profiles.
   - `common/` — error codes enum, `AppError`, pagination (cursor), `Idempotency-Key`
     interceptor scaffold, `If-Match`/version helper scaffold, correlation context.
   - `meta` module — `GET /api/v1/meta/health-summary`, `GET /api/v1/meta/locales`
     (reads seeded locale rows), `GET /api/v1/meta/build`. Full test set: success,
     validation, 404-no-leak, shape, DB assertion.
   - Worker entry `worker.ts` — BullMQ queue + one `housekeeping` job + dead-letter.
4. **packages/contracts** — zod schemas for `meta` responses + shared primitives (Money,
   Locale, Problem envelope); a script to check drift vs `openapi.json`.
5. **packages/i18n** — `en/fr/ar` common namespace, ICU `formatMessage`, `dir(locale)`,
   number/date/currency formatters, missing-key reporter.
6. **packages/ui** — Tailwind preset + tokens (light/dark, LTR/RTL), `cn()` util,
   shadcn-derived primitives needed now: Button, Card, Skeleton, Alert, Badge, Spinner,
   plus `AppStateView` (renders the 12 STATE-\* patterns) and `DirectionProvider`.
7. **apps/web (Vite React)**
   - Vite + React 18 + TS strict, Tailwind, `components.json`, path alias `@/`.
   - `react-router` shell: `(customer)` layout at `/`, `(ops)` layout at `/ops`,
     `NotFound`, error boundary.
   - `@tanstack/react-query` client + typed API client (fetch, credentials, correlation
     header, problem-envelope parsing).
   - Providers: QueryClient, I18nProvider, ThemeProvider, DirectionProvider.
   - `/` landing: calls `meta/health-summary` + `meta/locales`; language switcher; shows
     STATE-LOADING → STATE-SUCCESS / STATE-FAILURE.
   - `/ops` landing: same, ops chrome + "sign in" placeholder linking STAGE-001.
8. **scripts** — `dev-up.sh` / `dev-down.sh` (start/stop native pg+redis, create dev/test
   DBs if missing), `check-env.sh`, `evidence-bundle.sh`.
9. **compose.yaml + Dockerfiles** — api, web, pg, redis for Docker hosts (kept accurate,
   not used on this host).
10. **e2e** — Playwright config (3 projects: phone 390×844, tablet 820×1180, laptop
    1440×900), `smoke.spec.ts` screenshotting `/` and `/ops` in each project, asserting no
    console errors / no failed requests; HTML report + trace on failure.
11. **Root scripts** — `verify:static|unit|api|migrate|e2e|quick|all`, `db:migrate`,
    `db:seed`, `db:reset`, `openapi:generate`, `dev`, `dev:up`, `dev:down`.

## Acceptance criteria (gate)

- `pnpm install` on a clean clone completes; `pnpm verify:static` → 0 errors.
- `pnpm dev:up && pnpm db:migrate && pnpm db:seed` succeed on empty `carrental_dev`.
- `pnpm verify:migrate` proves empty→current on `carrental_test` (disposable).
- `pnpm verify:api` green (`meta` operations, incl. negative + DB assertions).
- `pnpm verify:e2e` green: 6 screenshots (`/`, `/ops` × 3 widths), no console/network errors.
- `/health/ready` = 200 with `{db, redis, migrations, lookups}` checks.
- Logs are single-line JSON with `traceId`/`requestId`; no secret present anywhere in repo
  (`scripts/check-env.sh` + grep gate).
- OpenAPI JSON generated and committed; contracts drift check passes.
- Dependency-boundary lint passes (no cross-module deep import).

## Test / evidence plan

| Test ID                | Proves                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------- |
| TEST-ARCH-000          | ESLint import-boundary rule blocks a deep cross-module import (fixture).              |
| TEST-API-META-001..004 | health-summary / locales / build: success, shape, 404-no-leak, DB row match.          |
| TEST-DAT-010a          | migration runner: empty→current on fresh DB; re-run is a no-op.                       |
| TEST-OBS-001           | log line is JSON with required keys; redaction removes a seeded secret-looking field. |
| TEST-OBS-003           | correlation id returned in response header and present in the matching log line.      |
| TEST-E2E-SMOKE-001     | `/` renders SUCCESS state at 3 widths, screenshots saved, 0 console errors.           |
| TEST-E2E-SMOKE-002     | `/ops` renders at 3 widths, screenshots saved, 0 console errors.                      |

Evidence → `stages/STAGE-000-platform/{test-evidence.md,checkpoint.md,screenshots/}`.
