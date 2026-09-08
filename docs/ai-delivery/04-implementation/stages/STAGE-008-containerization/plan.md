# STAGE-008 — Containerization & local-run parity · plan

## Objective / outcome

Make Docker a **fully working, tested** way to run the system for every stage of the build
(STAGE-000..007 feature set), _without_ regressing the no-Docker native path that the memory-
constrained delivery host depends on (DEC-013). Two co-equal, documented local workflows:

| Workflow                     | Command                                            | For                                                  |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| **Native** (no container)    | `pnpm dev:up` → `pnpm dev`                         | constrained devices, lowest footprint (DEC-013)      |
| **Docker — full stack**      | `docker compose up`                                | one command, full isolation on a Docker-capable host |
| **Docker — datastores only** | `docker compose up -d postgres redis` → `pnpm dev` | containers for pg/redis, app native                  |
| **Docker — prod-shaped**     | `docker compose -f compose.prod.yaml up -d`        | rehearsing the SRS §17.6 deploy artifact             |

The STAGE-007 deploy artifacts were authored and `tsc→dist` build-checked but **never run**
(no Docker on the authoring host). This stage runs them, fixes what breaks, and adds a
first-class containerised dev stack.

## Source IDs

SRS §17.6 (deployment topology / container stack), SRS §22.4 (verification commands run in the
container), SRS-NFR-005 (resource envelope — keep the native path), DEC-013 (no-Docker host),
DEC-014 (Redis for Valkey), DEC-004/018 (single Vite SPA served by nginx in prod).

## Workstreams

### 1. Images — `deploy/Dockerfile.{api,web}`

- Multi-stage, BuildKit (`# syntax=docker/dockerfile:1.7`), pnpm store cache mount.
- `api`: `base → deps → {dev | build → runtime}`.
  - `dev` target = workspace deps + toolchain only; source bind-mounted by compose.
  - `runtime` = `pnpm --prod deploy` pruned tree + compiled `dist` + copied migrations,
    non-root `node`, `tini` as PID 1, `HEALTHCHECK` on `/health/ready`.
  - `ARG GIT_SHA` / `ARG BUILD_TIME` → `ENV` for `GET /health/version` provenance.
- `web`: `dev` target = vite dev server (HMR); `runtime` = static bundle on `nginx:1.27-alpine`
  with `/api` + `/health` proxied (`deploy/nginx.conf`, `envsubst` `${API_UPSTREAM}`).
- Fix: `pnpm deploy --legacy` (pnpm 10 only) → `pnpm --prod deploy` (pnpm 9.15).

### 2. Dev stack — `compose.yaml` (repo root)

- `postgres` + `redis` (healthchecked, standard ports published, overridable via
  `DEV_DB_PORT` / `DEV_REDIS_PORT`), `deps` + `migrate` one-shots, `api` + `worker` + `web`
  with the repo bind-mounted and `node_modules` / `dist` as named volumes.
- `deps` one-shot: `pnpm install --frozen-lockfile` + **clear any host `dist` / `*.tsbuildinfo`
  dragged in by the bind mount** + `pnpm build:packages` into the `dist_*` volumes.
- `postgres-init.sql` creates `carrental_test` beside `carrental_dev` so `verify:*` can run in
  the container network.

### 3. Prod-shaped stack — `compose.prod.yaml` (repo root)

- Moved from `deploy/` to the repo root so Compose reads the repo-root `.env` for `${VAR}`
  interpolation (Compose resolves `.env` from the project directory = first compose file's dir).
- `migrate` one-shot (migrate + seed **system**) runs on every `up`; `api`/`worker` wait for it
  `service_completed_successfully` — a bare `up -d` boots to a working system. `seed-dev`
  (development fixture) stays behind the `tools` profile.
- `worker` healthcheck overridden to a Redis ping (no HTTP surface); `json-file` log limits;
  no compose `init: true` (image already runs `tini`).

### 4. Scripts

- `scripts/dev-up.sh` / `dev-down.sh`: detect a **reachable** daemon (`docker info`, not just
  the CLI) so a host with Docker installed but no socket permission falls through to native.
  `DEV_UP_FORCE_NATIVE=1` forces the native branch.

### 5. `.dockerignore`

- Trim the build context: `docs/`, `prompts/`, the root spec `*.md`, `e2e/tests`,
  `*.tsbuildinfo`, test/evidence output.

### 6. Test both workflows (STAGE gate)

- Docker: `docker compose build` (dev + prod), `up` both stacks, assert health / SPA / proxy /
  auth; run `verify:static | unit | api | migrate` inside the dev network.
- Native: `dev:up` (native branch) → `db:migrate` → `db:seed` → `verify:api` → API boot smoke.

### 7. Traceability / changelog

- New `CHANGELOG.md` (Keep a Changelog). Update `traceability-matrix.md` (SRS §17.6 row),
  `current-state.md`, `decisions.md` (DEC-022), `session-log.md`, `deploy/RUNBOOK.md`,
  `README.md`.

## Decisions taken in this stage

- **DEC-022** — two co-equal local workflows; `compose.yaml` (dev) + `compose.prod.yaml`
  (prod) at the repo root; `deploy/docker-compose.yml` removed.

## Out of scope

App/feature behaviour (unchanged), a CI pipeline, image publishing to a registry, Kubernetes /
Helm manifests, TLS termination. `compose.prod.yaml` stays "production-**shaped**" — the
RUNBOOK still calls for managed Postgres/Redis and a TLS proxy in a real deployment.
