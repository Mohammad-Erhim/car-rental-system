# STAGE-008 — checkpoint

- **Status:** COMPLETED (2026-09-07). Post-release infrastructure stage — no application or
  feature behaviour changed; STAGE-007 remains the final _feature_ stage.
- **Objective met:** the SRS §17.6 container stack is now **run and verified**, not just
  build-checked, and a first-class containerised **dev** stack exists — while the no-Docker
  native workflow (DEC-013) is retested and unchanged.

## Completed work

### Images — `deploy/Dockerfile.api`, `deploy/Dockerfile.web`

- `Dockerfile.api`: `base → deps → dev` (bind-mount dev) and `deps → build → runtime`
  (`pnpm --prod deploy` pruned tree, compiled `dist`, migrations copied, non-root `node`,
  `tini` PID 1, `/health/ready` HEALTHCHECK). Added `ARG GIT_SHA` / `ARG BUILD_TIME` → `ENV`.
  **Fix:** `pnpm --prod --legacy deploy` → `pnpm --prod deploy` (`--legacy` is pnpm 10+).
- `Dockerfile.web`: `dev` (vite HMR) + `runtime` (static bundle on `nginx:1.27-alpine`,
  `/api` + `/health` proxied via `envsubst`).

### Dev stack — `compose.yaml` (repo root, `name: carrental-dev`)

- `postgres` + `redis` healthchecked; standard ports published, overridable with
  `DEV_DB_PORT` / `DEV_REDIS_PORT`.
- `deps` one-shot: install + **purge stale `dist` / `*.tsbuildinfo` from the bind mount** +
  `pnpm build:packages` → `dist_*` volumes (**D-008-1**).
- `migrate` one-shot (migrate + seed system + development), then `api` + `worker` (`node --watch`)
  - `web` (vite `--host 0.0.0.0`). Repo bind-mounted; `node_modules` + `dist` as named volumes.

### Prod-shaped stack — `compose.prod.yaml` (repo root, `name: carrental`)

- Relocated from `deploy/` so Compose reads the repo-root `.env` for `${VAR}` interpolation.
- `migrate` one-shot is **unprofiled** and runs on every `up`; `api`/`worker` gate on it with
  `service_completed_successfully` → bare `up -d` boots to a working system. `seed-dev` stays
  behind the `tools` profile.
- `worker` HEALTHCHECK → Redis ping (was inheriting the API `/health/ready` HTTP probe).
- `json-file` log rotation (10 MB × 3) on long-running services. No compose `init: true`
  (image runs `tini`) — removes the "Tini is not running as PID 1" warning.

### Datastore init — `deploy/postgres-init.sql`

- First-boot script: `CREATE DATABASE carrental_test` beside the primary DB.

### Scripts — `scripts/dev-up.sh`, `scripts/dev-down.sh`

- Detect a **reachable** daemon (`docker info`), not just the CLI, so "Docker installed but no
  permission / daemon down" falls through to native. `DEV_UP_FORCE_NATIVE=1` forces native.

### `.dockerignore`

- Context trimmed: `docs/`, `prompts/`, root spec `*.md`, `e2e/tests`, `*.tsbuildinfo`,
  playwright output.

### `apps/web/vite.config.ts` (carried from the in-progress work, verified here)

- `VITE_PROXY_TARGET` (default `http://localhost:3001`) + `VITE_USE_POLLING` + `host: true`
  so the same config serves native dev and the container (`http://api:3001`). Typechecks;
  native `pnpm dev` behaviour unchanged when the vars are unset.

### Docs

- New `CHANGELOG.md`. Updated `traceability-matrix.md` (SRS §17.6 row → live-verified),
  `current-state.md`, `decisions.md` (**DEC-022**), `session-log.md`, `deploy/RUNBOOK.md`
  (`docker-compose.yml` → `compose.prod.yaml`, auto-migrate bootstrap), `README.md`
  (Docker quick-start + DEC-013 note).

## Commands run / verified

See `test-evidence.md`. Summary: dev + prod images build; both stacks `up` healthy; SPA +
`/api` + `/health` proxy + SPA deep-link + sign-in all pass; `verify:static | unit (63) |
api (68) | migrate (4)` green **inside the dev container network**; native path retested
green (`verify:api` 68 + boot smoke).

## Defects

**D-008-1** — dev `migrate` `MODULE_NOT_FOUND @carrental/i18n/dist/index.js`: stale
bind-mounted `*.tsbuildinfo` → incremental `tsc` skips emit → empty `dist_*` volume. Fixed in
the `deps` one-shot (clean before build). No open defects.

## Deferred (documented, not dropped)

- Playwright-in-Docker image for `verify:e2e` / `verify:a11y` in a container.
- CI workflow (build + `verify:*` on push) and image publish to a registry.
- K8s/Helm manifests, TLS termination — `compose.prod.yaml` stays "production-shaped".
- `node:22` image vs `.nvmrc` `20.11.0` — both satisfy `engines` (`>=20.11.0`); left as-is to
  avoid churn, noted for a future alignment.

## Next exact action

Begin the next task (public-site + theming/branding + i18n + dashboard UX + SEO enhancement
program) — planned separately from STAGE-000..008.

## Resume notes

- `.env` at the **repo root** feeds both compose files. `compose.prod.yaml` needs real
  `JWT_ACCESS_SECRET` / `PASSWORD_PEPPER` / `COOKIE_SECRET` (`${VAR:?}` — fails fast otherwise).
- BuildKit is required (`# syntax=` + cache mounts). Install `docker-buildx` if `docker build`
  reports the buildx component missing.
- Dev stack publishes 5432/6379 — `pnpm dev:down` or stop native pg/redis before
  `docker compose up`, or set `DEV_DB_PORT` / `DEV_REDIS_PORT`.
- If dev `migrate`/`api` can't resolve a `@carrental/*` package: `docker compose run --rm deps`
  (rebuilds the shared `dist_*` volumes); it now self-cleans stale `tsbuildinfo`.
- Pass provenance into the prod image:
  `GIT_SHA=$(git rev-parse HEAD) BUILD_TIME=$(date -u +%FT%TZ) docker compose -f compose.prod.yaml build`.
