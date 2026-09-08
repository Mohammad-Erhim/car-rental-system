# Dependency Map

Derived from SRS §8.3 (dependency constraints), §18 (sequencing), and the design flow inventory.

## Implementation units (backend modules → SRS §8.2)

| Unit                                                                                           | Depends on                                                         | Reason                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| `platform` (config, db, cache, queue, logging, error envelope, health, test harness)           | —                                                                  | Everything needs it.                                       |
| `iam` (accounts, credentials, sessions, verification, recovery, staff access, RBAC)            | platform                                                           | Identity/security boundary for all other modules.          |
| `config` (lookups, policies, translations, templates, feature/provider enablement, versioning) | platform, iam                                                      | Shared configuration + reference data consumed everywhere. |
| `customer` (profile, drivers, documents metadata, privacy requests, restrictions)              | platform, iam, config                                              | Customer master data.                                      |
| `catalogue` (organizations, locations, categories, public content, search projections)         | platform, iam, config                                              | Discoverable catalogue.                                    |
| `fleet` (vehicle units, category ops state, transfers, maintenance, inspections, blocks, docs) | platform, iam, config, catalogue                                   | Authoritative physical vehicle state; feeds availability.  |
| `availability` (capacity calc, holds, conflict checks)                                         | platform, catalogue, fleet, (reads booking/rental facts)           | Needs fleet + demand facts.                                |
| `pricing` (rate/policy versions, quotes, extras, protection, discounts, tax/fee inputs)        | platform, config, catalogue                                        | Not payment.                                               |
| `payment` (intents/attempts, deposits, refunds, ledger, reconciliation, provider port)         | platform, iam, config                                              | Internal financial state + provider mapping.               |
| `booking` (checkout orchestration, reservation aggregate + lifecycle, guest access)            | platform, iam, customer, catalogue, availability, pricing, payment | Coordinates the discovery→confirm vertical.                |
| `rental` (pickup, handover, agreement, extension, return, closeout, post-rental)               | platform, booking, fleet, payment, config                          | Consumes a confirmed reservation; custody transitions.     |
| `case` (incident, roadside, service, compensation, approval, ownership queues)                 | platform, iam, rental, fleet, payment                              | Cross-cutting exception ownership.                         |
| `notify` (localized rendering, outbox, channel adapters, delivery state)                       | platform, config                                                   | Consumes committed domain events.                          |
| `report` (read models, dashboards, exports, schedules)                                         | platform, iam, (reads governed projections/events)                 | Read-only over projections; never writes aggregates.       |
| `worker` (queued/scheduled execution, retries, reconciliation, projection refresh)             | platform + the module whose jobs it runs                           | Idempotent background execution.                           |
| `obs` (logs, metrics, traces, health, audit export controls)                                   | platform                                                           | Operational telemetry.                                     |

Cycles (availability↔booking/rental) are broken with application ports + committed domain events
(outbox), per SRS §8.3 / SRS-FLOW-002.

## Frontend units

| Unit                                                                                                                 | Depends on                            |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/contracts` (zod schemas + TS types derived from the API OpenAPI contract)                                  | api OpenAPI                           |
| `packages/i18n` (locale catalogues, ICU formatting, direction utilities)                                             | —                                     |
| `packages/ui` (Tailwind design tokens, shadcn/ui-derived accessible primitives, shared domain components COMP-SH-\*) | contracts, i18n                       |
| `apps/web` route tree `/` → APP-CWEB (React + Vite + shadcn/ui)                                                      | contracts, ui, i18n                   |
| `apps/web` route tree `/ops` → APP-OPS (same SPA)                                                                    | contracts, ui, i18n                   |
| `e2e` (Playwright)                                                                                                   | apps/web build (served) + api running |

`apps/web` is one Vite React SPA hosting both surfaces as React Router route trees, to fit the
1.9 GB RAM budget; APP-CWEB and APP-OPS keep distinct layout shells, navigation, auth audiences,
and permission models (DEC-004, DEC-018). shadcn/ui components are copied into `packages/ui`
(Radix + Tailwind), not consumed as a runtime dependency.

## Stage sequence implication

platform → shared identity/config/UI → discovery+quote → booking+payment → reservation ops →
pickup/rental/return → administration/reporting → release hardening.
This matches SRS §18.2 stages 0–7.
