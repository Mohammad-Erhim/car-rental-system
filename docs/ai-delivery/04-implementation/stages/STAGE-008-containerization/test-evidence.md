# STAGE-008 — test evidence

Stage: **Containerization & local-run parity.**
Date: 2026-09-07. Branch `implementation`. Host: Docker 29.1.3 + Compose v2.40, `docker-buildx`
0.30 installed for BuildKit; native PostgreSQL 16 + Redis 7 also present.

## Build

| Image                           | Command                                                    | Result                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `carrental-api:local` (runtime) | `docker build -f deploy/Dockerfile.api --target runtime .` | OK — **432 MB**, `node` user, `dist/{main,worker}.js` + migrations present, prod prune verified (no vite/esbuild/tsc/eslint/vitest in `node_modules`) |
| `carrental-web:local` (runtime) | `docker build -f deploy/Dockerfile.web --target runtime .` | OK — nginx:1.27-alpine, `1782 modules transformed`, bundle emitted                                                                                    |
| dev images                      | `docker compose -f compose.yaml build`                     | OK (share the `deps` layer)                                                                                                                           |

Regression found + fixed during build: `pnpm --prod --legacy deploy` → `Unknown option: 'legacy'`
on pnpm 9.15 (the flag is pnpm 10+). Changed to `pnpm --prod deploy`.

## Prod-shaped stack — `docker compose -f compose.prod.yaml up -d`

| Check                                        | Result                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `migrate` one-shot (auto, unprofiled)        | exit 0 — `[migrate] up to date` + `[seed] system`                                                      |
| `api` container HEALTHCHECK                  | `healthy` — `/health/ready` = `{status:ok}` (db, migrations "7 applied", redis, lookups "34 verified") |
| `worker` HEALTHCHECK (Redis ping override)   | `healthy`, exit 0 — no longer inherits the API `/health/ready` probe                                   |
| `web` HEALTHCHECK + boot ordering            | `healthy`; waits for `api: service_healthy`                                                            |
| `GET /health/version`                        | 200 — `gitSha`/`builtAt` empty (no build args passed); ENV plumbed                                     |
| web serves SPA + security headers            | 200 `text/html`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`                      |
| web proxies `/api/v1/openapi.json` → api     | 200 JSON                                                                                               |
| web proxies `/health/live` → api             | 200 `{status:ok}`                                                                                      |
| SPA deep-link fallback `GET /ops`            | 200 (nginx `try_files … /index.html`)                                                                  |
| `/metrics` **not** exposed through web       | `GET web:3000/metrics` → SPA `index.html`, not the API metrics text                                    |
| `docker compose … run --rm seed-dev` (tools) | `[seed] system` + `[seed] development` — OK                                                            |
| sign-in via web proxy (`admin@example.test`) | 200 — access JWT `aud: carrental.staff`                                                                |
| `tini` PID-1 warning                         | **0** occurrences (removed compose `init: true` for image services)                                    |

## Dev stack — `docker compose up`

| Check                                                    | Result                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `deps` one-shot                                          | exit 0 — install + `build:packages` into `dist_*` volumes           |
| `migrate` one-shot (migrate + seed system + development) | exit 0                                                              |
| `api` (`node --watch` via `@swc-node/register`)          | "Nest application successfully started", routes mapped              |
| `web` (vite dev)                                         | `VITE v5.4.2 ready`, serves `index.html` with `/@vite/client` (HMR) |
| `worker` (`dev:worker`)                                  | "worker started (queue: housekeeping)" + tick                       |
| `/health/ready` (direct :3001)                           | `{status:ok}`                                                       |
| vite proxy `/api/v1/meta/locales` → api                  | 200 JSON                                                            |
| vite proxy `/health/live` → api                          | 200                                                                 |
| sign-in via vite proxy (`customer@example.test`)         | 200 — access JWT `aud: carrental.customer`                          |
| `DEV_DB_PORT` / `DEV_REDIS_PORT` overrides               | honoured (tested on 5433 / 6380 alongside native pg/redis)          |

**Defect D-008-1 (fixed).** Dev `migrate` failed: `Cannot find module '@carrental/i18n/dist/index.js'`.
Cause: a host-side `tsconfig.build.tsbuildinfo` bind-mounted into the container makes incremental
`tsc` skip emit, so the fresh `dist_i18n` volume held only `locales/`, no `.js`. Fix: the `deps`
one-shot now deletes `packages/{contracts,i18n,ui}/dist/*` + `packages/**/*.tsbuildinfo` before
`build:packages`. Re-verified: `dist_i18n` has `index.js`/`react.js`/… and `migrate` exits 0.
(Production images are unaffected — `.dockerignore` already excludes `*.tsbuildinfo`.)

## Project verification suites — inside the dev compose network

`docker compose -f compose.yaml run --rm --no-deps api pnpm <gate>` (real Dockerized
Postgres 16 + Redis 7, `carrental_test` DB):

| Gate      | Command               | Result                                                                                                                                        |
| --------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Static    | `pnpm verify:static`  | PASS — lint + typecheck (incl. `apps/web` `vite.config.ts`) + prettier (`compose*.yaml` reformatted) + `openapi:generate` + contract drift OK |
| Unit      | `pnpm verify:unit`    | PASS — **63** (contracts 4, i18n 11, api 42, ui 4, web 2)                                                                                     |
| API       | `pnpm verify:api`     | PASS — **68** (10 files)                                                                                                                      |
| Migration | `pnpm verify:migrate` | PASS — **4** (empty→`0006` on a disposable DB)                                                                                                |

## Native (no-Docker) path — regression check

| Step                                             | Result                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/dev-up.sh`                              | took the **native** branch (`docker info` not reachable for the user) — pg/redis up, `carrental_dev` + `carrental_test` present |
| `pnpm install --frozen-lockfile`                 | "Already up to date"                                                                                                            |
| `pnpm build:packages` / `db:migrate` / `db:seed` | OK — system + development                                                                                                       |
| `pnpm verify:api`                                | PASS — **68**                                                                                                                   |
| `node apps/api/dist/main.js` boot smoke          | `/health/ready` = ok; `/health/version` ok; sign-in → 201                                                                       |

## Not run here (unchanged from STAGE-007, or tooling-bound)

`verify:e2e` / `verify:a11y` (Playwright + browsers — not added to an image this stage),
`verify:perf`, `verify:security` full gate (all green at STAGE-007; this stage changed no app
code). A live registry push / CI run is out of scope (STAGE-008 plan §"Out of scope").
