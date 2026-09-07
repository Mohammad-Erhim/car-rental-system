# Car Rental System

The customer-facing site (**APP-CWEB**, a Next.js app), the Operations & Admin Dashboard
(**APP-OPS**, a React SPA served under `/ops`), and the shared NestJS backend — which also
serves the mobile app (**APP-CMOB** — its React Native frontend is deferred on this machine;
the API contract is complete).

Built from the accepted specifications in `docs/ai-delivery/`:
Functional Requirements 1.0 · UI/UX Design & Flow Plan 1.0 · SRS 1.0.

## Stack

| Layer                    | Choice                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Backend                  | NestJS (modular monolith) + separate worker · TypeScript strict                                                    |
| Persistence              | PostgreSQL 16 · Drizzle ORM · versioned SQL migrations                                                             |
| Cache / queue            | Redis 7 (Valkey-compatible) · BullMQ                                                                               |
| Customer site (APP-CWEB) | Next.js 14 App Router · SSG/ISR · `/[locale]/` routing (en/ar/fr) · full technical SEO · Tailwind · TanStack Query |
| Ops dashboard (APP-OPS)  | React 18 + Vite 5 + shadcn/ui (Radix + Tailwind) · React Router (base `/ops/`) · TanStack Query                    |
| Shared packages          | `@carrental/contracts` (zod), `@carrental/i18n`, `@carrental/theme`, `@carrental/ui`                               |
| Delivery topology        | one browser origin — a proxy routes `/` → site, `/ops` → dashboard, `/api` + `/health` → API (DEC-021/023/026)     |
| Tests                    | Vitest (unit/component/API/migration) · Playwright (dashboard E2E, 3 viewports)                                    |
| Observability            | Pino JSON logs · `/health/*` · `/metrics` (Prometheus) · OpenTelemetry-ready                                       |

Environment substitutions for a low-RAM host are recorded in
`docs/ai-delivery/04-implementation/decisions.md` (DEC-013…DEC-026): native Postgres/Redis are
the low-footprint default, filesystem object storage, mail outbox, local provider simulators.
The Next.js customer site (DEC-023) is built/run in the Docker build stage or dev container to
keep `next build` off the authoring host's RAM ceiling; `pnpm dev:ops` skips it entirely.
Docker is fully supported and co-equal (DEC-022) — see below.

## Quick start (local, no paid accounts)

Two supported workflows — pick one.

**A. Native (lowest footprint — constrained devices, DEC-013)**

```bash
pnpm install
pnpm dev:up                 # native PostgreSQL 16 + Redis 7 (falls back from Docker automatically)
cp .env.example .env        # then set the DATABASE_URL password + generate secrets
pnpm db:migrate
pnpm db:seed                # system + development profiles
pnpm dev                    # API :3001 · customer site :3000 (single origin) · ops dashboard :3100
```

`pnpm dev:ops` is the lighter API-plus-dashboard flow — it skips the heavy `next dev` server
and serves the dashboard alone on :3100.

**B. Docker (one command, full isolation — needs BuildKit: `apt-get install docker-buildx`)**

```bash
docker compose up                 # pg + redis + one-shots + api + worker + ops dashboard (:3100, HMR)
docker compose --profile site up  # …and the Next.js customer site on :3000 (heavier — runs `next dev`)
# tear down: docker compose down   (add -v to drop data)
```

`compose.yaml` publishes 5432/6379 — stop native Postgres/Redis first (or `pnpm dev:down`), or
set `DEV_DB_PORT` / `DEV_REDIS_PORT`. A **production-shaped** stack lives in `compose.prod.yaml`
(`cp .env.example .env` with real secrets, then `docker compose -f compose.prod.yaml up -d`) —
it adds the `edge` nginx that fronts site + dashboard + API on one port (`EDGE_PORT`, default
3000); see `deploy/RUNBOOK.md`.

- Customer site: <http://localhost:3000/> (redirects to `/en`, `/ar`, or `/fr`)
- Operations dashboard: <http://localhost:3000/ops/> — also served directly on <http://localhost:3100/ops/>
- API docs (Swagger): <http://localhost:3001/api/v1/docs>
- OpenAPI JSON: <http://localhost:3001/api/v1/openapi.json>
- Health: <http://localhost:3001/health/ready> · Metrics: <http://localhost:3001/metrics>

Dev sign-ins (development seed): `admin@example.test` / `manager@example.test` /
`agent@example.test` / `customer@example.test`, password `DevPassw0rd!`.

## Verification commands (SRS §22.4)

```bash
pnpm verify:static     # prettier + eslint (incl. module-boundary rule) + tsc, all packages
pnpm verify:unit       # Vitest unit/component (api, i18n, ui, theme, contracts, web)
pnpm verify:api        # Vitest API/integration against carrental_test (real Postgres + Redis)
pnpm verify:migrate    # empty -> current migration proof on a disposable database
pnpm verify:i18n       # every UI string present + resolved in en / ar / fr (DEC-024)
pnpm verify:theme      # brand tokens <-> CSS in sync · AA contrast for presets · no literal colours
pnpm verify:e2e        # Playwright: phone / tablet / laptop, screenshots + console/network asserts
pnpm verify:quick      # static + unit + api
pnpm verify:all        # everything
pnpm check:secrets     # fail if a secret or a tracked .env is committed
pnpm openapi:generate  # regenerate apps/api/openapi.json
```

`pnpm verify:e2e` builds the dashboard (`apps/web`) and serves it with `vite preview` alongside
the built API; screenshots are written under
`docs/ai-delivery/04-implementation/stages/<STAGE>/screenshots/`.

## Layout

```
apps/
  api/    NestJS backend + worker + Drizzle schema/migrations/seed
  site/   Next.js 14 App Router — the customer surface (APP-CWEB): SSG/ISR, /[locale]/, technical SEO
  web/    Vite React SPA — operations & admin dashboard (APP-OPS), served under /ops
packages/
  config/     shared tsconfig / eslint presets (module-boundary rule)
  contracts/  zod schemas + types shared by API, site and web (error codes, envelopes, DTOs)
  i18n/       locale config, ICU translator, formatters, React bindings
  theme/      brand tokens -> shadcn CSS variables (light/dark), dashboard-managed; shared by site + web
  ui/         shadcn/ui-derived primitives + AppStateView (12 STATE-* patterns)
e2e/          Playwright dashboard tests
deploy/       Dockerfiles (api / site / web) + nginx edge + dashboard configs
docs/ai-delivery/  the specs + implementation control history (start here to resume)
```

To resume implementation in a fresh session, read
`docs/ai-delivery/04-implementation/README.md` and follow its bootstrap order.
