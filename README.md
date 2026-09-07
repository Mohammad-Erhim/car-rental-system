# Car Rental System

Customer Web (**APP-CWEB**), Operations & Admin Dashboard (**APP-OPS**), and the shared backend
that also serves the mobile app (**APP-CMOB** — its React Native frontend is deferred on this
machine; the API contract is complete).

Built from the accepted specifications in `docs/ai-delivery/`:
Functional Requirements 1.0 · UI/UX Design & Flow Plan 1.0 · SRS 1.0.

## Stack

| Layer                    | Choice                                                                           |
| ------------------------ | -------------------------------------------------------------------------------- |
| Backend                  | NestJS (modular monolith) + separate worker · TypeScript strict                  |
| Persistence              | PostgreSQL 16 · Drizzle ORM · versioned SQL migrations                           |
| Cache / queue            | Redis 7 (Valkey-compatible) · BullMQ                                             |
| Web (APP-CWEB + APP-OPS) | React 18 + Vite 5 + shadcn/ui (Radix + Tailwind) · React Router · TanStack Query |
| Shared packages          | `@carrental/contracts` (zod), `@carrental/i18n`, `@carrental/ui`                 |
| Tests                    | Vitest (unit/component/API/migration) · Playwright (web E2E, 3 viewports)        |
| Observability            | Pino JSON logs · `/health/*` · `/metrics` (Prometheus) · OpenTelemetry-ready     |

Environment substitutions (no Docker / low RAM on this host) are recorded in
`docs/ai-delivery/04-implementation/decisions.md` (DEC-013…DEC-021): native Postgres/Redis,
filesystem object storage, mail outbox, local provider simulators. `compose.yaml` + Dockerfiles
are kept for Docker-capable hosts.

## Quick start (local, no paid accounts)

```bash
pnpm install
pnpm dev:up                 # start PostgreSQL + Redis (native services or docker compose)
cp .env.example .env        # then set the DATABASE_URL password + generate secrets
pnpm db:migrate
pnpm db:seed                # system + development profiles
pnpm dev                    # API on :3001, web on :3000
```

- Customer web: <http://localhost:3000/>
- Operations dashboard: <http://localhost:3000/ops>
- API docs (Swagger): <http://localhost:3001/api/v1/docs>
- OpenAPI JSON: <http://localhost:3001/api/v1/openapi.json>
- Health: <http://localhost:3001/health/ready> · Metrics: <http://localhost:3001/metrics>

Dev sign-ins (development seed): `admin@example.test` / `manager@example.test` /
`agent@example.test` / `customer@example.test`, password `DevPassw0rd!`.

## Verification commands (SRS §22.4)

```bash
pnpm verify:static     # prettier + eslint (incl. module-boundary rule) + tsc, all packages
pnpm verify:unit       # Vitest unit/component (api, i18n, ui, contracts, web)
pnpm verify:api        # Vitest API/integration against carrental_test (real Postgres + Redis)
pnpm verify:migrate    # empty -> current migration proof on a disposable database
pnpm verify:e2e        # Playwright: phone / tablet / laptop, screenshots + console/network asserts
pnpm verify:quick      # static + unit + api
pnpm verify:all        # everything
pnpm check:secrets     # fail if a secret or a tracked .env is committed
pnpm openapi:generate  # regenerate apps/api/openapi.json
```

`pnpm verify:e2e` builds the web app and serves it with `vite preview` alongside the built API;
screenshots are written under `docs/ai-delivery/04-implementation/stages/<STAGE>/screenshots/`.

## Layout

```
apps/
  api/    NestJS backend + worker + Drizzle schema/migrations/seed
  web/    Vite React SPA — route trees `/` (APP-CWEB) and `/ops` (APP-OPS)
packages/
  config/     shared tsconfig / eslint presets (module-boundary rule)
  contracts/  zod schemas + types shared by API and web (error codes, envelopes, DTOs)
  i18n/       locale config, ICU translator, formatters, React bindings
  ui/         design tokens + shadcn/ui-derived primitives + AppStateView (12 STATE-* patterns)
e2e/          Playwright web tests
docs/ai-delivery/  the specs + implementation control history (start here to resume)
```

To resume implementation in a fresh session, read
`docs/ai-delivery/04-implementation/README.md` and follow its bootstrap order.
