# Selected Scope

## User direction (verbatim intent)

> Implement the entire system except the Mobile App **frontend** (this machine cannot run or
> test React Native). The exclusion does **not** extend to the Mobile App backend. For web,
> everything must be fully tested with screenshots + analysis, network/DB/log debugging, and
> must be responsive on small (mobile), midsize (tablet), and large (laptop) screens.

This is an explicit scope instruction, so the roadmap's usual "which scope?" gate is answered:
**full system, minus APP-CMOB frontend.**

## Included

| Area                                 | Detail                                                                                                                                                                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APP-CWEB — Customer Web              | Full responsive browser app (React + Vite + shadcn/ui SPA, route tree `/`). All 24 customer screens (SCREEN-CUS-001–024), 10 customer flows (FLOW-CUS-001–010). Responsive at phone / tablet / laptop.                                                                 |
| APP-OPS — Operations/Admin Dashboard | Full responsive staff app (same SPA, route tree `/ops`). All 39 ops screens (SCREEN-OPS-001–039), 19 ops flows (FLOW-OPS-001–019). Permission- and scope-controlled.                                                                                                   |
| Backend (shared)                     | NestJS modular monolith + workers. REST API `/api/v1` (also the contract consumed by the deferred mobile app). All domain modules per SRS §8.2 (IAM, CUSTOMER, CATALOGUE, AVAIL, PRICING, BOOKING, PAYMENT, RENTAL, FLEET, CASE, CONFIG, REPORT, NOTIFY, WORKER, OBS). |
| Persistence                          | PostgreSQL 16 source of truth, Drizzle ORM, versioned SQL migrations, transactional outbox, idempotency, audit.                                                                                                                                                        |
| Auth / Authz                         | First-party credentials + short-lived access JWT + rotated refresh sessions; server-side RBAC by action/resource/scope/approval-limit.                                                                                                                                 |
| Integrations                         | Local provider simulators for payment, email, SMS/push, maps, external identity, object storage — same ports as production adapters.                                                                                                                                   |
| Reference data / lookups             | 49 LOOKUP/SRC sources, dynamic retrieval, catalogue + management UX (SCREEN-OPS-030/031).                                                                                                                                                                              |
| Localization                         | End-to-end i18n framework, key-based resources, fallback chain, RTL support, locale-aware formatting. Launch locales remain configuration.                                                                                                                             |
| Observability                        | Structured Pino JSON logs, correlation IDs, `/health/*`, metrics endpoint, evidence bundles on test failure.                                                                                                                                                           |
| Tests                                | Static, unit, component, repository/migration, API, integration (simulators), web E2E (Playwright) with screenshots + network/console + DB assertions.                                                                                                                 |

## Automatically included dependencies

Navigation, shared UI primitives/design tokens, localization framework, reference-data model,
audit/outbox, configuration versioning, health/observability — all included as dependencies of
the surfaces above, not as separate user-selected applications.

## Deferred (NOT completed — explicitly out of approved scope)

| Item                                                                                                                                             | Reason                                                                | Preserved so it is not blocked later                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APP-CMOB — Customer Mobile frontend (React Native app UI, native navigation, device capture, offline drafts, deep links, mobile E2E via Maestro) | This machine cannot build/run/test React Native or mobile simulators. | The REST API contract (OpenAPI), auth model, i18n resources, and design tokens are all built and are directly consumable by a React Native client. Mobile-specific FR behavior (offline safe-draft semantics, deep-link resolution) is implemented server-side where it belongs. |

## Not in scope (per SRS §2.3, unchanged)

Corporate-account contracting, loyalty programs, peer-to-peer ownership, chauffeur dispatch,
auctions, long-term leasing, live telematics, operating card networks / SMS carriers / email
networks / map-data networks.

## Environment deviations from SRS §5.2 (recorded, see decisions.md)

This machine has **no container runtime** (Docker/Podman) and **~1.9 GB RAM**. The SRS requires
the app to be _buildable and testable locally without paid accounts_ — it is — but its examples
assume Docker Compose for dependencies. Substitutions:

| SRS example                   | Local substitute here                                                     | Portability preserved by                                                                |
| ----------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------- |
| Docker Compose                | Native `postgresql-16` + `redis-server` services + `scripts/dev-*.sh`     | `compose.yaml` + `Dockerfile`s still provided for Docker-capable environments (DEC-013) |
| Valkey                        | Redis 7 (Valkey's upstream; wire/CLI compatible)                          | `REDIS_URL` config; Valkey is a drop-in (DEC-014)                                       |
| MinIO                         | Filesystem object-storage adapter behind the same `ObjectStoragePort`     | S3 adapter kept; `OBJECT_STORAGE_DRIVER=fs                                              | s3` (DEC-015)   |
| Mailpit                       | DB-backed mail outbox + in-app viewer (`/ops/dev/mail`) behind `MailPort` | SMTP adapter kept; `MAIL_DRIVER=outbox                                                  | smtp` (DEC-016) |
| Grafana/Prometheus/Loki/Tempo | Pino JSON log files + `/metrics` (Prometheus text) + `/health/*`          | OpenTelemetry SDK wiring kept behind `OTEL_EXPORTER_OTLP_ENDPOINT` (DEC-017)            |
| Maestro mobile E2E            | N/A — mobile frontend deferred                                            | —                                                                                       |
