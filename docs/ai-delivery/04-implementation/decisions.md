# Decision Records

Append-only. Do not rewrite history. Newest at the bottom of each area.

---

### DEC-001 — Operation mode: START with pre-answered scope

- Date: 2026-09-07
- Context: Prompt 06 START normally asks the user to pick a scope. The user's instruction already
  fixed it ("entire system except Mobile App frontend").
- Decision: Treat as explicit scope instruction. Skip the scope question; still produce the
  roadmap and run the per-stage gate.
- Source IDs: SRS §18, prompt 06 "Operation modes".
- Consequences: `selected-scope.md` records full system minus APP-CMOB frontend.

### DEC-002 — Backend stack

- Date: 2026-09-07
- Decision: NestJS + TypeScript (strict), modular monolith, separately runnable worker process.
- Source IDs: SRS DEC-004, DEC-011, SRS-ARC-001..008.

### DEC-003 — Persistence + ORM

- Date: 2026-09-07
- Decision: PostgreSQL 16 (native service on this host), Drizzle ORM, versioned SQL migrations
  via drizzle-kit, integer minor units for money, UTC instants + IANA zones.
- Source IDs: SRS DEC-005, SRS-DAT-001..012.

### DEC-004 — Web stack: React + Vite + shadcn/ui (supersedes SRS "Next.js")

- Date: 2026-09-07
- Context: SRS §5.2 names "React, Next.js App Router" as the web baseline. The user gave an
  explicit later constraint: "For frontend web use https://github.com/shadcn-ui/ui with react
  vite instead of next js". Prompt 06 technology-selection order puts explicit user constraints
  first. This host also has ~1.9 GB RAM, where a Vite SPA dev/build is much lighter than Next.js.
- Decision: `apps/web` = React 18 + Vite 5 + TypeScript (strict) single-page app, styled with
  **shadcn/ui** (Radix UI primitives + Tailwind CSS + CVA + tailwind-merge + lucide-react),
  routed with React Router v6. Two surface trees in one app:
  - `(customer)` → APP-CWEB, served at `/`
  - `(ops)` → APP-OPS, served at `/ops`
    with separate layouts, navigation, auth token audiences, permission gates, and design
    treatments. They build/test as distinct surfaces and can be split into two deployables
    (or two Vite ent- points) without domain change.
- SRS clauses affected: SRS-CMP-WEB / SRS-CMP-OPS ("Next.js routes") now read "React Router
  routes"; SRS-UI-014's "hydration warnings" is N/A for a CSR SPA (still assert: no console
  errors, no unhandled rejections, no failed unexpected requests, no a11y violations). SSR/SEO
  concerns for the public catalogue are handled with `react-helmet-async` meta + a prerender
  step deferred to release hardening if needed.
- Source IDs: prompt 06 "Technology selection" (explicit user constraint), SRS-UI-001..015,
  SRS §1.2 ("implementation may split files or modules"), SRS-NFR-005.
- Consequences: DEC-018 updated; `packages/ui` hosts the shadcn-derived component set; API may
  serve the built static assets in production; traceability still treats APP-CWEB / APP-OPS
  independently.

### DEC-005 — Auth mechanism

- Date: 2026-09-07
- Decision: First-party email+password (argon2id) + short-lived signed access JWT (~15 min) +
  opaque rotated refresh sessions stored hashed, with reuse detection + family revocation.
  Browser uses Secure/HttpOnly/SameSite cookie for the refresh token + CSRF token for cookie
  writes. OAuth/OIDC left as an optional adapter interface (not wired to a live provider).
- Source IDs: SRS DEC-007, SRS-SEC-001..006.

### DEC-006 — Payment provider

- Date: 2026-09-07
- Decision: Provider-neutral `PaymentPort`; the only implementation wired by default is the
  local deterministic simulator with named scenarios (success, decline, action-required,
  timeout-before-effect, timeout-after-effect/unknown, duplicate/out-of-order webhook,
  signature failure, outage, recovery) and an event-replay endpoint. Stripe adapter left as a
  stub implementing the same port.
- Source IDs: SRS DEC-008, SRS §4.3, §12.3, TEST-ERR-005/006.

---

## Environment-driven decisions

### DEC-013 — No container runtime on this host

- Date: 2026-09-07
- Context: `docker`/`podman` absent; `packagekit` masked; cannot install a runtime reliably.
  Passwordless sudo + apt available.
- Decision: Local dependencies run as native services (`postgresql-16`, `redis-server`) started
  by `scripts/dev-up.sh`. `compose.yaml` + per-app `Dockerfile` are still committed and kept
  accurate for any environment that has Docker; CI docs describe both paths.
- Source IDs: SRS DEC-003, SRS §5.2 ("must be fully buildable and testable locally"),
  SRS §2.2 ("a self-managed server is sufficient for the MVP").
- Consequences: "one documented command starts dependencies and apps" is `pnpm dev:up` here
  rather than `docker compose up`.

### DEC-014 — Redis in place of Valkey

- Date: 2026-09-07
- Decision: Use Redis 7 for BullMQ queues, rate limits, ephemeral cache, lookup-cache
  invalidation pub/sub. Valkey is API/wire compatible; `REDIS_URL` is the only touch point.
- Source IDs: SRS DEC-011, SRS §5.2 cache/queue row.

### DEC-015 — Filesystem object storage adapter

- Date: 2026-09-07
- Decision: `ObjectStoragePort` with an `fs` driver (writes under `var/objects/`, signed links
  are HMAC-signed time-boxed URLs served by the API) as default; `s3` driver (AWS SDK /
  MinIO-compatible) kept behind `OBJECT_STORAGE_DRIVER`. Same checksum/scan/retention metadata
  path in PostgreSQL either way.
- Source IDs: SRS DEC-006, SRS-DAT-009, IF-OBJ-ADAPTER.

### DEC-016 — Mail outbox instead of Mailpit

- Date: 2026-09-07
- Decision: `MailPort` default driver `outbox` persists rendered messages to `notification`
  rows + object storage and exposes them at `/ops/dev/mail` (dev only) and via API for tests.
  `smtp` driver (nodemailer) kept behind `MAIL_DRIVER`. SMS/push use the same outbox pattern
  with a dev viewer.
- Source IDs: SRS DEC-010, SRS §4.3, IF-MSG-ADAPTER, FR-INT-002.

### DEC-017 — Lightweight observability locally

- Date: 2026-09-07
- Decision: Pino JSON logs to stdout + `var/log/*.log`, request/trace/job correlation IDs,
  `/health/live|ready|version`, `/metrics` (Prometheus text exposition), and an evidence
  bundler for failed E2E. OpenTelemetry SDK is initialized and exports only when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set, so a full collector stack is optional.
- Source IDs: SRS DEC (observability row), SRS-OBS-001..012.

### DEC-018 — Two surfaces, one Vite codebase (see DEC-004)

- Date: 2026-09-07
- Decision: `apps/web` is one Vite React SPA. React Router route trees `/` (APP-CWEB) and
  `/ops` (APP-OPS) with independent layout shells, nav, auth audiences, and permission gates —
  route-tree split, not repo split, for the MVP on this host.

### DEC-021 — Frontend/backend delivery topology

- Date: 2026-09-07
- Decision: Vite SPA talks to the NestJS API at `/api/v1`. Dev: Vite dev server on `:3000`
  proxies `/api` → NestJS `:3001`. Test/prod: `vite build` static output is served by the API
  (or any static host) and API stays at `/api/v1`; SPA deep links fall back to `index.html`.
  Refresh-token cookie is `SameSite=Lax` on a shared origin so no cross-site CSRF surface for
  the browser flow; CSRF token still required for cookie-authenticated writes.
- Source IDs: SRS-API-001, SRS-SEC-003/015.

### DEC-019 — Maps: MapLibre optional, written address is the base

- Date: 2026-09-07
- Decision: `MapPort` default driver returns stored addresses/instructions and a static
  bounding-box; MapLibre GL is loaded on the client only when `NEXT_PUBLIC_MAPS_ENABLED=1`
  with a configurable style URL. No paid token is required for build/test.
- Source IDs: SRS DEC-009, FR-INT-003, IF-MAP-ADAPTER.

### DEC-020 — Launch locales for development/testing

- Date: 2026-09-07
- Context: SRS-I18N-001 keeps launch locales as business configuration; absence must not block
  building/testing; English-only must not be silently assumed.
- Decision: Seed `system` locale profile with `en` (default) + `ar` (RTL, for bidi coverage) +
  `fr` (LTR second locale) as **test/development** locales, clearly marked non-production in the
  seed profile. Production activation still blocks until the business confirms the real list.
- Source IDs: SRS-I18N-001, SRS §5.4, BR-028, FR-GBL-002.
- Open question surfaced to user: confirm the real launch locale list before any production release.

### DEC-022 — Two co-equal local workflows; Compose split dev / prod at the repo root

- Date: 2026-09-07 (STAGE-008)
- Context: DEC-013 records that the delivery host has no container runtime, so the native
  `postgresql-16` + `redis-server` path is the working default. The STAGE-007 deploy artifacts
  (`deploy/Dockerfile.*`, `docker-compose.yml`) were authored and `tsc→dist` build-checked but
  never run. A later instruction: support Docker "for all stages, best practices, tested and
  guaranteed" **and** keep a no-Docker option for constrained devices.
- Decision:
  - **Native and Docker are co-equal, documented local workflows.** Neither is deprecated. The
    native path (`pnpm dev:up` → `pnpm dev`) stays the lowest-footprint option; Docker
    (`docker compose up`) is the one-command isolated option.
  - **Two compose files at the repo root**, replacing `deploy/docker-compose.yml`:
    - `compose.yaml` — development (bind-mount + hot reload; pg/redis published, overridable);
      `name: carrental-dev`.
    - `compose.prod.yaml` — production-**shaped** (compiled images, auto `migrate` + seed
      `system`, `seed-dev` behind the `tools` profile); `name: carrental`.
      Repo-root placement is required: Compose resolves `.env` (for `${VAR}` interpolation) from
      the project directory, i.e. the first compose file's directory.
  - `deploy/` keeps the build inputs: `Dockerfile.api`, `Dockerfile.web`, `nginx.conf`,
    `postgres-init.sql`, `RUNBOOK.md`.
  - `scripts/dev-up.sh` / `dev-down.sh` branch on a **reachable** daemon (`docker info`), not
    just the CLI, and honour `DEV_UP_FORCE_NATIVE=1`.
- SRS clauses affected: SRS §17.6 deploy topology now has a live-verified container stack
  (traceability row updated from "build-checked" to "live-verified"). No change to app
  behaviour, DEC-004/018 (single Vite SPA served by nginx in prod) still hold.
- Source IDs: SRS §17.6, §22.4, SRS-NFR-005, DEC-013, DEC-014.
- Consequences: `deploy/docker-compose.yml` removed; `RUNBOOK.md` / `README.md` / traceability
  updated; BuildKit (`docker-buildx`) required to build the images. Defect D-008-1 (stale
  bind-mounted `*.tsbuildinfo` → empty `dist_*` volume) fixed in the `deps` one-shot.
