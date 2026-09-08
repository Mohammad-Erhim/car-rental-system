# Car Rental System — Software Requirements Specification

## 1. Document Control and Source Baseline

| Field | Value |
| --- | --- |
| Document | Software Requirements Specification (SRS) |
| Project | Car Rental System |
| Version | 1.0 |
| Status | Implementation-ready baseline |
| Baseline date | 2026-09-06 |
| Functional Requirements source | `docs/ai-delivery/01-functional-requirements/functional-requirements-v1.0.md`, version 1.0 |
| UI/UX source | `docs/ai-delivery/02-ui-ux-design/ui-ux-design-plan-v1.0.md`, version 1.0 |
| User additions | Phase 4 explicitly skipped; development must not depend on paid subscriptions; local/self-hosted substitutes are required; testing must cover screenshots, UI flows, backend endpoints, database changes, logs, networks, maintainability, reuse, and scalability |
| Applications | APP-CWEB, APP-CMOB, APP-OPS |

### 1.1 Baseline acceptance and authority

The Functional Requirements and UI/UX Design and Flow Plan named above are the complete source baseline for this SRS. Phase 2 and Phase 4 scoring were skipped by explicit user direction. Their absence does not remove any requirement or design obligation; both version 1.0 inputs are treated as accepted, unscored sources for SRS creation. No older chat copy or similarly named file is authoritative.

If statements conflict, the order of authority is: explicit user addition in this document control, Functional Requirements business behavior, UI/UX interaction intent, then implementation inference. The SRS resolves the former mandatory AWS-only interpretation by making deployment portable and AWS optional; the application must be fully buildable and testable locally without AWS, Stripe, managed email/SMS, hosted mapping, hosted observability, or any other paid account.

### 1.2 Requirement language and identifiers

- **Must** means mandatory for the applicable release scope.
- **Should** means the implementation is expected unless a documented architecture decision supplies stronger evidence for an alternative.
- **May** means permitted, not required.
- Source identifiers (`FR-*`, `APP-*`, `SCREEN-*`, `COMP-*`, `EL-*`, `FLOW-*`, `STATE-*`, `LOOKUP-*`, `SRC-*`, and `BR-*`) retain their source meanings.
- Technical and system requirements use stable `SRS-*` identifiers. Acceptance criteria and tests use `AC-*` and `TEST-*` identifiers.
- A range such as `FR-CAT-001–007` includes every identifier in that range.
- Implementation may split files or modules, but it must not rename stable source IDs in traceability metadata.

### 1.3 Completeness claim

This SRS targets 100% traceability to the declared source baseline. That claim means every known source requirement and design object has an implementation and verification route. It does not prove that no future business request, implementation defect, provider change, or unknown operating condition can exist.

## 2. Purpose, Scope, and Definitions

### 2.1 Purpose

The system enables customers to discover, quote, reserve, pay for, collect, use, modify, and return rental vehicles through responsive web and native mobile applications. Authorized staff use one operations dashboard to manage reservations, rentals, customers, vehicles, readiness, pricing, payments, configuration, integrations, audit evidence, and reports.

### 2.2 In scope

- Public and authenticated customer web application.
- iOS and Android customer mobile application with the same core outcomes.
- Permission-scoped operations and administration dashboard.
- Complete rental lifecycle from discovery through post-rental cases.
- Identity, authorization, pricing, availability, booking, payment coordination, fleet, notifications, reports, reference data, localization, audit, and recovery.
- REST interfaces shared by web, mobile, operations, workers, and optional external integrations.
- Local-first development, deterministic test data, automated verification, screenshots, traces, logs, network evidence, and database-state evidence.
- Portable deployment through containers; a self-managed server is sufficient for the MVP.

### 2.3 Out of scope unless separately accepted

Corporate-account contracting, loyalty programs, peer-to-peer vehicle ownership, chauffeur dispatch, auctions, long-term leasing, live telematics control, government licensing decisions, and operation of card networks, SMS carriers, email networks, or map-data networks are outside this baseline. Provider adapters and controlled imports may be added without changing domain behavior.

### 2.4 Definitions

| Term | Definition |
| --- | --- |
| Vehicle category | A bookable class of comparable vehicles. |
| Vehicle unit | One physical vehicle with a unique internal identity and normally a unique VIN and registration/plate within its jurisdiction. |
| Quote | Versioned, expiring calculation of price, taxes, fees, deposits, products, currency, rules, and inventory promise. |
| Hold | Temporary, expiring reservation of constrained inventory during checkout or another controlled workflow. |
| Reservation | Confirmed or governed pending promise for a rental. |
| Rental | Agreement and custody record opened at vehicle handover. |
| Provider attempt | One idempotent request and its observed outcomes against an external or simulated provider. |
| Lookup | Stored reference data used for a business-facing option, label, reason, category, state, or rule. |
| Local-first | Every required development and automated-test flow runs on a developer machine or self-hosted runner without a paid account. |
| Authoritative state | The current accepted server-side record version, not a client cache or optimistic display. |

## 3. System Context

### 3.1 Logical context

APP-CWEB, APP-CMOB, and APP-OPS consume one versioned REST application boundary. The backend is a modular monolith organized by business domain, with separately executable workers for queued and scheduled work. PostgreSQL is the transactional source of truth; MinIO provides S3-compatible development object storage; Valkey supports ephemeral caching, distributed coordination, rate limits, and queues without becoming the authoritative business database.

External capabilities are reached only through application-owned ports/adapters. Each paid or account-gated provider has a local implementation that returns realistic success, failure, timeout, duplicate, and unknown outcomes. Replacing an adapter must not leak provider-specific state into customer, booking, fleet, or finance domains.

### 3.2 System boundaries and responsibility

| Boundary | System responsibility | External/actor responsibility |
| --- | --- | --- |
| Customer identity | Credentials, verification workflow, sessions, permissions, recovery, audit | User controls verified channels and protects credentials |
| Rental eligibility | Collect data, apply configured rules, route review, retain evidence | Business defines lawful policy; staff makes governed manual decisions |
| Availability | Calculate from authoritative reservations, holds, rentals, fleet state, location, turnaround, and policy | Fleet staff keep operational facts current |
| Pricing | Version rules, calculate quote, snapshot acceptance, disclose totals | Business approves rates, taxes, fees, products, and legal wording |
| Payment | Create ledger intent, call adapter, reconcile, expose verified state | Provider moves funds in production; finance resolves governed exceptions |
| Notifications | Render localized template, queue delivery, record status, retry safely | Production carrier delivers outside system control |
| Mapping | Store authoritative location/address, optionally obtain suggestions/routes | Map source supplies geographic data; written instructions remain fallback |
| Documents | Validate metadata, scan, store, authorize, expire links, audit access | User/staff supplies permitted files; business owns retention policy |

### 3.3 Operating environments

- APP-CWEB and APP-OPS must support current stable desktop and mobile versions of Chromium, Firefox, and Safari within the browser-support policy approved at implementation kickoff.
- APP-CMOB must support the approved current and previous operating-system ranges for iOS and Android; the exact minimum versions are recorded before release and exercised in the device matrix.
- Server components must run on Linux containers using a Compose-compatible runtime. No Kubernetes dependency is required for MVP.
- Local development must run on macOS or Linux and may run on Windows through a supported Linux container environment.
- All clocks use UTC internally; location time zones use stable IANA identifiers; client presentation is locale-aware.

## 4. Applications, Actors, and External Parties

### 4.1 Applications

| ID | Application | Required responsibility |
| --- | --- | --- |
| APP-CWEB | Customer Web | Public discovery and complete browser-based customer self-service. |
| APP-CMOB | Customer Mobile | Equivalent customer outcomes with native navigation, capture, secure storage, deep links, and explicit offline-draft behavior. |
| APP-OPS | Operations/Admin Dashboard | Permission- and scope-controlled operations, fleet, finance, configuration, reporting, audit, and recovery. |

### 4.2 Actors

The implementation must preserve ACT-VISITOR, ACT-CUSTOMER, ACT-RENTER, ACT-ADDL, ACT-AGENT, ACT-FLEET, ACT-FIN, ACT-MANAGER, ACT-ADMIN, ACT-SUPPORT, ACT-AUDITOR, EXT-PAY, EXT-MSG, EXT-MAP, and EXT-ID as defined by the Functional Requirements. Authorization is evaluated by action, resource, data classification, organization/market/location scope, and where needed approval limit; a role label alone never grants unrestricted access.

### 4.3 External parties and degraded operation

| Party | Production role | Mandatory local implementation | Degraded rule |
| --- | --- | --- | --- |
| Payment provider | Authorize/capture/refund/query payment | Deterministic payment simulator with webhook/event replay | Preserve one attempt; show verified pending/failed state; never assume success or retry money blindly |
| Email/SMS/push | Deliver messages | Mailpit for email; message outbox viewer/simulator for SMS/push | Core record remains successful; delivery becomes an owned retryable task |
| Map/geocoding | Suggestions, directions, distance when enabled | MapLibre UI with self-hosted/local test data and written-address fallback | Search/location workflows remain usable without interactive map |
| External identity | Optional verification evidence | Configurable simulator/manual-review adapter | Provider outage routes to governed review; no silent approval |
| Object storage | Evidence and generated files | MinIO S3-compatible service | Metadata transaction records pending/failed object state; no orphan is presented as complete |

## 5. Assumptions, Constraints, and Resolved Input Decisions

### 5.1 Resolved decisions

| ID | Decision | Resolution |
| --- | --- | --- |
| DEC-001 | Phase 4 | Skipped by user. UI/UX version 1.0 is the direct SRS source and remains unchanged. |
| DEC-002 | Paid-service dependency | Prohibited for development and automated testing. Every required capability has a local/self-hosted implementation. |
| DEC-003 | AWS | Optional production target, not an implementation gate. Containers and S3-compatible storage preserve later portability. |
| DEC-004 | Backend framework | NestJS with TypeScript, using a modular-monolith structure and separately executable workers. |
| DEC-005 | Database | PostgreSQL is the authoritative transactional store. A supported stable major is pinned in repository configuration. |
| DEC-006 | Object storage | MinIO for local/self-hosted S3-compatible development. The domain uses an object-storage port so AWS S3 or another compatible target may be configured later. |
| DEC-007 | Authentication | First-party credentials plus short-lived signed access tokens and rotated refresh sessions; OAuth/OIDC providers are optional adapters. |
| DEC-008 | Payments | Provider-neutral payment port and complete local simulator are mandatory. Stripe may be a production/sandbox adapter but cannot gate development. |
| DEC-009 | Maps | MapLibre rendering and locally controlled test fixtures; remote tiles/geocoding are optional configuration. |
| DEC-010 | Email/SMS/push | SMTP adapter with Mailpit locally; SMS/push simulator locally; real carriers are replaceable adapters. |
| DEC-011 | Architecture scale | Modular monolith first. Module boundaries and outbox events permit later extraction only when measured scale/team needs justify it. |
| DEC-012 | Business options | No production business option is hard-coded in clients or ordinary business logic. Stored lookups/entities are served dynamically. |

### 5.2 Implementation technology baseline

The repository must pin exact dependency and container versions in lockfiles/manifests. “Supported stable” below is selected once at implementation kickoff, recorded in an architecture decision, and upgraded deliberately; floating `latest` tags are forbidden in reproducible environments.

| Concern | Required baseline | Subscription-free development rule |
| --- | --- | --- |
| Repository | Git, pnpm workspaces, shared TypeScript/config/test packages | All build/test commands run locally; hosted CI is optional |
| Web/admin | React, Next.js App Router, TypeScript strict mode | Self-hosted Node/container output; no Vercel dependency |
| Mobile | React Native with an open-source local toolchain; shared contracts and design tokens | Local Android/iOS builds; hosted build/update services optional |
| Backend | Node.js active LTS, NestJS, REST/OpenAPI | Runs locally and in a Linux container |
| Persistence | PostgreSQL; Drizzle ORM and versioned SQL migrations | Local PostgreSQL container and ephemeral Testcontainers databases |
| Cache/queue | Valkey and BullMQ-compatible workers | Local containers; business truth never exists only in cache/queue |
| Objects | S3-compatible storage port; MinIO locally | Local buckets, lifecycle, signed-link, failure, and permission tests |
| Email | SMTP port and Mailpit local capture | No external delivery account needed |
| SMS/push | Message-provider port and local outbox simulator | No carrier account needed for development/test |
| Payments | Payment port, local simulator, optional Stripe adapter | All money-state paths test locally; provider sandbox is additional evidence only |
| Maps | MapLibre client, map port, local fixtures/self-hosted data as selected | Written address/directions always available; no paid token required |
| API exploration | Generated OpenAPI/Swagger UI and repository-owned Bruno collection | Local API can be inspected and replayed without a hosted workspace |
| Observability | Structured Pino logs, OpenTelemetry SDK/Collector, Prometheus, Grafana, Loki, Tempo or Jaeger | Entire diagnostics stack runs through Compose; commercial exporters optional |
| Reverse proxy | Caddy or Nginx | Local TLS/proxy behavior can be exercised without a managed gateway |
| Containers | Docker Compose specification compatible tooling | One documented command starts dependencies and apps |

The selected tools are consistent with current official self-hosting and open-source capabilities: Next.js documents Node and Docker self-hosting, Valkey is BSD-licensed and open source, MapLibre is open source, Mailpit is a free open-source SMTP test server, and OpenTelemetry provides vendor-neutral telemetry collection. Technology evidence is listed in Section 5.5.

### 5.3 Mandatory development and quality toolchain

| Evidence need | Required tool/category | Required output |
| --- | --- | --- |
| Static correctness | TypeScript strict, ESLint, Prettier, dependency-boundary rules | Zero type/lint errors; deterministic formatting |
| Unit/component tests | Vitest or Jest, React Testing Library, React Native Testing Library | Machine-readable results and coverage report |
| Backend endpoint tests | Nest test utilities, Supertest, OpenAPI response/request validation | Every operation has positive, validation, permission, conflict, duplicate, and failure coverage |
| Database/migration tests | Testcontainers for PostgreSQL, migration runner, seed validator | Empty-to-current migration, previous-to-current migration, constraints, transactions, indexes, and rollback/forward-fix evidence |
| Web/admin E2E | Playwright Test | Screenshots, DOM snapshots, console and network evidence, trace on failure/retry, and HTML report |
| Web visual regression | Playwright screenshot assertions | Approved baseline and diff for required screen states/viewports/locales |
| Mobile component/E2E | React Native Testing Library plus the local Maestro Community CLI | Device/emulator flow result, screenshot checkpoints, and failure diagnostics |
| Accessibility | axe-core integration plus keyboard/screen-reader-oriented manual checklist | Automated violations plus signed manual result per critical flow |
| API manual debugging | Swagger UI and repository-owned Bruno collection | Environment-safe requests for every endpoint group |
| Network debugging | Playwright trace/HAR where safe, browser developer tools, request/trace IDs | Method, route template, status, timing, correlation, and redacted request context |
| Structured logs | Pino JSON with OpenTelemetry correlation | Searchable timestamp, severity, service/module, environment, trace/request/job IDs, event code; no secrets |
| Metrics/traces | OpenTelemetry Collector plus Prometheus and Tempo/Jaeger; Grafana dashboards | Local request, database, queue, provider, error, and job diagnostics |
| Load/reliability | k6 and deterministic failure simulators | Repeatable scenario, thresholds approved for target environment, bottleneck evidence |
| Security | dependency audit, Trivy, Semgrep Community rules where useful, OWASP ZAP baseline against test deployment | Findings triaged; release-blocking severity policy enforced |
| Database inspection | SQL scripts and DBeaver Community or equivalent | Read-only verification queries and before/after state evidence |

### 5.4 Unconfirmed business configuration

Launch markets, locations, legal entities, languages, fallback locale, currencies, rental policies, exact eligibility rules, taxes, fees, deposit policy, rate content, providers, role scopes, approval limits, notification content, retention, recovery objectives, and performance volumes remain governed configuration. Their absence must not block building or automated testing: deterministic fixtures marked as test-only are allowed in seed profiles, but production activation must block when a mandatory policy is incomplete.

### 5.5 Technology evidence references

- Next.js self-hosting: <https://nextjs.org/docs/app/guides/self-hosting>
- NestJS OpenAPI: <https://docs.nestjs.com/openapi/introduction>
- PostgreSQL supported versions: <https://www.postgresql.org/support/versioning/>
- Valkey documentation: <https://valkey.io/topics/introduction/>
- MinIO S3-compatible JavaScript SDK: <https://github.com/minio/minio-js>
- MapLibre GL JS: <https://maplibre.org/projects/gl-js/>
- Mailpit: <https://mailpit.axllent.org/>
- Stripe sandbox behavior for optional provider verification: <https://docs.stripe.com/testing/overview>
- Playwright trace viewer and network evidence: <https://playwright.dev/docs/trace-viewer>
- Maestro open-source local E2E framework and screenshots: <https://github.com/mobile-dev-inc/Maestro>, <https://docs.maestro.dev/reference/commands-available/takescreenshot>
- Testcontainers Node/PostgreSQL guide: <https://testcontainers.com/guides/getting-started-with-testcontainers-for-nodejs/>
- OpenTelemetry Collector: <https://opentelemetry.io/docs/collector/>

## 6. Functional Requirements Reference

### 6.1 Normative application rule

Every requirement below is mandatory with its full trigger, preconditions, business rules, success outcome, failure/recovery behavior, permission effects, and acceptance evidence. The implementation overlays in Sections 7–18 make the requirements buildable; they do not weaken the business meaning. Each `FR-AREA-NNN` maps to `SRS-AREA-NNN`, `AC-AREA-NNN`, and `TEST-AREA-NNN` unless a matrix adds further obligations.

### 7. Global Functional Behavior

#### FR-GBL-001 — Consistent cross-surface records

- Applications/surfaces: All
- Actors: All authorized actors
- Purpose and trigger: Keep one authoritative state whenever a reservation, rental, vehicle, customer, price, or payment is viewed or changed.
- Preconditions: The actor has access to the record.
- Functional behavior and rules: Every accepted action must update the shared record and make its new status visible to other affected surfaces. Cached or stale views must be marked and refreshed before a consequential action. Customer and staff terminology must map to the same underlying lifecycle states.
- Outcomes and recovery: Success shows the accepted state and next action. A conflicting or stale update is rejected without losing the newer change; the actor receives the current state and can review and retry.
- Permissions/effects: Only permitted actors may change data; connected surfaces receive the outcome.
- Acceptance evidence: A staff cancellation becomes visible in customer web and mobile, and a stale customer modification cannot silently overwrite it.
- Related: FR-GBL-005, FR-GBL-006, FR-RSV-002, FR-RSV-003

#### FR-GBL-002 — Multilingual experience and preferences

- Applications/surfaces: All
- Actors: Visitor, customer, staff, administrator
- Purpose and trigger: Let each person use an available language and preserve the choice.
- Functional behavior and rules: Authorized administrators configure launch languages and a default language. Visitors may select a language; signed-in preferences follow the account and device-specific behavior may be retained where appropriate. Navigation, controls, validation, statuses, lookup labels, messages, templates, receipts, agreements, and system-generated documents must use approved translations. Missing translations use the configured fallback and are identifiable to administrators, while stable internal codes never change with labels.
- Outcomes and recovery: Language changes preserve the current task and entered data. Unsupported or incomplete language content falls back without exposing raw keys.
- Acceptance evidence: A user changes language during checkout, stays on the same step, and sees localized labels, errors, quote formats, and later notifications.
- Related: FR-GBL-003, FR-ADM-012, FR-INT-002

#### FR-GBL-003 — Locale, time zone, currency, and text direction

- Applications/surfaces: All
- Actors: All
- Functional behavior and rules: Display dates, times, time zones, numbers, currency, names, addresses, and plural forms using the active locale. Pickup and return times must always identify the rental location's time zone when ambiguity is possible. Unicode input, search, and display must be preserved. Right-to-left layouts and mixed-direction values such as booking references, vehicle plates, and phone numbers must remain readable.
- Outcomes and recovery: Invalid locale-specific input receives an example in the selected language without discarding other valid values.
- Acceptance evidence: The same reservation is unambiguous when viewed in different locales and across a daylight-saving change.
- Related: FR-GBL-002, FR-CAT-004, FR-PRC-007

#### FR-GBL-004 — Dynamic reference and lookup data

- Applications/surfaces: All
- Actors: Administrator, manager, authorized staff
- Functional behavior and rules: Every business/domain option list must come from its authoritative stored catalogue or owning entity. Each catalogue is classified as configurable business lookup, constrained lookup, system-fixed invariant, externally managed reference, or entity-owned data. Authorized users can view the full catalogue in Reference Data or its owning area. Safe lookups may be added, translated, ordered, activated, and deactivated. Values that control lifecycle, security, standards, or integrations remain visible but read-only or constrained with the reason shown.
- Outcomes and recovery: Deactivation prevents new selection but preserves historical labels and stable codes. Rename affects future display without rewriting transaction meaning. A value in use cannot be destructively deleted.
- Acceptance evidence: A manager deactivates an optional equipment type; it disappears from new quotes but remains intelligible on old rentals.
- Related: FR-ADM-010, FR-ADM-011, FR-GBL-008

#### FR-GBL-005 — Visible status, history, and next action

- Applications/surfaces: All
- Actors: All authorized actors
- Functional behavior and rules: Every reservation, payment, rental, vehicle, maintenance job, incident, and refund must display a clear current status, relevant timestamps, responsible party where needed, and permitted next actions. Customer views show customer-appropriate history; staff views show operational history according to permission.
- Outcomes and recovery: Terminal states have no misleading action. Pending or failed states explain whether the user should wait, retry, supply information, contact support, or take no action.
- Acceptance evidence: A failed refund shows failure, unchanged financial balance, owner, and retry/escalation action rather than appearing completed.
- Related: FR-GBL-008, lifecycle models in Section 11

#### FR-GBL-006 — Duplicate, repeated, and conflicting actions

- Applications/surfaces: All
- Actors: All
- Functional behavior and rules: Repeated taps, browser refreshes, provider retries, and delayed responses must not create duplicate bookings, captures, refunds, or assignments. Before accepting a consequential action, the system rechecks permissions, current state, availability, and applicable price. Mutually conflicting actions are serialized or one is rejected with the accepted result shown.
- Outcomes and recovery: The actor receives the already-created result or a clear conflict response and safe next action.
- Acceptance evidence: Repeated confirmation produces one reservation and one intended payment outcome.
- Related: FR-BKG-007, FR-PAY-004, FR-INT-004

#### FR-GBL-007 — Accessible task completion

- Applications/surfaces: All
- Actors: All
- Functional behavior and rules: Core actions must be operable without relying only on color, hover, fine pointer control, sound, or a single device orientation. Focus, labels, error association, reading order, zoom, text scaling, and status announcements must support assisted use. Time-limited tasks must disclose expiry and provide an extension or restart route where business rules allow.
- Outcomes and recovery: Accessibility preferences do not remove information or block the shortest valid flow.
- Acceptance evidence: Search, booking, payment, cancellation, pickup, and return tasks can be completed with keyboard and screen-reader-oriented interaction patterns.
- Related: all customer and staff workflows

#### FR-GBL-008 — Audit history and reason capture

- Applications/surfaces: APP-OPS; customer-visible subset on APP-CWEB and APP-CMOB
- Actors: Staff, manager, administrator, auditor
- Functional behavior and rules: Record who or what performed consequential changes, when, from which surface or connected service, the prior and resulting state, and a required reason for configured sensitive actions. Audit records are append-only to ordinary users. Sensitive values are masked according to permission.
- Outcomes and recovery: Failed attempts that affect risk or operations are distinguishable from accepted changes. Authorized reviewers can filter and export audit evidence.
- Acceptance evidence: Manual price overrides, eligibility overrides, refunds, vehicle blocks, customer restrictions, and role changes are attributable and explainable.
- Related: FR-ADM-009, FR-PAY-009, FR-RPT-006

### 8. Functional Requirements by Area

#### 8.1 Registration, access, profile, and privacy

#### FR-IAM-001 — Customer registration

- Applications/surfaces: APP-CWEB, APP-CMOB
- Actors: Visitor
- Trigger and preconditions: A visitor chooses to create an account; required contact details are not already tied to an incompatible account.
- Functional behavior and rules: Collect the minimum configured identity, contact, credentials, language, and consent information. Explain mandatory and optional fields. Validate without clearing valid entries. Detect an existing account and route to sign-in or recovery rather than creating a duplicate. Registration during checkout must return the customer to the same booking step.
- Outcomes, exceptions, and recovery: Create a pending or active account according to verification policy. Provider or delivery failure leaves the account recoverable and offers resend or support. Abandonment creates no confirmed booking.
- Permissions/effects: The customer controls their account; staff cannot learn the password.
- Acceptance evidence: A new user can register from checkout and continue with the quote and entered trip details intact.
- Related: FR-IAM-002, FR-IAM-003, FR-BKG-001

#### FR-IAM-002 — Contact verification

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, support staff
- Functional behavior and rules: Verify configured email or phone channels using expiring, single-purpose challenges. Resend is rate-controlled and invalidates older challenges when appropriate. Changing a verified contact requires renewed verification and appropriate re-authentication. Staff may view status and initiate a new challenge but cannot mark a contact verified without a permitted, audited manual procedure.
- Outcomes and recovery: Valid confirmation updates verification status. Expired, incorrect, already-used, or delivery-failed challenges show a safe retry or channel-change route.
- Acceptance evidence: An expired code cannot verify an account, and a new code completes verification without duplicate accounts.
- Related: FR-IAM-001, FR-IAM-005, FR-INT-002

#### FR-IAM-003 — Sign in, session, and sign out

- Applications/surfaces: All
- Actors: Customer, staff
- Functional behavior and rules: Authenticate approved credentials or configured external sign-in methods, then expose only authorized actions. Disclose account suspension, required verification, or temporary lock without exposing sensitive security detail. Users can sign out of the current session and, where configured, other sessions. Sensitive staff actions may require renewed verification.
- Outcomes and recovery: Success returns the person to the intended permitted task. Failure does not reveal whether unrelated personal data exists and offers recovery after permitted attempts.
- Acceptance evidence: A customer following a reservation link signs in and returns to that reservation; a staff member cannot access a location outside their scope.
- Related: FR-IAM-004, FR-IAM-005, FR-ADM-009

#### FR-IAM-004 — Account recovery and credential change

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, staff, support staff
- Functional behavior and rules: Allow a person to start account recovery through verified channels. Recovery challenges expire, are single-use, and do not disclose unnecessary account information. After success, invalidate sessions according to policy and notify the account holder. A signed-in person can change credentials after re-verification. Support can initiate but cannot see or choose a customer's secret.
- Outcomes and recovery: Delivery failure offers resend, alternate verified channel, or support. Suspicious or exhausted attempts enter a controlled review or wait state.
- Acceptance evidence: A used recovery link cannot be reused, and successful recovery produces a security notification.
- Related: FR-IAM-002, FR-IAM-003, FR-INT-002

#### FR-IAM-005 — Configured external sign-in

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS where enabled
- Actors: Customer, staff, external identity provider
- Functional behavior and rules: Offer only approved sign-in providers. Link an external identity to an existing account only after verified ownership; never create parallel accounts silently. Provider cancellation or failure returns the user safely to the sign-in choice. Removing the last usable sign-in method requires adding another first.
- Outcomes and recovery: Success continues the original task. Conflicting identities require explicit resolution or support.
- Acceptance evidence: An external sign-in matching an existing verified email does not silently merge accounts without confirmation.
- Related: FR-IAM-001, FR-IAM-003, FR-INT-005

#### FR-IAM-006 — Customer profile and preferences

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, authorized support staff
- Functional behavior and rules: View and update permitted name, contact, address, language, time-zone, communication preferences, and saved renter details. Identify which changes require verification. Changes must not rewrite the identity or contact details captured on finalized historical agreements; later transactions use current approved data.
- Outcomes and recovery: Invalid changes are rejected field-by-field. Conflicting concurrent changes show the retained value. Customers may revert optional preferences.
- Acceptance evidence: Updating a phone number requires configured verification and leaves prior rental documents unchanged.
- Related: FR-IAM-002, FR-IAM-007, FR-GBL-002

#### FR-IAM-007 — Driver and eligibility information

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, primary renter, additional driver, rental agent
- Functional behavior and rules: Capture the identity, birth date or age evidence, licence details, issuing country, expiry, contact details, and other jurisdiction-specific qualifications required for each driver. Clearly separate primary renter, payer, and additional driver roles. Saved details may prefill a new booking but must be reconfirmed and revalidated for the rental dates. Sensitive documents have visible review and expiry status.
- Outcomes and recovery: Missing, expired, inconsistent, or ineligible data blocks only the affected commitment and explains the permitted correction, alternative vehicle category, manual review, or cancellation path.
- Acceptance evidence: A licence expiring before the planned return cannot pass eligibility without an approved resolution.
- Related: FR-BKG-002, FR-BKG-003, FR-RNT-003

#### FR-IAM-008 — Account data access, correction, and closure

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, support staff, administrator
- Functional behavior and rules: Let customers request access to, correction of, or closure of their account data according to applicable policy. Before closure, disclose active reservations, rentals, unpaid balances, disputes, retention obligations, and effects. Closure disables future sign-in and marketing while preserving records that must be retained. Reopening, when allowed, requires verified ownership and does not recreate deleted optional preferences automatically.
- Outcomes and recovery: Requests show received, in review, completed, rejected-with-reason, or cancelled status. Identity uncertainty routes to verification rather than disclosure.
- Acceptance evidence: An account with an active rental cannot be silently erased; the customer sees the blocker and next step.
- Related: FR-ADM-001, FR-GBL-008, FR-RNT-005

#### 8.2 Catalogue, search, locations, and availability

#### FR-CAT-001 — Browse the vehicle catalogue

- Applications/surfaces: APP-CWEB, APP-CMOB
- Actors: Visitor, customer
- Trigger and preconditions: The actor opens discovery with or without trip criteria.
- Functional behavior and rules: Present active bookable vehicle categories or exact vehicles using approved localized names, representative imagery, capacity, transmission, energy type, key features, and location applicability. Clearly label representative models when a category rather than an exact unit is being reserved. Do not show retired or staff-only inventory as bookable.
- Outcomes and recovery: Empty catalogues show how to set or broaden a valid trip search, contact support, or change location.
- Acceptance evidence: Category results never imply a guaranteed make/model unless exact-vehicle booking applies.
- Related: FR-CAT-002, FR-CAT-003, FR-FLT-002

#### FR-CAT-002 — Search, filter, and sort offers

- Applications/surfaces: APP-CWEB, APP-CMOB
- Actors: Visitor, customer
- Functional behavior and rules: Search by pickup/return location, dates, and times; then filter using dynamically available attributes such as category, passenger capacity, luggage, transmission, energy type, accessibility-related equipment, price range, and included features where relevant. Sort by clearly named criteria. Only applicable filter values appear, selected filters remain visible, and results update without losing trip context.
- Alternate and failure behavior: Invalid date order, closed locations, unsupported routes, and unavailable filters receive corrective guidance. Clearing filters restores the unfiltered eligible result set.
- Acceptance evidence: Filter counts and results remain consistent, and unavailable values are not presented as selectable options.
- Related: FR-CAT-004, FR-CAT-005, FR-GBL-004

#### FR-CAT-003 — View vehicle or category details

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Visitor, customer, staff
- Functional behavior and rules: Show description, images, capacity, luggage guidance, transmission, doors, energy type, included mileage if applicable, location restrictions, major eligibility conditions, features, included services, and material exclusions. Show price only for a complete trip context and distinguish estimated “from” prices from bookable totals. Staff can see relevant operational attributes according to permission.
- Outcomes and recovery: Missing media or translation uses an approved fallback without hiding material conditions. A stale or withdrawn offer cannot proceed without a refreshed alternative.
- Acceptance evidence: The details view preserves trip criteria and returns the user to the same results state.
- Related: FR-PRC-002, FR-BKG-002, FR-FLT-002

#### FR-CAT-004 — Rental locations and operating hours

- Applications/surfaces: All
- Actors: Visitor, customer, staff, manager
- Functional behavior and rules: Show active locations, localized address, contact options, time zone, regular and exceptional hours, pickup/return instructions, after-hours capability, supported vehicle categories, payment/eligibility differences, and route restrictions. Managers maintain permitted location content and closures. Location selection must distinguish similarly named places and disclose whether one-way return is allowed.
- Outcomes and recovery: Closed or unavailable times offer the nearest valid times or locations without changing criteria silently.
- Acceptance evidence: A holiday closure immediately prevents new incompatible pickups while preserving existing reservations for staff handling.
- Related: FR-ADM-007, FR-CAT-005, FR-RNT-014

#### FR-CAT-005 — Calculate real-time availability

- Applications/surfaces: All
- Actors: Visitor, customer, staff
- Trigger and preconditions: A complete location/date/time search or a proposed reservation change.
- Functional behavior and rules: Calculate availability from configured booking mode, active units or category capacity, location, temporary holds, confirmed reservations, active and overdue rentals, approved extensions, planned movements, maintenance, damage/cleaning blocks, operating hours, and turnaround buffers. Recheck before quote commitment, payment, modification, extension, assignment, and manual override.
- Alternate and failure behavior: If certainty is temporarily unavailable, do not claim confirmation; mark the offer unavailable-to-confirm or pending and give retry/support options. Staff override requires permission, reason, and impact disclosure.
- Acceptance evidence: A vehicle blocked for maintenance cannot be sold, and two simultaneous customers cannot both receive the same constrained capacity.
- Related: FR-CAT-006, FR-BKG-004, FR-FLT-007

#### FR-CAT-006 — Temporary checkout inventory hold

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Visitor, customer, rental agent
- Functional behavior and rules: When policy requires, hold the selected capacity for a configured, visibly disclosed period during checkout. A hold is not a reservation. It expires after inactivity, explicit abandonment, failed terminal checkout, or successful conversion. Extension is permitted only under configured rules and current availability.
- Outcomes and recovery: Expiry releases inventory and preserves non-sensitive entered data where appropriate so the user can recheck options. Duplicate tabs cannot extend capacity indefinitely.
- Acceptance evidence: An expired hold cannot be converted without fresh availability and price validation.
- Related: FR-BKG-004, FR-BKG-006, FR-GBL-006

#### FR-CAT-007 — No-result and alternative offers

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Visitor, customer, rental agent
- Functional behavior and rules: When no exact match exists, explain the limiting criteria and offer only valid alternatives such as nearby times, nearby locations, one-way-compatible routes, comparable categories, or a wait/contact route if supported. Each alternative shows how price, vehicle, distance, hours, or conditions differ. The system never changes dates, location, category, or total silently.
- Outcomes and recovery: Selecting an alternative creates a new explicit search context; dismissing it preserves the original search.
- Acceptance evidence: A customer can tell exactly which criterion changed before choosing an alternative.
- Related: FR-CAT-002, FR-CAT-005, FR-PRC-002

#### 8.3 Pricing, offers, extras, and protection

#### FR-PRC-001 — Configure rate plans and price rules

- Applications/surfaces: APP-OPS
- Actors: Manager, administrator
- Functional behavior and rules: Authorized users manage rate plans by applicable location, category or unit, rental period, dates/seasons, booking channel, customer segment if used, included distance, and other approved conditions. Rules have effective dates, priority/conflict handling, currency, status, and preview. Past transaction prices remain immutable. Overlapping or incomplete rules are blocked or explicitly resolved before activation.
- Outcomes and recovery: Draft, scheduled, active, paused, expired, and archived states are visible. Rollback creates a new effective version rather than rewriting history.
- Acceptance evidence: A future seasonal rate can be previewed and activated without changing existing confirmed bookings.
- Related: FR-PRC-002, FR-ADM-005, FR-GBL-008

#### FR-PRC-002 — Produce an itemized quote

- Applications/surfaces: All
- Actors: Visitor, customer, rental agent
- Trigger and preconditions: Complete trip criteria and an available offer.
- Functional behavior and rules: Calculate and display base rental amount, rental duration basis, included and excess distance terms, taxes, mandatory fees, location or one-way charges, selected extras, protection products, discounts, amount due now, amount due later, refundable or releasable security amount, and estimated total in the transaction currency. Disclose assumptions and material exclusions. Give the quote an expiry or revalidation condition.
- Outcomes and recovery: If a price cannot be confirmed, show no false total; retain the trip and offer a retry or staff route. Expired quotes are recalculated and differences require acknowledgement.
- Acceptance evidence: The sum of visible line items equals the displayed total and matches the confirmed reservation snapshot.
- Related: FR-PRC-003, FR-PRC-007, FR-BKG-006

#### FR-PRC-003 — Taxes, mandatory fees, deposits, and policy charges

- Applications/surfaces: All
- Actors: Customer, staff, manager
- Functional behavior and rules: Apply only currently valid charges for the rental's jurisdiction, location, dates, vehicle, renter eligibility, and selected services. Distinguish payable charges from refundable deposits or payment holds. Each charge has a stable code, localized label, applicability, calculation basis, effective period, and permitted override rule. Manual override requires authority and reason.
- Outcomes and recovery: If required charge configuration is missing or contradictory, confirmation is blocked and routed to an owner rather than guessing.
- Acceptance evidence: Deactivated fees cannot enter new quotes but remain identified on historical statements.
- Related: FR-PRC-001, FR-PAY-003, FR-ADM-010

#### FR-PRC-004 — Discounts and promotion codes

- Applications/surfaces: All
- Actors: Visitor, customer, rental agent, manager
- Functional behavior and rules: Validate a promotion against dates, location, category, channel, customer eligibility, usage limits, minimum conditions, combinability, and status. Show the accepted discount and changed total before confirmation. Do not reveal private eligibility rules. Managers can create, pause, schedule, and review promotions within permission.
- Outcomes and recovery: Invalid, expired, exhausted, or inapplicable codes explain the safe reason category and allow correction/removal. Cancellation or modification applies the disclosed refund and repricing rules.
- Acceptance evidence: Repeated submission cannot exceed a promotion's permitted use and removing a code restores the correct total.
- Related: FR-PRC-002, FR-RSV-002, FR-ADM-005

#### FR-PRC-005 — Optional equipment and services

- Applications/surfaces: All
- Actors: Customer, rental agent, manager, fleet staff
- Functional behavior and rules: Offer only extras available for the selected location, dates, category, stock, and eligibility. Show price, unit, quantity limits, key conditions, and whether confirmation is immediate or requested. Reserve constrained extra stock with the booking and release it on cancellation or expiry. Staff record issue and return condition where relevant.
- Outcomes and recovery: If an extra becomes unavailable, notify the owner, remove no item silently, and offer replacement, booking continuation without it, or cancellation under policy.
- Acceptance evidence: The same child seat or navigation unit cannot be promised beyond configured stock.
- Related: FR-BKG-006, FR-RNT-004, FR-ADM-006

#### FR-PRC-006 — Protection products and coverage choices

- Applications/surfaces: All
- Actors: Customer, renter, rental agent, manager
- Functional behavior and rules: Present only protection products permitted for the location, vehicle, driver, and rental. Explain price, coverage summary, exclusions, responsibility or excess, included versus optional status, and required acknowledgement in plain language. Capture accept/decline decisions separately for each applicable product and preserve the terms version used. Staff cannot preselect optional products deceptively.
- Outcomes and recovery: Ineligible or unavailable products are removed with an explanation before commitment; prior total is recalculated and acknowledged.
- Acceptance evidence: The final agreement and price match the customer's recorded choices and applicable version.
- Related: FR-BKG-005, FR-RNT-009, FR-ADM-006

#### FR-PRC-007 — Currency and rounding

- Applications/surfaces: All
- Actors: Customer, staff, finance staff
- Functional behavior and rules: Show the transaction currency before commitment and use consistent rounding for line items, taxes, totals, refunds, and adjustments. If display conversion is offered, label it as informational, identify the payable currency, and disclose that final conversion may be controlled by the payer's provider. Confirmed transaction amounts remain tied to their original currency.
- Outcomes and recovery: Unsupported currency combinations block payment and offer supported alternatives without changing the trip.
- Acceptance evidence: Quote, payment, receipt, refund, and finance record reconcile in the transaction currency.
- Related: FR-GBL-003, FR-PAY-001, FR-PAY-009

#### 8.4 Checkout and reservation creation

#### FR-BKG-001 — Start and resume checkout

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Visitor, customer, rental agent
- Trigger and preconditions: The actor selects an available offer.
- Functional behavior and rules: Start checkout with the trip, offer, quote version, and selected language intact. Present the shortest valid sequence for renter details, eligibility, extras, price review, payment, and confirmation. The customer may sign in, register, or use configured guest checkout without losing progress. Saved progress may be resumed only while availability, policy, and price remain valid.
- Outcomes, exceptions, and recovery: Abandonment releases temporary inventory and does not create a confirmed reservation or capture unintended payment. Resume revalidates all consequential data and highlights changes.
- Acceptance evidence: Returning from sign-in or a recoverable payment challenge preserves entered details and current valid selections.
- Related: FR-IAM-001, FR-CAT-006, FR-BKG-004

#### FR-BKG-002 — Pre-booking eligibility assessment

- Applications/surfaces: All
- Actors: Customer, renter, additional driver, rental agent
- Functional behavior and rules: Evaluate configured minimum/maximum age rules, licence type, issuing country, licence validity through return, required driving history where lawful, payment/renter relationship, geographic restrictions, category restrictions, and any permitted customer restrictions. Clearly distinguish preliminary online eligibility from final pickup verification. Do not request irrelevant evidence.
- Outcomes and recovery: Eligible proceeds; needs-review identifies the missing owner and next step; ineligible explains the applicable rule category and offers valid categories, dates, drivers, or support where available. A manager override is possible only for explicitly overridable rules and is audited.
- Acceptance evidence: The system cannot confirm a category that the declared primary driver is not allowed to rent.
- Related: FR-IAM-007, FR-RNT-003, FR-ADM-002

#### FR-BKG-003 — Renter, payer, and additional-driver details

- Applications/surfaces: All
- Actors: Customer, renter, additional driver, rental agent
- Functional behavior and rules: Identify the reservation owner, primary renter, payer, and every additional driver without assuming they are the same. Collect only required details and consents, show who must appear at pickup, and apply per-driver eligibility and charges. If an additional driver must complete information separately, issue a secure request and show its status without exposing the owner's unrelated data.
- Outcomes and recovery: Removing a driver releases related optional charges but cannot leave the reservation without an eligible primary renter. Unfinished additional-driver information is visibly pending and governed by pickup policy.
- Acceptance evidence: Staff can distinguish a payer from an authorized driver and cannot hand over to an undeclared, ineligible person.
- Related: FR-IAM-007, FR-PRC-003, FR-RNT-003

#### FR-BKG-004 — Reserve inventory during commitment

- Applications/surfaces: All
- Actors: Customer, rental agent
- Functional behavior and rules: Revalidate availability immediately before the payment or final commitment step. Convert a valid temporary hold into reserved capacity only as part of successful confirmation. For category bookings, reserve category capacity and assign a unit later; for exact-unit bookings, reserve the specified unit. The system must prevent capacity from falling below the configured safe level.
- Outcomes and recovery: Lost availability stops commitment, releases invalid holds, and offers transparent alternatives or retry. Staff override identifies displaced risk and requires authority and reason.
- Acceptance evidence: A payment success arriving after capacity loss cannot create an unfulfillable confirmed reservation; it enters controlled resolution and payment recovery.
- Related: FR-CAT-005, FR-CAT-006, FR-PAY-002

#### FR-BKG-005 — Terms, disclosures, and consent

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, renter, rental agent
- Functional behavior and rules: Before confirmation, display the final trip, booking model, price, payment schedule, deposit/hold, cancellation and no-show rules, eligibility conditions, pickup documents, mileage, fuel/charge, geographic use, extras, protection choices, privacy notices, and material terms. Capture explicit acceptance of required terms and separate optional marketing consent. Preserve language, version, timestamp, and actor.
- Outcomes and recovery: Changed terms or price require refreshed review; declined required terms stop booking without trapping the user. Staff-assisted acceptance identifies whether the customer accepted directly or the staff recorded permitted offline evidence.
- Acceptance evidence: A confirmed reservation can reproduce the exact terms and choices accepted.
- Related: FR-PRC-002, FR-PRC-006, FR-BKG-006

#### FR-BKG-006 — Confirm a reservation atomically

- Applications/surfaces: All
- Actors: Customer, rental agent, payment provider
- Preconditions: Eligibility is sufficient, terms accepted, price and availability valid, and required payment outcome obtained.
- Functional behavior and rules: Create one reservation reference, immutable booking snapshot, initial status, payment linkage, inventory commitment, policy versions, and customer/staff history as a single business outcome. Do not present confirmation until all required parts succeed. The confirmation identifies what is confirmed, what remains pending, pickup requirements, change/cancel route, and support route.
- Failure and recovery: If one part fails, do not leave a hidden confirmed booking. Reverse or release provisional inventory/payment as appropriate, show the resulting state, and place unresolved compensation in an owned operations queue.
- Acceptance evidence: A provider success combined with reservation-write failure results in a visible recovery case and no unexplained charge.
- Related: FR-BKG-004, FR-PAY-002, FR-INT-004

#### FR-BKG-007 — Prevent duplicate reservations

- Applications/surfaces: All
- Actors: Customer, rental agent
- Functional behavior and rules: Detect repeated confirmation attempts and likely duplicate reservations using the same checkout intent, customer/driver, trip, and provider result. Return the existing reservation for exact repeats. For plausible but non-identical duplicates, warn and require an explicit permitted decision rather than silently blocking legitimate multiple rentals.
- Outcomes and recovery: Duplicate prevention never creates a second charge. An authorized staff resolution is recorded.
- Acceptance evidence: Double-clicking confirm or retrying after a timeout results in one booking reference and one intended payment.
- Related: FR-GBL-006, FR-PAY-004, FR-BKG-008

#### FR-BKG-008 — Confirmation and booking communications

- Applications/surfaces: All
- Actors: Customer, rental agent, message provider
- Functional behavior and rules: Immediately show the confirmed reservation in the initiating surface and send enabled localized communications containing the reference, trip, vehicle/category promise, price summary, payment state, pickup requirements, policy links or attachments, and self-service route. Mask sensitive data. Communication delivery is separate from booking success.
- Outcomes and recovery: Delivery failure keeps the reservation confirmed, shows the message status to staff and customer where helpful, and permits safe resend or channel correction without duplicating the booking.
- Acceptance evidence: A failed email does not cancel a valid reservation, and a resend uses the same reference and current status.
- Related: FR-INT-002, FR-RSV-001, FR-GBL-005

#### FR-BKG-009 — Guest reservation access and account linking

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Guest customer, support staff
- Functional behavior and rules: When guest booking is enabled, provide secure access using the reservation reference plus configured identity verification. Expose only that guest's permitted reservation actions. Offer account creation or linking after verified ownership; linking must not merge unrelated customer records or expose other reservations.
- Outcomes and recovery: Failed verification reveals no reservation details and offers limited retry/support. An expired access session requires verification again.
- Acceptance evidence: Knowing a reservation reference alone is insufficient to view or change it.
- Related: FR-IAM-001, FR-IAM-002, FR-RSV-001

#### FR-BKG-010 — Staff-assisted reservation creation

- Applications/surfaces: APP-OPS
- Actors: Rental agent, support staff, customer
- Functional behavior and rules: Authorized staff can search availability, quote, record renter/driver data, apply only permitted rates and overrides, capture the customer's terms acceptance, take or record permitted payment, and create a reservation on behalf of the customer. The record identifies channel and acting staff. Staff must not bypass non-overridable eligibility, payment, or availability rules.
- Outcomes and recovery: Incomplete assisted bookings remain draft or pending with owner and expiry; cancellation releases holds. The customer receives confirmation through an available channel.
- Acceptance evidence: A support agent can complete a phone booking while every override, consent, and payment outcome remains attributable.
- Related: FR-BKG-002, FR-BKG-005, FR-ADM-004

#### 8.5 Payments, deposits, refunds, and disputes

#### FR-PAY-001 — Present eligible payment methods

- Applications/surfaces: All
- Actors: Customer, rental agent, finance staff
- Functional behavior and rules: Show only payment methods allowed for the transaction currency, country/location, channel, renter/payer relationship, amount, deposit requirement, and configured risk rules. Explain when payment is due, whether a method supports a security hold, and whether the named payer must be present. Never expose stored full payment credentials to staff.
- Outcomes and recovery: If no method qualifies, explain the relevant condition and permitted alternatives without confirming the reservation.
- Acceptance evidence: A method that cannot support a required deposit is not represented as valid for pickup.
- Related: FR-PRC-007, FR-PAY-003, FR-BKG-003

#### FR-PAY-002 — Collect the booking payment

- Applications/surfaces: All
- Actors: Customer, rental agent, payment provider
- Preconditions: Valid quote, availability, booking details, and accepted terms.
- Functional behavior and rules: Request the configured amount through the selected provider and represent pending, customer-action-required, authorized, captured, failed, cancelled, and unknown outcomes accurately. Confirm a reservation only when its configured payment condition is met. Payment references are linked to one booking intent.
- Outcomes and recovery: Failure or cancellation preserves the checkout when safe and permits retry or method change. An unknown timeout is reconciled before another charge attempt. Customer abandonment releases inventory under hold policy.
- Acceptance evidence: A provider timeout cannot produce both a hidden successful charge and a new duplicate charge.
- Related: FR-BKG-004, FR-BKG-006, FR-INT-001

#### FR-PAY-003 — Security authorization or deposit

- Applications/surfaces: All
- Actors: Customer, renter, rental agent, finance staff, payment provider
- Functional behavior and rules: Calculate and disclose the required security amount separately from rental charges. At the configured lifecycle point, authorize a hold or collect a deposit using an eligible method. Record amount, currency, provider status, expiry where applicable, and linkage to the rental. Changes to vehicle, duration, protection, or risk re-evaluate the requirement before acceptance.
- Outcomes and recovery: Insufficient or unsupported authorization blocks handover or routes to a permitted alternative. At closeout, release, capture, apply, or refund only the justified amount and show any remaining balance.
- Acceptance evidence: A released hold is not reported as a refund, and additional charges are itemized before any permitted use of the security amount.
- Related: FR-PRC-003, FR-RNT-003, FR-RNT-015

#### FR-PAY-004 — Payment failure, unknown state, and safe retry

- Applications/surfaces: All
- Actors: Customer, staff, payment provider
- Functional behavior and rules: Classify declined, customer-cancelled, authentication-required, expired, provider-unavailable, invalid-method, and unknown outcomes. Show customer-safe guidance while retaining staff-visible operational detail. Before retrying an unknown result, check the provider and internal record. Limit unsafe repeats and allow a different method where permitted.
- Outcomes and recovery: Terminal failure leaves no false confirmation. Unknown or inconsistent outcomes enter a reconciliation queue with owner, age, and safe next action.
- Acceptance evidence: Retrying after a lost response does not create an unlinked second capture.
- Related: FR-GBL-006, FR-PAY-009, FR-INT-004

#### FR-PAY-005 — Payment receipt and ledger view

- Applications/surfaces: All
- Actors: Customer, rental agent, finance staff
- Functional behavior and rules: For each authorized, captured, refunded, reversed, disputed, or failed transaction, show a localized receipt or status record containing reference, date/time, amount, currency, purpose, booking/rental link, method summary, and resulting balance. Customers see only their own permitted records; staff views follow scope and masking rules.
- Outcomes and recovery: Receipt delivery failure does not alter payment. Regeneration uses authoritative transaction data and is marked as a copy where appropriate.
- Acceptance evidence: The sum and status of booking payments, return adjustments, and refunds explain the current reservation balance.
- Related: FR-PAY-007, FR-PAY-009, FR-RNT-015

#### FR-PAY-006 — Cancellation refund

- Applications/surfaces: All
- Actors: Customer, rental agent, finance staff, payment provider
- Preconditions: A cancellation or reduction is accepted and the policy produces a refundable amount.
- Functional behavior and rules: Calculate the refundable amount from the preserved booking terms, consumed services, cancellation timing, and authorized overrides. Show the customer the breakdown before final cancellation when possible. Submit one refund against the eligible original payment and track pending, succeeded, failed, cancelled, or manual-review states.
- Outcomes and recovery: Refund failure does not reactivate the reservation; it creates an owned finance task and informs the customer of the pending resolution. A duplicate request returns the existing refund.
- Acceptance evidence: The cancelled booking, refund, retained fee if any, and remaining balance reconcile.
- Related: FR-RSV-003, FR-PAY-008, FR-GBL-006

#### FR-PAY-007 — Rental adjustments and additional charges

- Applications/surfaces: APP-OPS; customer view on APP-CWEB and APP-CMOB
- Actors: Rental agent, finance staff, customer
- Functional behavior and rules: Record justified additions or credits for approved extensions, excess distance, fuel/charging difference, one-way change, late return, extra services, damage, cleaning, tolls, fines, or other configured items. Each adjustment requires evidence category, calculation basis, tax treatment, actor, and approval where needed. Notify the customer and expose dispute/contact options according to policy.
- Outcomes and recovery: Unsupported, duplicate, or over-limit charges are blocked or require approval. Reversal creates a linked counter-transaction; it does not erase history.
- Acceptance evidence: Every post-booking balance change is itemized and attributable.
- Related: FR-RNT-013, FR-RNT-015, FR-PAY-008

#### FR-PAY-008 — Refund, reversal, and dispute management

- Applications/surfaces: APP-OPS; customer status where appropriate
- Actors: Finance staff, manager, customer, payment provider
- Functional behavior and rules: Authorized staff can review eligible amounts, issue full or partial refunds, reverse erroneous adjustments where possible, record external disputes, attach permitted evidence, and track deadlines and outcomes. The system prevents refunding more than the net captured eligible amount without an explicit supported exception.
- Outcomes and recovery: Provider rejection or inconsistent state enters review. Won, lost, withdrawn, refunded, and needs-evidence outcomes update the financial balance and audit history.
- Acceptance evidence: Two staff members cannot independently refund the same remaining amount.
- Related: FR-PAY-006, FR-PAY-009, FR-GBL-008

#### FR-PAY-009 — Payment reconciliation

- Applications/surfaces: APP-OPS
- Actors: Finance staff, manager
- Functional behavior and rules: Compare reservations and rentals with provider transactions, deposits, captures, refunds, reversals, disputes, and settlements. Identify missing links, amount/currency mismatches, duplicates, stuck pending items, and provider-only or system-only transactions. Each exception has severity, owner, age, notes, and resolution status.
- Outcomes and recovery: Resolution may link, correct through a permitted transaction, mark explained, or escalate; it never deletes evidence. Closed exceptions retain the decision and actor.
- Acceptance evidence: Finance can account for every provider transaction or place it in an owned unresolved queue.
- Related: FR-PAY-004, FR-PAY-005, FR-RPT-004

#### 8.6 Reservation self-service and lifecycle

#### FR-RSV-001 — View reservations

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, rental agent, support staff
- Functional behavior and rules: Show upcoming, active-linked, completed, cancelled, expired, and no-show reservations according to access. Detail includes reference, status, trip, vehicle/category promise, drivers, extras, price, payment/refund state, pickup instructions, policy summary, history, and currently permitted actions. Sensitive data is masked.
- Outcomes and recovery: A missing or inaccessible reservation reveals no unrelated data and provides verified lookup or support routes.
- Acceptance evidence: Staff and customer see consistent status while each sees only role-appropriate detail.
- Related: FR-BKG-008, FR-RSV-007, FR-RNT-005

#### FR-RSV-002 — Modify a reservation

- Applications/surfaces: All
- Actors: Customer, rental agent, support staff
- Preconditions: Reservation status and policy permit the requested change.
- Functional behavior and rules: Allow configured changes to dates/times, locations, category, driver, extras, contact data, and other permitted fields. Recheck eligibility, availability, policies, and full pricing. Show old versus new values, price difference, amount due/refundable, and changed terms before confirmation. Commit the inventory release and new allocation as one controlled outcome.
- Outcomes and recovery: If the new option fails, the original reservation remains unchanged. Provider or notification failure does not leave ambiguous inventory. Restricted changes route to staff.
- Acceptance evidence: A failed date change cannot lose the customer's original vehicle capacity.
- Related: FR-CAT-005, FR-PRC-002, FR-PAY-007

#### FR-RSV-003 — Cancel a reservation

- Applications/surfaces: All
- Actors: Customer, rental agent, support staff
- Functional behavior and rules: Show cancellation eligibility, effective policy, retained charge, expected refund, released extras, and consequences before confirmation. Require a reason only where configured and never use it to block a permitted cancellation. On acceptance, set the terminal status, release inventory/extras, stop inappropriate reminders, initiate any refund, and send confirmation.
- Outcomes and recovery: Repeated cancellation returns the existing outcome. If refund or message processing fails, cancellation remains effective and follow-up is owned. After rental opening, use early-return/termination rules rather than reservation cancellation.
- Acceptance evidence: Cancelled capacity becomes available only after the cancellation commit and cannot still be picked up accidentally.
- Related: FR-PAY-006, FR-CAT-005, FR-INT-002

#### FR-RSV-004 — Late pickup and no-show handling

- Applications/surfaces: All
- Actors: Customer, rental agent, manager
- Functional behavior and rules: Apply configured grace, contact attempts, guarantee conditions, and no-show policy in the rental location's time zone. Customers can report a delay or request a permitted pickup-time change. Staff see at-risk reservations and may extend the hold only with authority and availability. Marking no-show releases inventory and triggers disclosed financial treatment and notification.
- Outcomes and recovery: A customer arriving after release cannot be handed an unavailable unit; staff may quote a new valid alternative. Incorrect no-show marking can be reversed only through an audited correction that preserves financial history.
- Acceptance evidence: No-show status has a timestamp, actor/rule, inventory effect, payment effect, and next action.
- Related: FR-RSV-003, FR-RNT-001, FR-PRC-003

#### FR-RSV-005 — Pending and expiring reservations

- Applications/surfaces: All
- Actors: Customer, rental agent, support staff
- Functional behavior and rules: Reservations awaiting payment, verification, approval, driver data, or another prerequisite must show the missing item, owner, deadline if applicable, inventory effect, and permitted actions. Expiry rules are configurable and produce a final state, inventory release, payment handling, and communication.
- Outcomes and recovery: Completed requirements move the reservation forward only after revalidation. Expired reservations are not silently revived; the user creates or accepts a new quote.
- Acceptance evidence: No pending reservation can hold inventory indefinitely without a visible rule and owner.
- Related: FR-BKG-010, FR-CAT-006, FR-PAY-004

#### FR-RSV-006 — Authorized manual override

- Applications/surfaces: APP-OPS
- Actors: Manager, specifically authorized staff
- Functional behavior and rules: Allow overrides only for rules explicitly marked overridable, such as limited price, fee, time, or allocation exceptions. Before confirmation show impact on price, inventory, customer promise, and downstream work. Require reason and, above configured boundaries, separate approval. Non-overridable legal, safety, security, or provider constraints cannot be bypassed.
- Outcomes and recovery: Rejected approval leaves the prior state. Revocation creates a new audited action and any customer/payment effects are resolved explicitly.
- Acceptance evidence: Every override reports rule, old/new result, actor, approver where needed, and reason.
- Related: FR-GBL-008, FR-ADM-009, FR-PRC-003

#### FR-RSV-007 — Reservation lifecycle history

- Applications/surfaces: All
- Actors: Customer, staff, auditor
- Functional behavior and rules: Maintain chronological events for creation, pending prerequisites, confirmation, modifications, assignment, pickup readiness, cancellation, no-show, rental opening, and completion linkage. Customer history uses clear business language; authorized staff history includes source, reasons, and before/after values.
- Outcomes and recovery: Corrections append a compensating event rather than rewriting past events. Exports respect masking and scope.
- Acceptance evidence: An investigator can reconstruct how the current reservation state was reached.
- Related: FR-GBL-005, FR-GBL-008, FR-RNT-005

#### 8.7 Pickup, active rental, return, and closeout

#### FR-RNT-001 — Pickup readiness and operations queue

- Applications/surfaces: APP-OPS; customer status on APP-CWEB and APP-CMOB
- Actors: Rental agent, fleet staff, customer
- Functional behavior and rules: Create a location-scoped readiness queue for upcoming pickups, highlighting vehicle assignment, cleaning/maintenance readiness, document or payment prerequisites, extras, customer arrival notes, and risk of delay. Owners can resolve tasks and record blockers. Customers receive only confirmed, useful readiness instructions and must not be told a vehicle is ready when blocking work remains.
- Outcomes and recovery: Unready bookings route to substitution, delayed pickup, customer contact, or escalation with owner and deadline.
- Acceptance evidence: Every pickup due soon has a visible readiness state and unresolved blocker owner.
- Related: FR-RSV-004, FR-RNT-002, FR-FLT-006

#### FR-RNT-002 — Assign or substitute a vehicle unit

- Applications/surfaces: APP-OPS
- Actors: Rental agent, fleet staff, manager
- Preconditions: A reservation requires a unit and the candidate is eligible, available, at the correct location, and ready.
- Functional behavior and rules: Assign a specific unit to category capacity before or at pickup according to policy. Prevent overlapping assignments. If the reserved category cannot be supplied, offer an eligible substitute and show any customer, price, feature, protection, and operational impact. Upgrades, downgrades, and manual exceptions require the configured approval and customer acknowledgement when the promise changes.
- Outcomes and recovery: Reassignment releases the old unit only as the new assignment succeeds. No acceptable unit creates an owned service-recovery case with alternatives, refund/cancellation route, and communication.
- Acceptance evidence: One unit cannot be simultaneously assigned to overlapping open rentals.
- Related: FR-CAT-005, FR-FLT-003, FR-RNT-003

#### FR-RNT-003 — Pickup identity, document, eligibility, and payment verification

- Applications/surfaces: APP-OPS; status/instructions on customer surfaces
- Actors: Renter, additional driver, rental agent, payment provider
- Functional behavior and rules: At pickup, verify the present renter, each required driver, original or accepted documents, licence validity, booking eligibility, accepted payment method, payer rules, security authorization/deposit, and any location-specific prerequisites. Record verified, failed, waived where legally permitted, or needs-review outcomes without storing unnecessary sensitive copies.
- Outcomes and recovery: Failure blocks handover and offers correction, eligible driver/category substitution, additional evidence, manager review, reschedule, or cancellation under the disclosed policy. An override is limited to configured non-safety rules.
- Acceptance evidence: Vehicle handover cannot complete while a non-waivable eligibility check is failed or missing.
- Related: FR-BKG-002, FR-IAM-007, FR-PAY-003

#### FR-RNT-004 — Vehicle handover and rental agreement

- Applications/surfaces: APP-OPS; agreement/summary on customer surfaces
- Actors: Renter, rental agent, fleet staff
- Preconditions: Eligible renter, assigned ready vehicle, and required payment outcome.
- Functional behavior and rules: Record actual pickup date/time/location, unit, odometer, fuel or battery level, existing condition evidence, issued keys/equipment, extras, authorized drivers, selected protection, geographic/use restrictions, return instructions, emergency contact route, and final opening charges. Present the rental agreement in the renter's chosen supported language and capture required acknowledgement/signature.
- Outcomes and recovery: Disputed starting condition is corrected or escalated before handover. Aborted handover leaves the reservation/rental, inventory, and payment in explicit reconciled states.
- Acceptance evidence: Opening a rental produces a retrievable agreement and changes the vehicle to on-rent only once.
- Related: FR-RNT-002, FR-RNT-005, FR-FLT-006

#### FR-RNT-005 — View and service an active rental

- Applications/surfaces: All
- Actors: Customer, renter, rental agent, support staff
- Functional behavior and rules: Show active rental reference, assigned vehicle, authorized drivers, planned return, current known balance, included usage terms, protection summary, support contacts, and available actions such as extension request, issue report, incident report, or return instructions. Distinguish an active rental from its original reservation and retain links between them.
- Outcomes and recovery: Actions unavailable because of status, policy, or connectivity explain why and provide the next valid route. Sensitive operational notes remain staff-only.
- Acceptance evidence: A customer can identify the active agreement and correct emergency/support path without relying on the old booking status.
- Related: FR-RNT-006, FR-RNT-008, FR-RNT-009

#### FR-RNT-006 — Request and approve an extension

- Applications/surfaces: All
- Actors: Customer, rental agent, manager
- Functional behavior and rules: Accept a proposed new return date/time/location; re-evaluate future availability, downstream reservations, maintenance, rate, taxes/fees, eligibility, payment/deposit, and location hours. Show the price difference and changed terms. Customer self-service confirms only when all required checks pass; otherwise create a staff-owned request. Approved extensions update the agreement, expected return, availability, payment, and notifications together.
- Outcomes and recovery: Rejection leaves the current return obligation unchanged and explains alternatives. Payment or update failure cannot present approval; an unknown partial result enters reconciliation.
- Acceptance evidence: An extension that would conflict with the next reservation is rejected or resolved through an explicit reallocation workflow.
- Related: FR-CAT-005, FR-PAY-007, FR-FLT-005

#### FR-RNT-007 — Early, late, and overdue return management

- Applications/surfaces: All
- Actors: Customer, rental agent, manager
- Functional behavior and rules: Customers can review return instructions and report a planned early or late return. The system calculates disclosed price effects under the active agreement and offers extension where eligible. Staff queues identify rentals approaching due, within configured grace, late, or overdue, with contact history and escalation owner. Overdue status affects availability and prevents conflicting assignment.
- Outcomes and recovery: Early return does not promise a refund unless policy allows it. Unapproved late return creates configured charges and escalation without silently extending the agreement.
- Acceptance evidence: Overdue status updates fleet availability and downstream conflict alerts immediately.
- Related: FR-RNT-006, FR-RNT-011, FR-PAY-007

#### FR-RNT-008 — Breakdown and roadside assistance

- Applications/surfaces: All
- Actors: Customer, renter, support staff, fleet staff, external assistance provider if configured
- Functional behavior and rules: Provide a clear support route and capture safe location/contact details, vehicle, issue category, drivability status, and assistance need. Give a case reference, status, responsible party, and next instructions. Route urgent cases according to configured safety procedures without requiring the customer to diagnose the vehicle. Link costs and responsibility only after review under the agreement.
- Outcomes and recovery: Provider failure or loss of connectivity offers alternate contact and keeps the case visible. Resolution may be advice, dispatch, tow, repair, replacement, or rental termination.
- Acceptance evidence: Every reported breakdown has an owner, current status, customer communication, and final resolution.
- Related: FR-RNT-010, FR-FLT-005, FR-INT-005

#### FR-RNT-009 — Accident, damage, theft, or other incident report

- Applications/surfaces: All
- Actors: Renter, rental agent, fleet staff, manager
- Functional behavior and rules: Let the renter or staff report an incident with time, place, people/authority references where appropriate, description, vehicle condition, and permitted evidence. Show immediate safety and contact instructions defined by the business. Preserve the report, assign severity/status/owner, mark vehicle availability appropriately, and link applicable protection and agreement terms without making an automatic liability conclusion.
- Outcomes and recovery: Incomplete reports remain pending with a follow-up route. Duplicate reports can be linked. Resolution may include vehicle continuation, replacement, recovery, maintenance/damage case, charge review, insurer handling, or closure.
- Acceptance evidence: Reporting an incident can immediately block an unsafe vehicle and notify responsible operations staff.
- Related: FR-PRC-006, FR-RNT-010, FR-FLT-006

#### FR-RNT-010 — Replacement vehicle

- Applications/surfaces: APP-OPS; customer acknowledgement on customer surfaces where enabled
- Actors: Rental agent, fleet staff, manager, customer
- Functional behavior and rules: When a unit cannot continue, search eligible replacements using location, category promise, driver eligibility, availability, remaining dates, features, extras, and protection. Record old-unit return/recovery condition, new-unit handover condition, effective time, price treatment, agreement amendment, and customer acknowledgement. Inventory status changes must be coordinated.
- Outcomes and recovery: No replacement creates an owned service-recovery path such as alternate location, transport support where offered, early termination, or refund review. A failed transfer leaves neither unit ambiguously on rent.
- Acceptance evidence: Rental history clearly shows which unit was in use during each period.
- Related: FR-RNT-002, FR-RNT-008, FR-FLT-003

#### FR-RNT-011 — Receive a vehicle return

- Applications/surfaces: APP-OPS; customer status on customer surfaces
- Actors: Renter, rental agent, fleet staff
- Functional behavior and rules: Record actual return time and location, receiving actor or after-hours method, odometer, fuel or battery level, keys/equipment, cleanliness, visible condition, and customer-reported issues. Compare against opening and subsequent condition evidence. Mark the rental returned-pending-inspection or an equivalent controlled state; do not make the unit bookable until readiness rules pass.
- Outcomes and recovery: Missing keys/equipment, location mismatch, disputed readings, or apparent new damage creates explicit tasks and potential adjustments, not silent closure.
- Acceptance evidence: Return ends active possession status but does not prematurely declare the unit available.
- Related: FR-RNT-012, FR-RNT-014, FR-FLT-006

#### FR-RNT-012 — Return inspection and damage assessment

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, rental agent, manager
- Functional behavior and rules: Perform or record the required inspection, compare with check-out condition, classify new findings using controlled categories, attach time-stamped evidence, estimate or record review status, and separate normal wear from charge-review candidates under policy. A second review or approval is required for configured severity or value thresholds.
- Outcomes and recovery: Uncertain or disputed findings remain under review with the vehicle's safe availability status explicit. Corrections preserve original evidence and reason.
- Acceptance evidence: A damage charge cannot be finalized without a linked inspection finding and permitted evidence/approval.
- Related: FR-RNT-009, FR-RNT-013, FR-FLT-006

#### FR-RNT-013 — Calculate final adjustments

- Applications/surfaces: APP-OPS; customer statement on customer surfaces
- Actors: Rental agent, finance staff, customer
- Functional behavior and rules: Compare actual rental facts with the agreement and calculate additional time, excess distance, fuel/charge, location change, extras, damage, cleaning, missing items, tolls/fines, credits, taxes, and approved waivers. Show evidence and calculation basis. Separate immediately known items from later-posted items and disclose the later-charge policy.
- Outcomes and recovery: A disputed item can be placed under review without hiding undisputed balance. Duplicate or unsupported adjustments are blocked. Changes after customer review create an updated statement and notification.
- Acceptance evidence: Each final amount traces to an agreement term, actual recorded fact, or approved credit.
- Related: FR-PAY-007, FR-RNT-012, FR-RNT-015

#### FR-RNT-014 — After-hours return

- Applications/surfaces: All
- Actors: Customer, renter, rental agent, fleet staff
- Functional behavior and rules: Where a location permits after-hours return, show exact drop-off, key/equipment, parking, evidence, time responsibility, and support instructions before return. Record customer check-in if offered, but state when possession/risk and inspection completion are recognized under policy. The next operating queue must surface every unattended return.
- Outcomes and recovery: Invalid location, inaccessible drop point, missing key confirmation, or reported issue gives an alternate contact route. The rental remains in the correct pending state until staff completes reception and inspection.
- Acceptance evidence: An after-hours return cannot disappear between customer acknowledgement and staff inspection.
- Related: FR-CAT-004, FR-RNT-011, FR-INT-002

#### FR-RNT-015 — Close the rental and settle the account

- Applications/surfaces: All
- Actors: Rental agent, finance staff, customer, payment provider
- Preconditions: Return recorded and all immediately required reviews completed or explicitly deferred.
- Functional behavior and rules: Produce a final or interim statement, apply permitted captures/credits, update the security hold/deposit, record remaining balance, close operational tasks, update vehicle status, and send a localized statement. Later-posted charges remain linked to the closed rental and follow notice/dispute rules. Closed rental facts cannot be silently edited.
- Outcomes and recovery: Payment or release failure leaves the rental financially pending with owner and customer-visible status, without incorrectly keeping the vehicle on rent. A correction uses adjustments and revised statement.
- Acceptance evidence: Operational closure, vehicle availability, payment balance, deposit outcome, and customer document are mutually consistent.
- Related: FR-PAY-003, FR-PAY-005, FR-FLT-003

#### FR-RNT-016 — Post-rental tolls, fines, claims, and lost property

- Applications/surfaces: APP-OPS; customer communication on customer surfaces
- Actors: Finance staff, support staff, fleet staff, customer
- Functional behavior and rules: Record later-received tolls, fines, damage claims, or found-property cases against the correct unit and rental period. Validate time and vehicle linkage, apply only disclosed administration/charge rules, preserve evidence, notify the customer, and provide payment or dispute/contact options. Lost property is tracked without exposing one customer's information to another.
- Outcomes and recovery: Unmatched items enter an investigation queue. Disputed or reversed items retain full history. Found property has storage, claimant-verification, return, disposal/expiry, and closure states according to configured policy.
- Acceptance evidence: A later charge cannot be assigned merely by current vehicle holder; it must match the responsible rental interval.
- Related: FR-PAY-007, FR-PAY-008, FR-GBL-008

#### 8.8 Fleet, maintenance, inspections, and availability controls

#### FR-FLT-001 — Manage vehicle units

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager, administrator
- Functional behavior and rules: Create and maintain a unique unit record with fleet identifier, registration/plate, vehicle identification reference, make/model/year, category, location, ownership/lease status if used, energy type, odometer, operational status, key attributes, documents, and permitted notes. Prevent duplicate identifiers. Deletion is allowed only for unused erroneous drafts; operational units are retired or archived.
- Outcomes and recovery: Invalid category/location changes are blocked while assignments or rentals conflict. Corrections preserve audit history.
- Acceptance evidence: Every assigned rental unit is uniquely identifiable and historically traceable.
- Related: FR-FLT-002, FR-FLT-003, FR-GBL-008

#### FR-FLT-002 — Manage bookable categories and catalogue content

- Applications/surfaces: APP-OPS; consumed by customer surfaces
- Actors: Manager, fleet staff, content administrator
- Functional behavior and rules: Manage stable category codes, localized names/descriptions, representative models, capacity, luggage guidance, transmission, doors, energy type, features, images, eligibility restrictions, display order, and active locations. A unit belongs to one valid operational category at a time. Public content changes are previewable by language.
- Outcomes and recovery: A category with future reservations cannot be destructively removed; it may be deactivated for new sales while remaining visible historically.
- Acceptance evidence: Customer catalogue labels and staff allocation rules reference the same category code.
- Related: FR-CAT-001, FR-CAT-003, FR-ADM-012

#### FR-FLT-003 — Vehicle lifecycle and availability status

- Applications/surfaces: APP-OPS
- Actors: Rental agent, fleet staff, manager
- Functional behavior and rules: Use controlled states for draft, available, held/assigned, pickup-ready, on-rent, returned-pending-inspection, cleaning, maintenance, damage-review, transfer, unavailable, retired, and other approved states. Permit only valid transitions with required actor, reason, and linked work. A display label may be translated but the internal state remains stable.
- Outcomes and recovery: Illegal or conflicting transition is rejected with current state and corrective action. Emergency unavailability immediately affects sales and assignments.
- Acceptance evidence: A unit cannot be both available and on-rent or in maintenance.
- Related: FR-CAT-005, FR-RNT-004, state model in Section 11

#### FR-FLT-004 — Vehicle location and transfer

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager
- Functional behavior and rules: Record current, planned, and destination location; transfer dates; responsible person; status; odometer/fuel or charge where relevant; and impact on reservations. A planned transfer contributes to future availability only when feasible. Departure and arrival confirmations update custody and exceptions.
- Outcomes and recovery: Delay or cancellation recalculates affected availability and creates reassignment/contact tasks. A unit cannot be accepted at two locations simultaneously.
- Acceptance evidence: Future one-way demand and planned transfers do not overpromise the same unit.
- Related: FR-CAT-005, FR-RNT-002, FR-ADM-007

#### FR-FLT-005 — Preventive and corrective maintenance

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager
- Functional behavior and rules: Schedule maintenance by date, odometer, time, alert, or reported issue; assign owner/vendor where used; record work type, priority, expected duration, cost, documents, and completion evidence. Due or unsafe maintenance blocks availability according to policy. Completing work requires readiness decision and updated odometer/date triggers.
- Outcomes and recovery: Overdue work appears in escalation queues. Rescheduling shows reservation impact. Reopened work returns the unit to the appropriate unavailable state.
- Acceptance evidence: A unit with a safety-critical open task cannot be assigned through a manual availability change.
- Related: FR-RNT-008, FR-FLT-003, FR-FLT-007

#### FR-FLT-006 — Inspection, damage, cleaning, and readiness history

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, rental agent, manager
- Functional behavior and rules: Record inspection type, checklist, condition findings, photos/documents, odometer, fuel/charge, cleanliness, missing items, reviewer, timestamp, and readiness outcome at configured lifecycle points. Link findings across pre-rental, return, incident, maintenance, and repair records. Checklists and reason options come from controlled reference data.
- Outcomes and recovery: Incomplete or failed inspection blocks readiness and creates owned work. A corrected inspection preserves the earlier record.
- Acceptance evidence: Staff can compare the unit's condition immediately before and after a rental.
- Related: FR-RNT-004, FR-RNT-012, FR-GBL-004

#### FR-FLT-007 — Manual availability block and release

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager
- Functional behavior and rules: Authorized staff can block a category quantity or unit for a date/time range and reason such as maintenance, damage, internal use, regulatory restriction, transfer, or operational buffer. Before saving, show affected holds, reservations, assignments, and offers. Release or shorten a block re-evaluates availability but does not automatically confirm waiting demand unless that workflow is configured.
- Outcomes and recovery: A conflicting block requires resolution or authorized override with owned customer-impact tasks. Expired blocks close visibly.
- Acceptance evidence: Blocking an assigned unit immediately produces a reassignment alert rather than silently breaking the booking.
- Related: FR-CAT-005, FR-RNT-002, FR-GBL-008

#### FR-FLT-008 — Fleet import, bulk update, and export

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, administrator
- Functional behavior and rules: Authorized users may import or bulk-change supported fleet fields using a preview that validates identifiers, references, formats, duplicates, permissions, and active operational conflicts. Each row reports accepted, rejected, or unchanged result. High-risk fields require narrower permissions or individual workflow. Export respects location and data scope.
- Outcomes and recovery: Partial imports do not hide failures; retry can target failed rows without duplicating accepted units. Bulk rollback is performed through auditable corrective actions where supported.
- Acceptance evidence: An invalid category in one row does not corrupt or ambiguously skip the rest of the file.
- Related: FR-FLT-001, FR-GBL-008, FR-ADM-009

#### FR-FLT-009 — Vehicle document and expiry tracking

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager
- Functional behavior and rules: Track configured documents and obligations such as registration, inspection, insurance evidence, permits, and lease documents with effective/expiry dates, status, attachments, reminders, and applicability by location or vehicle. Expired critical items block availability according to policy.
- Outcomes and recovery: Missing or expiring items appear in queues and reports with owner. Renewals create a new period while retaining prior evidence.
- Acceptance evidence: An expired mandatory document cannot be hidden by changing the vehicle status to available.
- Related: FR-FLT-003, FR-FLT-005, FR-INT-002

#### 8.9 Customers, staff, locations, and business configuration

#### FR-ADM-001 — Search and manage customer records

- Applications/surfaces: APP-OPS
- Actors: Rental agent, support staff, manager, administrator
- Functional behavior and rules: Search using permitted identifiers and view a consolidated customer record containing verified contact details, preferences, drivers, reservations, rentals, balances, service cases, consent state, and relevant restrictions. Authorized corrections preserve transactional snapshots and audit history. Potential duplicates are reviewed before merge; merging requires verified identity and a reversible mapping record.
- Outcomes and recovery: No match supports creation only after duplicate checks. Ambiguous matches require refinement; sensitive detail remains masked until a record is deliberately opened by an authorized actor.
- Acceptance evidence: Staff can assist the correct customer without exposing a list of unrelated personal data.
- Related: FR-IAM-006, FR-IAM-008, FR-ADM-002

#### FR-ADM-002 — Customer eligibility restriction and review

- Applications/surfaces: APP-OPS
- Actors: Manager, specifically authorized staff
- Functional behavior and rules: Record permitted restriction or review flags with category, scope, effective/expiry dates, evidence reference, reason, approver, customer-notification treatment, and review path. Restrictions may influence booking or pickup only as configured and lawful. Free-text notes alone cannot silently create a system-enforced denial.
- Outcomes and recovery: Expired restrictions stop applying but remain historical. Correction, appeal/review, and removal are audited. Customer-facing explanations disclose the appropriate rule category without exposing internal risk detail.
- Acceptance evidence: A restriction affects only its defined person, scope, and period and cannot be created by unauthorized support staff.
- Related: FR-BKG-002, FR-RNT-003, FR-GBL-008

#### FR-ADM-003 — Unified reservation and rental search

- Applications/surfaces: APP-OPS
- Actors: Rental agent, support staff, manager, finance staff
- Functional behavior and rules: Search and filter reservations and rentals by reference, customer, driver, location, dates, vehicle/category, status, payment state, channel, and assigned staff where permitted. Results distinguish reservation from active rental and surface urgent blockers. Saved views may be private or role-shared according to permission.
- Outcomes and recovery: Large or partial result sets show active filters and export status. No result offers corrected search or verified guest lookup rather than revealing restricted data.
- Acceptance evidence: Staff can find an overdue rental from its plate or reservation reference and reach the permitted next action.
- Related: FR-RSV-001, FR-RNT-005, FR-ADM-004

#### FR-ADM-004 — Operations queues and case ownership

- Applications/surfaces: APP-OPS
- Actors: Rental agent, fleet staff, finance staff, support staff, manager
- Functional behavior and rules: Provide role/location-scoped queues for upcoming pickup, unready vehicle, pending eligibility, failed/unknown payment, refund failure, extension request, overdue rental, incident, return inspection, reconciliation, expiring document, and integration failure. Each item shows priority, due/age, owner, dependencies, customer impact, status, and next valid actions.
- Outcomes and recovery: Assignment, escalation, snooze where permitted, resolution, reopening, and transfer preserve history. An item cannot be closed while a required downstream outcome remains unexplained.
- Acceptance evidence: Every partial or failed cross-system action created by this document appears in an owned queue until resolved.
- Related: FR-INT-004, FR-RNT-001, FR-PAY-009

#### FR-ADM-005 — Pricing and promotion administration

- Applications/surfaces: APP-OPS
- Actors: Manager, administrator
- Functional behavior and rules: Provide one governed area for rate plans, seasons, discounts, promotions, taxes, fees, deposits, included usage, late/no-show/cancellation rules, one-way pricing, and override boundaries. Configuration supports draft, effective dates, preview scenarios, approval where required, and conflict detection. Authorized users can see which offers and reservations used a version.
- Outcomes and recovery: Invalid or incomplete configuration cannot become active. Pausing future use does not alter confirmed transaction snapshots.
- Acceptance evidence: A manager can preview a sample quote before publishing a new rate version.
- Related: FR-PRC-001, FR-PRC-003, FR-PRC-004

#### FR-ADM-006 — Extras and protection administration

- Applications/surfaces: APP-OPS
- Actors: Manager, fleet staff, administrator
- Functional behavior and rules: Manage localized extras and protection products, applicability, pricing, stock behavior, quantity limits, included/excluded categories and locations, effective dates, terms versions, fulfilment steps, and active state. System-fixed legal/protection codes remain constrained where integrations or reporting depend on them. Historical selections retain the accepted label, price, and terms.
- Outcomes and recovery: Deactivation prevents new selection and identifies future affected reservations for resolution when fulfilment is no longer possible.
- Acceptance evidence: Public choices, fleet preparation, agreement content, and final charges use the same configured product version.
- Related: FR-PRC-005, FR-PRC-006, FR-GBL-004

#### FR-ADM-007 — Location and operating-policy administration

- Applications/surfaces: APP-OPS
- Actors: Manager, administrator
- Functional behavior and rules: Manage locations, localized public content, addresses, coordinates where used, contact channels, time zone, operating and holiday hours, pickup/return instructions, after-hours capability, supported categories/services, one-way routes, payment methods, and location-specific policies within global boundaries. Changes show future reservation impact.
- Outcomes and recovery: Closure or material instruction change creates an impact list and owned communication/reaccommodation tasks. A location with history is archived, not erased.
- Acceptance evidence: New searches obey changed hours while existing customers receive appropriate updated instructions.
- Related: FR-CAT-004, FR-FLT-004, FR-INT-002

#### FR-ADM-008 — Reference-data catalogue

- Applications/surfaces: APP-OPS
- Actors: Administrator, manager, authorized data steward
- Functional behavior and rules: List every business option set with stable type/code, classification, owner, consumer surfaces, editable fields, translations, order, status, usage count, effective dates if needed, and reason for read-only constraints. Configurable examples include cancellation reasons, incident categories, inspection finding types, equipment types, service-case reasons, and document types. System-fixed examples include protected lifecycle states, permission actions, payment outcome families, and externally mandated codes.
- Outcomes and recovery: Rename, deactivation, merge where supported, and replacement preserve historical meaning. Destructive deletion is blocked when used. Import changes are previewed.
- Acceptance evidence: No business dropdown is maintained as an invisible surface-specific list disconnected from the catalogue or entity owner.
- Related: FR-GBL-004, FR-ADM-012, FR-GBL-008

#### FR-ADM-009 — Staff accounts, roles, permissions, and scope

- Applications/surfaces: APP-OPS
- Actors: Administrator, manager within delegated scope
- Functional behavior and rules: Invite, activate, suspend, and deactivate staff; assign one or more roles and location/business scopes; and manage explicit action permissions for viewing, creating, changing, approving, refunding, overriding, exporting, and administering sensitive data. Prevent self-escalation and preserve at least one authorized administrator. High-risk role changes require renewed verification and configured approval.
- Outcomes and recovery: Suspension ends future access without reassigning historical actions. Removing a role identifies owned open work for reassignment. Failed invitation can be resent without duplicate accounts.
- Acceptance evidence: A location agent cannot view another location or issue an unrestricted refund unless explicitly granted.
- Related: FR-IAM-003, FR-GBL-008, FR-ADM-004

#### FR-ADM-010 — Business rules and policy configuration

- Applications/surfaces: APP-OPS
- Actors: Manager, administrator
- Functional behavior and rules: Configure organization-specific eligibility thresholds, hold duration, buffers, grace periods, cancellation/no-show treatment, deposit logic, extension rules, mileage, fuel/charge, after-hours, document, approval, and notification policies by permitted scope. Every policy has owner, effective period, version, precedence, default/fallback behavior, and impact preview. Fixed legal or safety constraints are visible but not freely editable.
- Outcomes and recovery: Overlap, gaps, or invalid precedence block activation. Emergency pause is explicit and audited. Past agreements retain their accepted policy version.
- Acceptance evidence: Staff can explain which policy version produced a decision for a given reservation.
- Related: FR-PRC-003, FR-RSV-006, FR-GBL-004

#### FR-ADM-011 — Notification templates and event rules

- Applications/surfaces: APP-OPS
- Actors: Administrator, manager, authorized content editor
- Functional behavior and rules: Manage localized templates, enabled channels, trigger event, audience, timing, retry/escalation behavior, sender identity, required legal content, and variables. Preview with safe sample values and validate all supported languages before activation. Transactional messages cannot be disabled if doing so would leave a required flow without notice.
- Outcomes and recovery: Invalid variables or missing required translations block publishing. Version changes apply prospectively and remain traceable for sent messages.
- Acceptance evidence: A cancellation message uses the correct language, booking values, refund status, and current approved template.
- Related: FR-GBL-002, FR-INT-002, FR-ADM-012

#### FR-ADM-012 — Translation catalogue and localized content

- Applications/surfaces: APP-OPS
- Actors: Administrator, translator/content editor
- Functional behavior and rules: View completeness and publish status by language for interface content, lookup labels, categories, extras, protection summaries, location content, policies, templates, receipts, and generated documents. Editors can draft, review, approve, publish, and retire translations according to role. The system highlights missing, outdated, and fallback content.
- Outcomes and recovery: Publishing cannot break stable internal codes. A rejected translation returns to draft with reviewer note. Fallback use is reportable.
- Acceptance evidence: Administrators can identify every customer-visible fallback before launching a language.
- Related: FR-GBL-002, FR-FLT-002, FR-ADM-011

#### 8.10 Dashboards, reports, and exports

#### FR-RPT-001 — Operational dashboard

- Applications/surfaces: APP-OPS
- Actors: Rental agent, fleet staff, finance staff, manager
- Functional behavior and rules: Show role- and location-appropriate summaries for today's pickups/returns, unready units, active/overdue rentals, available fleet, payment/refund exceptions, incidents, maintenance due, and open service cases. Every metric states its period, scope, freshness, and definition and links to the filtered underlying records.
- Outcomes and recovery: Unavailable or stale data is labeled; it is not rendered as zero. Users can refresh and retain scope.
- Acceptance evidence: The count of overdue rentals drills into the same records used to calculate it.
- Related: FR-ADM-004, FR-RPT-006, FR-GBL-005

#### FR-RPT-002 — Revenue report

- Applications/surfaces: APP-OPS
- Actors: Finance staff, manager, auditor
- Functional behavior and rules: Report captured rental revenue, discounts, taxes, fees, extras, adjustments, refunds, disputes, and net amounts by permitted date basis, location, category, channel, and currency. Define whether dates refer to booking, pickup, return, capture, or settlement and prevent meaningless cross-currency totals without an approved conversion basis.
- Outcomes and recovery: Late adjustments update the appropriate report period and retain prior export traceability. Missing provider data is flagged.
- Acceptance evidence: Report totals reconcile to payment records for the same scope and definition.
- Related: FR-PAY-009, FR-RPT-004, FR-PRC-007

#### FR-RPT-003 — Fleet utilization report

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager, auditor
- Functional behavior and rules: Report available, reserved, on-rent, maintenance, damage, cleaning, transfer, and other time by unit/category/location using a documented denominator and time zone. Allow comparison across periods and drill-down to contributing intervals. Distinguish utilization from booking demand and from physical availability.
- Outcomes and recovery: Missing or overlapping state intervals are flagged as data-quality exceptions, not silently normalized.
- Acceptance evidence: A unit blocked for maintenance is not counted as rentable available time.
- Related: FR-FLT-003, FR-FLT-005, FR-RPT-006

#### FR-RPT-004 — Booking and payment performance reports

- Applications/surfaces: APP-OPS
- Actors: Manager, finance staff
- Functional behavior and rules: Report bookings, conversion where measurable, modifications, cancellations, no-shows, extensions, rental completions, payment success/failure, refunds, and reconciliation exceptions by permitted dimensions. Metric definitions, filters, exclusions, and freshness are visible.
- Outcomes and recovery: A report with incomplete events shows the gap and affected period. Users may save common filter sets.
- Acceptance evidence: Cancellation rate numerator and denominator are explicitly defined and drillable.
- Related: FR-RSV-007, FR-PAY-009, FR-RPT-001

#### FR-RPT-005 — Report export and scheduled delivery

- Applications/surfaces: APP-OPS
- Actors: Authorized staff, manager, auditor
- Functional behavior and rules: Export permitted filtered report data in supported formats and optionally schedule recurring delivery to verified authorized recipients. Show scope, time zone, currency, generated time, filters, and definitions. Large exports run as tracked jobs. Sensitive fields follow role and masking rules; scheduled delivery stops when recipient authorization is removed.
- Outcomes and recovery: Failed generation or delivery is visible with retry and owner. Expired download access requires regeneration. Cancelling a schedule stops future runs without deleting history.
- Acceptance evidence: An export contains the same scoped records as its on-screen report and cannot bypass row-level access.
- Related: FR-ADM-009, FR-RPT-006, FR-INT-002

#### FR-RPT-006 — Data quality and audit reporting

- Applications/surfaces: APP-OPS
- Actors: Administrator, manager, auditor
- Functional behavior and rules: Report duplicates, missing required links, invalid lifecycle combinations, stale pending items, unmatched provider transactions, missing translations, overlapping policy/rate periods, incomplete inspections, and audit-sensitive actions. Each finding has severity, source, owner, status, first/last seen, and resolution evidence.
- Outcomes and recovery: Marking false positive or resolved requires reason and does not suppress new materially different occurrences.
- Acceptance evidence: Operational contradictions discovered by the system cannot disappear without an accountable resolution.
- Related: FR-GBL-008, FR-PAY-009, FR-ADM-012

#### 8.11 Connected services and failure recovery

#### FR-INT-001 — Payment-provider coordination

- Applications/surfaces: All
- Actors: Payment provider, customer, finance staff
- Functional behavior and rules: Send only the intended transaction amount/currency/purpose and associate returned provider references with the correct booking, rental, or refund. Accept delayed and repeated status updates safely, verify their authenticity, and apply only valid state transitions. Provider dashboard and system records are reconcilable.
- Outcomes and recovery: Unavailable, delayed, contradictory, or unmatched events enter the payment exception queue. Customer-facing states avoid claiming success before verified outcome.
- Acceptance evidence: A repeated provider event cannot duplicate a capture or refund.
- Related: FR-PAY-002, FR-PAY-004, FR-PAY-009

#### FR-INT-002 — Email, SMS, and push coordination

- Applications/surfaces: All
- Actors: Message provider, customer, staff
- Functional behavior and rules: Send approved localized transactional messages for configured booking, payment, pickup, change, cancellation, return, incident, refund, and account events. Select only verified/permitted destinations, respect channel preference where optional, and record queued, sent, delivered where available, failed, suppressed, and retried states. Required messages may use an alternate permitted channel.
- Outcomes and recovery: Delivery failure never changes the underlying business action. Safe resend avoids duplicate confusing messages and uses current status where appropriate.
- Acceptance evidence: Staff can distinguish “booking failed” from “booking confirmed but message failed.”
- Related: FR-BKG-008, FR-ADM-011, FR-GBL-002

#### FR-INT-003 — Mapping and location assistance

- Applications/surfaces: All where enabled
- Actors: Visitor, customer, staff, mapping provider
- Functional behavior and rules: Support address validation, location suggestions, directions, map display, or distance-based assistance only for configured uses. Clearly identify the selected rental location rather than treating a suggested address as confirmed. Staff can correct location data through the owning area. Routing or distance failure must not corrupt reservation facts.
- Outcomes and recovery: Provider failure falls back to stored addresses, written instructions, or manual entry where permitted. Ambiguous addresses require selection.
- Acceptance evidence: A map outage does not prevent a customer from viewing confirmed pickup instructions.
- Related: FR-CAT-004, FR-ADM-007, FR-GBL-003

#### FR-INT-004 — Cross-system failure and compensation queue

- Applications/surfaces: APP-OPS with status on affected customer surfaces
- Actors: Staff, manager, connected services
- Functional behavior and rules: Detect partially completed multi-party actions such as paid-but-unconfirmed booking, confirmed-but-unallocated inventory, cancelled-but-unrefunded reservation, returned-but-financially-pending rental, or sent action with unknown provider result. Create one case with linked records, current facts, customer impact, owner, deadline, safe automated/manual actions, and retry history.
- Outcomes and recovery: Resolution completes, compensates, or explicitly escalates every side; it never marks success by hiding an inconsistency. Customer communication states only verified facts.
- Acceptance evidence: Every failure between systems ends in a consistent state or a visible owned case.
- Related: FR-BKG-006, FR-PAY-004, FR-ADM-004

#### FR-INT-005 — External identity, assistance, and future integrations

- Applications/surfaces: All where configured
- Actors: External provider, administrator, authorized staff, customer
- Functional behavior and rules: For optional identity, roadside, or other future providers, define the purpose, consent, data shared, trigger, possible outcomes, expiry, manual fallback, and owning role before activation. External results inform but do not bypass non-delegable staff/legal responsibility. Administrators can pause an integration and see impacted flows.
- Outcomes and recovery: Timeout, cancellation, unavailable service, conflicting result, or later correction produces a clear pending/manual-review/fallback path. Repeated callbacks are safe.
- Acceptance evidence: Disabling an optional provider exposes a defined manual route rather than creating a dead end.
- Related: FR-IAM-005, FR-RNT-008, FR-ADM-004

### 6.4 Cross-Application Business Workflows

#### FLOW-001 — Discover and confirm a rental

| Flow element | Required behavior |
| --- | --- |
| Entry | Visitor or customer supplies pickup/return location, dates, and times on web or mobile. |
| Action | System validates location hours, searches real-time availability, shows eligible offers, details, extras, terms, and an itemized quote. The user identifies renter/drivers, passes preliminary eligibility, accepts terms, and supplies payment. |
| Decisions | Availability still valid? Quote still valid? Driver eligible? Required payment outcome reached? Terms accepted? |
| Success | One confirmed reservation, inventory commitment, payment linkage, booking snapshot, visible confirmation, and delivery attempts. |
| Alternate | User registers/signs in, uses guest access if enabled, chooses a transparent alternative, changes payment method, or removes an unavailable extra. |
| Failure/recovery | Release temporary capacity; preserve safe checkout context; reconcile unknown provider outcome; create owned case for partial success. |
| Final state | Confirmed, pending-known-prerequisite, expired/abandoned, or failed-with-no-reservation. |
| Next actions | View, modify, cancel, complete pending item, prepare for pickup, retry from a refreshed quote, or contact support. |

Related requirements: FR-CAT-002–007, FR-PRC-002–007, FR-BKG-001–010, FR-PAY-001–004.

#### FLOW-002 — Modify a reservation

| Flow element | Required behavior |
| --- | --- |
| Entry | Verified customer or authorized staff opens an eligible reservation. |
| Action | Choose changes; recheck availability, eligibility, price, payment, and terms; compare old and new; confirm. |
| Decisions | Change permitted? New capacity available? Price accepted? Additional payment/refund resolved to the required level? |
| Success | Original allocation is replaced safely, reservation snapshot/version advances, balance updates, and messages are sent. |
| Alternate | Keep original, choose another valid option, or route restricted change to staff. |
| Failure/recovery | Original reservation remains intact; partial provider actions enter reconciliation. |
| Final state | Confirmed-modified, unchanged, pending-resolution, or cancelled only through FLOW-003. |
| Next actions | View new details, modify again if allowed, cancel, or prepare for pickup. |

Related requirements: FR-RSV-002, FR-CAT-005, FR-PRC-002, FR-PAY-007, FR-INT-004.

#### FLOW-003 — Cancel and refund a reservation

| Flow element | Required behavior |
| --- | --- |
| Entry | Verified customer or authorized staff selects cancel before rental opening. |
| Action | System calculates policy result, shows retained/refundable amounts, obtains confirmation, cancels, releases inventory/extras, initiates refund, and sends notice. |
| Decisions | Cancellation permitted? Fee/refund due? Approval required for exception? |
| Success | Reservation terminally cancelled; inventory released; financial outcome linked and visible. |
| Alternate | User keeps booking, modifies it, or requests staff review. |
| Failure/recovery | Refund/message failure does not undo cancellation; owned follow-up remains visible. |
| Final state | Cancelled with no refund, refund pending, partially refunded, refunded, or finance-review. |
| Next actions | Track refund, retrieve cancellation evidence, contact support, or make a new booking. |

Related requirements: FR-RSV-003, FR-PAY-006, FR-INT-002, FR-INT-004.

#### FLOW-004 — Prepare and open the rental

| Flow element | Required behavior |
| --- | --- |
| Entry | Confirmed reservation approaches pickup at the responsible location. |
| Action | Staff resolve readiness, assign unit, verify renter/drivers/documents/payment/deposit, inspect starting condition, issue extras, present agreement, and capture acknowledgement. |
| Decisions | Unit ready? Acceptable substitute? Eligibility verified? Payment/deposit valid? Customer accepts changed promise if any? |
| Success | Rental opens once; assigned unit becomes on-rent; customer receives agreement and support/return instructions. |
| Alternate | Correct information, change eligible driver/category, substitute unit, reschedule, or obtain allowed approval. |
| Failure/recovery | No handover; reconcile reservation, inventory, and payment; apply disclosed cancellation/no-show/service-recovery path. |
| Final state | Active rental, pickup delayed/pending, no-show, cancelled, or service-recovery case. |
| Next actions | View active rental, request extension, report issue/incident, or follow return instructions. |

Related requirements: FR-RNT-001–005, FR-PAY-003, FR-FLT-006.

#### FLOW-005 — Extend an active rental

| Flow element | Required behavior |
| --- | --- |
| Entry | Customer or staff proposes a later return or different permitted return location. |
| Action | Recalculate downstream availability, maintenance, price, deposit, eligibility, and terms; obtain approval/payment and customer confirmation. |
| Decisions | Capacity and maintenance permit? Price/payment accepted? Location permits route? Manual review needed? |
| Success | Agreement amendment, due time, fleet plan, payment, and notifications update consistently. |
| Alternate | Shorter extension, different return location/time, replacement arrangement, or original return obligation. |
| Failure/recovery | No false approval; original agreement remains; partial financial action enters reconciliation. |
| Final state | Active-extended, active-unchanged, or extension-request-pending. |
| Next actions | Continue rental under displayed due time or contact staff. |

Related requirements: FR-RNT-006, FR-CAT-005, FR-PAY-007, FR-INT-004.

#### FLOW-006 — Incident, roadside help, and replacement

| Flow element | Required behavior |
| --- | --- |
| Entry | Customer or staff reports breakdown, accident, damage, theft, or another supported incident. |
| Action | Capture safe essential facts; create case; provide configured immediate instructions; assess drivability; dispatch or escalate; block unit if needed; determine continuation, recovery, repair, or replacement. |
| Decisions | Immediate safety escalation? Vehicle usable? Provider available? Replacement eligible and available? Further evidence/review required? |
| Success | Case has owner and resolution; fleet, rental, replacement, customer communication, and charge review are linked. |
| Alternate | Advice only, tow/repair, replacement from another location, or early termination/service recovery. |
| Failure/recovery | Use alternate contact/manual coordination; retain case and verified facts; never leave customer with an unowned provider failure. |
| Final state | Resolved-continued, resolved-replaced, resolved-terminated, or under-review. |
| Next actions | Continue, collect replacement, return vehicle, supply evidence, review adjustment, or dispute/contact support. |

Related requirements: FR-RNT-008–010, FR-FLT-003, FR-INT-005.

#### FLOW-007 — Return and close the rental

| Flow element | Required behavior |
| --- | --- |
| Entry | Customer arrives at return point or follows approved after-hours process. |
| Action | Record actual return facts, receive custody, inspect, compare condition, calculate adjustments, settle payment/deposit, update vehicle readiness, and issue statement. |
| Decisions | After-hours? New finding? Review/approval needed? Additional payment/refund due? Unit ready, cleaning, maintenance, or damage-blocked? |
| Success | Possession ends, rental operationally and financially closes or has a clearly owned financial review, vehicle enters correct next state, customer gets statement. |
| Alternate | Disputed item under review, later-charge disclosure, early-return treatment, or replacement/incident linkage. |
| Failure/recovery | Payment/release failure does not keep vehicle falsely on rent; return/inspection uncertainty stays visible. |
| Final state | Completed, returned-financially-pending, damage/claim-review, or after-hours-pending-inspection. |
| Next actions | View statement, track refund/hold, respond to review, dispute a charge, or make another booking. |

Related requirements: FR-RNT-011–016, FR-PAY-003, FR-PAY-007–009.

#### FLOW-008 — Fleet status change affects customer promises

| Flow element | Required behavior |
| --- | --- |
| Entry | Unit is blocked, damaged, overdue, transferred late, or made unavailable after being planned/assigned. |
| Action | Recalculate availability; identify affected holds/reservations/rentals; create reassignment and customer-contact tasks; find alternatives. |
| Decisions | Same-category replacement? Upgrade/downgrade? Other location/time? Customer consent or manager approval required? |
| Success | Every affected promise has valid replacement/allocation or accepted service recovery; catalogue and operations agree. |
| Failure/recovery | Do not hide overbooking; escalate with owner and customer-impact deadline. |
| Final state | Reassigned, customer-change-pending, cancelled/refunded, or unresolved-escalated. |
| Next actions | Confirm alternative, approve exception, contact customer, or complete refund. |

Related requirements: FR-FLT-003–007, FR-RNT-002, FR-ADM-004.

#### FLOW-009 — Business configuration becomes customer behavior

| Flow element | Required behavior |
| --- | --- |
| Entry | Authorized user drafts a lookup, rate, fee, policy, location, product, translation, or template change. |
| Action | Validate scope/effective dates, preview outcomes and affected records, obtain approval when required, and activate a version. |
| Decisions | Complete and conflict-free? Editable or protected invariant? Existing reservations affected? Required translations present? |
| Success | New eligible actions use the active version; old transactions retain their accepted snapshot; all surfaces use the same stored source. |
| Failure/recovery | Block activation and show exact corrections; pause or supersede prospectively rather than rewriting history. |
| Final state | Draft, pending approval, scheduled, active, paused, expired, or archived. |
| Next actions | Edit, submit, approve, preview, pause, supersede, or inspect usage. |

Related requirements: FR-GBL-002–004, FR-ADM-005–012.

#### FLOW-010 — Connected-service partial failure

| Flow element | Required behavior |
| --- | --- |
| Entry | Payment, message, map, identity, or assistance provider times out, repeats, contradicts, or partially succeeds. |
| Action | Preserve verified local facts, check returned provider state, prevent duplicate side effects, create exception case, and expose safe user status. |
| Decisions | Outcome known? Safe automatic retry? Compensation required? Manual/provider escalation required? Customer notice needed? |
| Success | All involved records reach a consistent result and the case closes with evidence. |
| Alternate | Manual fallback or business compensation with permission and reason. |
| Failure/recovery | Case remains owned, aged, and escalated; no false success or silent abandonment. |
| Final state | Reconciled-success, reconciled-failure/compensated, or unresolved-escalated. |
| Next actions | Retry, link, refund/reverse, complete manually, contact customer/provider, or escalate. |

Related requirements: FR-GBL-006, FR-PAY-004, FR-INT-001–005.

### 6.5 Business Rules

| Rule ID | Rule |
| --- | --- |
| BR-001 | The customer must always be told whether the reservation promises a category or a specific vehicle unit. |
| BR-002 | Exact fees, eligibility thresholds, hold durations, buffers, grace periods, and approval limits are configured by authorized users and versioned by effective period. |
| BR-003 | A confirmed reservation requires a valid price, sufficient availability, sufficient eligibility state, accepted terms, and the configured payment outcome. |
| BR-004 | A temporary checkout hold is not a reservation and must expire or convert under an explicit rule. |
| BR-005 | Availability must include confirmed demand, active/overdue rentals, temporary holds, maintenance, damage, cleaning, transfers, closures, and turnaround requirements. |
| BR-006 | A consequential action must revalidate current state; a stale page cannot authorize an invalid change. |
| BR-007 | The system must not create duplicate bookings, captures, refunds, assignments, or provider effects from repeated requests. |
| BR-008 | Modification must show and obtain acceptance for material differences before replacing the original promise. |
| BR-009 | A failed modification leaves the original confirmed reservation intact unless an explicit cancellation separately succeeds. |
| BR-010 | Cancellation after rental opening is not allowed; active-rental early-return or termination rules apply. |
| BR-011 | Cancellation remains effective even if its refund or message later fails; those failures become owned follow-up items. |
| BR-012 | A renter, payer, account owner, and additional driver are distinct roles even when one person fills several roles. |
| BR-013 | Preliminary online eligibility never replaces required pickup verification. |
| BR-014 | Legal, safety, security, and provider invariants cannot be bypassed by ordinary manual override. |
| BR-015 | A vehicle may have only one current custody/location state and no overlapping active rental assignments. |
| BR-016 | A returned vehicle is not available until configured inspection, cleaning, maintenance, and readiness gates pass. |
| BR-017 | Starting and returned condition, odometer, and fuel/battery facts must be recorded at the configured lifecycle points. |
| BR-018 | Additional charges and credits require a visible basis and linked agreement, event, evidence, or approved reason. |
| BR-019 | Transaction history is corrected through linked adjustments or reversals, not destructive rewriting. |
| BR-020 | Security authorization/hold is distinguished from captured payment and from a later refund. |
| BR-021 | Provider “unknown” is not treated as failure until safely checked, and is not retried in a way that can duplicate payment. |
| BR-022 | Communication delivery outcome never changes the underlying reservation, rental, or payment outcome. |
| BR-023 | Historical transactions retain the accepted price, policy, terms, product, lookup meaning, and language/version evidence. |
| BR-024 | Deactivated reference values cannot be selected for new records but remain readable on history. |
| BR-025 | Customer data access follows identity verification, purpose, role, location scope, and sensitivity. |
| BR-026 | Every partial workflow, exception, and pending state has a responsible owner, age/deadline where relevant, and next action. |
| BR-027 | Reports must disclose definition, time basis, time zone, scope, currency basis, filters, exclusions, and freshness. |
| BR-028 | The launch language list, default language, supported currencies, markets, locations, and legal policies are confirmed configuration decisions, not assumed in this baseline. |
| BR-029 | One-way rentals, after-hours returns, guest booking, exact-vehicle booking, saved payment options, external identity checks, and scheduled report delivery are enabled only where configured. |
| BR-030 | Customer-facing alternatives must disclose every changed trip, vehicle, price, distance, condition, or time value before selection. |

#### 6.5.1 Reference and lookup ownership catalogue

| Catalogue / option set | Classification | Owner and edit behavior | Historical behavior |
| --- | --- | --- | --- |
| Rental locations and return routes | Entity-owned data | Location administration; managers edit permitted content/routes | Archived locations and prior route labels remain on transactions |
| Vehicle categories, makes/models, features | Entity-owned/constrained | Fleet/catalogue owners; codes and structural fields constrained when used | Prior category/model snapshot retained |
| Vehicle lifecycle states | System-fixed invariant | Read-only catalogue; labels translated, transitions protected | Stable code and historical label retained |
| Reservation, rental, payment, refund, incident, maintenance statuses | System-fixed invariant | Read-only catalogue; labels translated | Stable codes preserved |
| Rate plans, seasons, taxes, fees, deposits, discount/promotion types | Configurable or constrained business data | Pricing managers with effective dates and approval | Accepted financial snapshot never recomputed silently |
| Eligibility, cancellation, no-show, grace, hold, buffer, mileage, fuel/charge, after-hours, and extension policies | Configurable/constrained business data | Policy managers; non-overridable rules read-only | Agreement/booking keeps policy version |
| Payment methods and provider outcome mapping | Externally managed/constrained | Provider capability synchronized; business can enable safe subset | Original method summary/outcome retained |
| Countries, currencies, time zones, address subdivisions, licence types | Externally managed/system-fixed | Updated from governing authority; business enables supported subset | Stable standards code retained |
| Languages and locale formats | Constrained business data | Administrators enable supported languages; locale rules system-managed | Transaction language/version retained |
| Category, location, extra, protection, policy, message, document translations | Configurable business content | Authorized translators/editors; workflow controlled | Accepted/rendered version retained where material |
| Optional equipment/service types | Configurable business data | Product/fleet owners manage applicability, stock, order, translations | Deactivation preserves prior selection |
| Protection products and coverage codes | Constrained business data | Product/legal owner; descriptions/availability versioned, integration codes protected | Accepted terms/version retained |
| Cancellation, no-show, override, refund, adjustment, transfer, block, and service-case reasons | Configurable business lookup | Authorized data steward edits safe values/order/translations | Old reason remains readable; deactivated unavailable for new action |
| Incident, breakdown, damage, wear, cleaning, maintenance, inspection, and document types | Configurable/constrained lookup | Fleet/safety owner; unsafe structural changes constrained | Prior findings retain code/label |
| Inspection checklists and readiness outcomes | Constrained business configuration | Fleet owner versions checklist and applicability | Completed inspection retains version |
| Staff roles, permissions, approval actions | System-fixed permission actions plus configurable roles | Administrator composes roles from protected actions | Past actions keep actor/scope evidence |
| Notification events and delivery statuses | System-fixed invariant | Read-only event/status codes; templates/channels configurable | Sent event and template version retained |
| Report definitions and dimensions | Constrained | Report owner may configure views; core metric definitions versioned | Export records definition/version |
| Vehicles, customers, staff, reservations, rentals, payments, vendors/providers | Entity-owned data | Managed in owning areas, never duplicated as lookup arrays | Lifecycle/archive rules apply |

### 6.6 Lifecycle / State Models

#### 6.6.1 Reservation lifecycle

| State | Meaning | Allowed next states / actions |
| --- | --- | --- |
| Draft checkout | Details entered; no reservation promise | Pending prerequisite, confirmed, abandoned/expired |
| Pending prerequisite | Known payment, verification, approval, or driver item remains | Confirmed, cancelled, expired, failed-resolution |
| Confirmed | Capacity and required commitment accepted | Modified-confirmed, pickup-ready, cancelled, no-show |
| Modified-confirmed | Confirmed with a newer accepted snapshot | Modified-confirmed, pickup-ready, cancelled, no-show |
| Pickup-ready | Operational prerequisites marked ready | Rental-opened, delayed/pending, cancelled, no-show |
| Rental-opened | Converted into an active rental | No reservation change/cancel; follow rental lifecycle |
| Cancelled | Terminal booking cancellation | Refund/finance follow-up may continue; new booking only |
| No-show | Terminal non-pickup under policy | Audited correction or new booking; finance follow-up |
| Expired/abandoned | Temporary hold/pending opportunity ended | New search/quote only |

Invalid examples: cancelled to confirmed without a new booking; rental-opened to modified reservation; expired hold directly to confirmed without revalidation.

#### 6.6.2 Rental lifecycle

| State | Meaning | Allowed next states / actions |
| --- | --- | --- |
| Opening-pending | Pickup checks/handover in progress | Active, aborted/reservation resolution |
| Active | Vehicle handed over under current agreement | Active-extended, incident-review, replacement-in-progress, overdue, return-started |
| Active-extended | Active with amended due details | Further permitted extension, incident, overdue, return-started |
| Incident-review | Incident may affect continued use | Active, replacement-in-progress, return-started, terminated-review |
| Replacement-in-progress | Old/new unit transfer controlled | Active with replacement, terminated-review |
| Overdue | Return obligation passed without approved extension | Active-extended if approved, return-started, escalation |
| Return-started | Custody return recorded or being recorded | Returned-pending-inspection |
| Returned-pending-inspection | Possession ended; operational review incomplete | Financial-review, completed |
| Financial-review | Adjustments/payment/deposit unresolved | Completed, dispute follow-up |
| Completed | Operational rental closed | Later linked adjustment/dispute only; no factual rewrite |
| Terminated-review | Early termination/service recovery unresolved | Returned-pending-inspection, financial-review, completed |

#### 6.6.3 Vehicle lifecycle

| State | Meaning | Allowed next states / actions |
| --- | --- | --- |
| Draft | Unit not operational | Available, unavailable, archived-error |
| Available | Eligible for sale/assignment | Held/assigned, transfer, cleaning, maintenance, damage-review, unavailable, retired |
| Held/assigned | Reserved for operational demand | Pickup-ready, available, unavailable/reassignment |
| Pickup-ready | Checked and prepared | On-rent, held/assigned, unavailable |
| On-rent | In customer custody | Returned-pending-inspection, incident/damage-review, replacement transfer |
| Returned-pending-inspection | Custody returned; readiness unknown | Cleaning, maintenance, damage-review, available |
| Cleaning | Cleaning work open | Available, maintenance, damage-review, unavailable |
| Maintenance | Maintenance work open | Available after readiness, unavailable, retired |
| Damage-review | Finding/repair decision open | Maintenance/repair, available, unavailable, retired |
| Transfer | Location movement in progress | Available, unavailable, maintenance/damage-review |
| Unavailable | Administrative/operational block | Available after valid release, maintenance, transfer, retired |
| Retired | No new operational use | Archived history only |

#### 6.6.4 Payment and refund lifecycle

| Object | States and permitted direction |
| --- | --- |
| Payment | Created → action-required/processing → authorized → captured/partially captured; or failed/cancelled/expired. Unknown remains unresolved until checked. Captured amounts may lead to partial/full refund or dispute; history is not overwritten. |
| Security hold | Required → pending → authorized → adjusted/partially captured/released/expired/failed. Release is not a refund. |
| Refund | Requested → processing → succeeded/failed/cancelled/manual-review. Failed may retry safely; succeeded cannot succeed again for the same remaining amount. |
| Reconciliation case | Open → assigned/investigating → resolved-linked/resolved-compensated/resolved-explained, or escalated; reopening appends history. |

#### 6.6.5 Maintenance, inspection, and incident lifecycle

| Object | States and permitted direction |
| --- | --- |
| Maintenance work | Draft → scheduled → in-progress → completed/closed; or cancelled. Failed completion/reopened returns to in-progress with history. |
| Inspection | Due → in-progress → passed/failed/needs-review. Failed or review produces linked work; correction creates a superseding result. |
| Incident | Reported → triaged → active-response/investigation → resolved-continued/resolved-replaced/resolved-terminated/closed. Reopening preserves prior closure. |
| Service case | Open → assigned → waiting-customer/waiting-provider/in-progress → resolved → closed; can reopen with reason. |

### 12. Functional Coverage Index


## 7. UI/UX and Flow Implementation Requirements

### 7.1 Normative design contract

- **SRS-UI-001:** APP-CWEB, APP-CMOB, and APP-OPS must implement every applicable `SCREEN-*`, `COMP-*`, `EL-*`, `FLOW-*`, and `STATE-*` contract in UI/UX Design and Flow Plan version 1.0. Its visibility rules, labels, enablement, action, feedback, success, failure, and recovery behavior are normative.
- **SRS-UI-002:** A shared element may be implemented once and reused, but reuse must not erase application-specific behavior, accessibility semantics, permissions, or responsive adaptation.
- **SRS-UI-003:** A route is not complete merely because it renders. It is complete only when loading, empty, no-results, validation, failure, success, unavailable, permission-denied, stale, offline, pending, and expired states are implemented wherever applicable.
- **SRS-UI-004:** Each consequential action must revalidate server permission, current version, business state, availability, and applicable price before commit. Optimistic UI must not display a financial, booking, custody, cancellation, access, or publication transition as accepted before authoritative confirmation.
- **SRS-UI-005:** Every control obtains business choices from authenticated dynamic interfaces. Client-bundled arrays may contain only presentation constants that are not business choices.
- **SRS-UI-006:** Navigation must preserve the logical return target, valid form data, list filters, list position, and safe drafts. Authentication, locale changes, responsive reflow, or provider redirection must return users to the intended task when authorization permits.
- **SRS-UI-007:** Web/admin forms use accessible labels, descriptions, focusable error summaries, inline correction text, keyboard operation, and status announcements. Mobile equivalents expose the same semantics to native accessibility APIs.
- **SRS-UI-008:** APP-CWEB and APP-CMOB must achieve the same business outcome; screen composition may adapt to platform conventions. Mobile offline persistence is restricted to explicitly labelled safe drafts.
- **SRS-UI-009:** APP-OPS field, action, navigation, export, approval, and unmask visibility must be independently permission-controlled. Hidden and permission-denied states must not leak data.
- **SRS-UI-010:** Every confirmation view must display the authoritative result, stable reference, status, material summary, and valid next action. A toast alone is insufficient evidence for consequential work.
- **SRS-UI-011:** UI tests must use stable semantic locators and source IDs exposed as non-sensitive test metadata where practical. Tests must not depend on translated visible text alone.
- **SRS-UI-012:** Required screenshot checkpoints include default, loading/refresh, empty or no-result, validation, failure, success, pending/stale where relevant, responsive widths, every approved launch locale, RTL if enabled, high text zoom, and permission-restricted states.
- **SRS-UI-013:** Screenshot baselines must use deterministic clocks, fonts, data, animations, locale, viewport, and provider responses. Differences require review; automatic baseline replacement is prohibited.
- **SRS-UI-014:** Browser console errors, failed unexpected requests, unhandled rejections, hydration warnings, accessibility violations, and privacy-sensitive log output fail the affected automated journey unless explicitly allow-listed with a tracked reason.
- **SRS-UI-015:** Each element action maps to one API command/query or explicit local-only UI change. A click with no result, unexplained disabled state, circular navigation, or terminal screen without a next action is a release defect.

### 7.2 Shared state implementation

| State ID | Required implementation behavior | Verification |
| --- | --- | --- |
| STATE-LOADING | Preserve stable layout; distinguish initial load from refresh; cancellable only when cancellation is real | TEST-UI-STATE-001 |
| STATE-EMPTY | Explain why no records exist and show the first permitted action; never fabricate production data | TEST-UI-STATE-002 |
| STATE-NO-RESULTS | Preserve query/filter context and allow edit/clear | TEST-UI-STATE-003 |
| STATE-VALIDATION | Server and client errors use the same field/path model; valid input remains | TEST-UI-STATE-004 |
| STATE-FAILURE | State what failed and what remained unchanged; provide only safe recovery | TEST-UI-STATE-005 |
| STATE-SUCCESS | Show accepted state, reference, and next action | TEST-UI-STATE-006 |
| STATE-UNAVAILABLE | Disable impossible commit and expose valid alternative or return | TEST-UI-STATE-007 |
| STATE-PERMISSION-DENIED | Reveal neither hidden record nor permission internals; provide safe navigation | TEST-UI-STATE-008 |
| STATE-STALE | Identify newer authoritative state; block consequential action until review | TEST-UI-STATE-009 |
| STATE-OFFLINE | Label cached data and safe local drafts; do not queue consequential writes invisibly | TEST-UI-STATE-010 |
| STATE-PENDING | Show accepted request/attempt, owner/provider, known state, and check-status route | TEST-UI-STATE-011 |
| STATE-EXPIRED | Identify expired object and restart/revalidation path | TEST-UI-STATE-012 |

### 7.3 Component and element implementation

The complete shared component inventory `COMP-SH-001–020`, customer component inventory `COMP-CUS-001–007`, and operations component inventory `COMP-OPS-001–007` is required. All `EL-SH-*`, `EL-COMP-*`, `EL-CUS-*`, and `EL-OPS-*` behaviors documented under those components and their screens are acceptance contracts.

Components must be divided into accessible primitives, composed domain components, and screen orchestration. Domain components may format data but must not independently invent availability, prices, permissions, lifecycle transitions, or lookup options. Shared packages must contain tokens, primitives, locale utilities, schemas generated from the API contract, query/error handling, and test fixtures; they must not create a hidden second source of business truth.

### 7.4 Screen implementation groups

| Group | Screen IDs | Primary owning modules | Required evidence |
| --- | --- | --- | --- |
| Discovery/checkout | SCREEN-CUS-001–007 | catalogue, availability, pricing, customer, booking, payment | TEST-SCREEN-CUS-001–007 plus FLOW-CUS-001 |
| Identity/account | SCREEN-CUS-008–013, SCREEN-CUS-024 | identity, customer, documents, privacy | TEST-SCREEN-CUS-008–013/024 plus FLOW-CUS-002/010 |
| Reservation self-service | SCREEN-CUS-014–019 | reservation, pricing, payment, notification | TEST-SCREEN-CUS-014–019 plus FLOW-CUS-003–005 |
| Active rental/service | SCREEN-CUS-020–023 | rental, incident, return, mapping | TEST-SCREEN-CUS-020–023 plus FLOW-CUS-006–009 |
| Staff access/work | SCREEN-OPS-001–012 | identity, work queue, booking, rental, case | TEST-SCREEN-OPS-001–012 |
| Fleet | SCREEN-OPS-013–020 | fleet, transfer, maintenance, inspection, availability, jobs | TEST-SCREEN-OPS-013–020 |
| Customers/finance | SCREEN-OPS-021–024 | customer, privacy, payment, reconciliation | TEST-SCREEN-OPS-021–024 |
| Commercial/configuration | SCREEN-OPS-025–034 | pricing, policy, product, location, lookup, access, template, locale | TEST-SCREEN-OPS-025–034 |
| Reports/operations health | SCREEN-OPS-035–039 | reporting, audit, data quality, integration recovery | TEST-SCREEN-OPS-035–039 |

### 7.5 Flow execution contract

- **SRS-FLOW-001:** Each of FLOW-CUS-001–010 and FLOW-OPS-001–019 must have an automated end-to-end happy path and targeted branch tests for its documented validation, empty/unavailable, permission, stale/concurrent, offline, provider failure/unknown, interruption, cancellation/reversal, and final next-action behavior.
- **SRS-FLOW-002:** Every multi-record workflow must declare a transaction boundary. Work crossing a provider or asynchronous worker boundary uses a durable outbox/inbox and an explicit pending/compensation state rather than a distributed transaction.
- **SRS-FLOW-003:** A workflow instance or command carries a correlation ID and, for retry-sensitive operations, an idempotency key. Repeated delivery returns the existing accepted result or a conflict; it does not duplicate effects.
- **SRS-FLOW-004:** Flow completion is recorded only after all synchronous invariants commit. Non-critical notification failure does not roll back a valid booking/rental/payment fact; it creates a retry task. An unknown payment result does block a second money command until reconciled.
- **SRS-FLOW-005:** Cross-application effects must be visible through polling/revalidation or server-sent update where justified. Correctness must not depend on a persistent real-time connection.
- **SRS-FLOW-006:** Every flow endpoint must finish in a defined accepted, unchanged, cancelled, expired, failed-with-recovery, pending-with-owner, or escalated state. Dead ends are prohibited.

## 8. Logical System Components and Responsibilities

### 8.1 Architecture requirements

- **SRS-ARC-001:** Use a modular monolith with explicit domain modules, dependency direction, public application services, and private persistence implementations. Direct cross-module table writes are prohibited.
- **SRS-ARC-002:** HTTP controllers validate transport shape and authorization context, then call application use cases. Controllers must not contain pricing, availability, payment, or lifecycle policy.
- **SRS-ARC-003:** Domain services implement invariants and state transitions without framework, HTTP, or provider dependencies where practical.
- **SRS-ARC-004:** Repositories hide physical persistence but must preserve transaction, locking, version, and query-performance semantics.
- **SRS-ARC-005:** Provider ports isolate payment, messaging, maps, identity, storage, document scanning, and clocks. Simulators implement the same contract as production adapters.
- **SRS-ARC-006:** Worker handlers are idempotent, observable, retry-bounded, and safe after process interruption. Poison work enters a visible dead-letter/recovery queue.
- **SRS-ARC-007:** Shared code is promoted only when it represents one stable concept used by multiple modules. Generic “utils” dumping grounds and circular dependencies are prohibited.
- **SRS-ARC-008:** Every module owns migrations, fixtures, tests, API schemas, event definitions, permissions, and observability names for its data and behavior.

### 8.2 Component inventory

| SRS component | Responsibility | Owns | Must not own |
| --- | --- | --- | --- |
| SRS-CMP-WEB | APP-CWEB Next.js routes, accessible UI, session-aware API client, browser caching | Web presentation and safe draft state | Business truth, secret provider keys |
| SRS-CMP-MOBILE | APP-CMOB React Native navigation, secure session, device capture, deep links, safe offline drafts | Mobile presentation/device integration | Final financial/custody state |
| SRS-CMP-OPS | APP-OPS Next.js routes, scoped workspaces, configuration/report UI | Staff presentation and local filters | Permission authority or direct database access |
| SRS-CMP-API | REST transport, OpenAPI, auth context, validation, error envelope, rate-limit entry | Versioned interface | Domain rules duplicated from modules |
| SRS-CMP-IAM | Accounts, credentials, verification, sessions, external identity links, staff access | Identity/security lifecycle | Customer rental policy |
| SRS-CMP-CUSTOMER | Customer profile, drivers, documents metadata, privacy requests/restrictions | Customer master data | Credential secrets or payment instruments |
| SRS-CMP-CATALOGUE | Locations, categories, public content, search projections | Discoverable catalogue | Authoritative physical vehicle state |
| SRS-CMP-AVAIL | Capacity calculation, holds, conflict checks | Holds and availability projections | Price or payment state |
| SRS-CMP-PRICING | Rate/policy versions, quotes, extras, protection, discounts, tax/fee inputs | Quote and accepted price snapshots | Provider money movement |
| SRS-CMP-BOOKING | Checkout orchestration and reservation lifecycle | Reservation aggregate and changes | Vehicle custody after rental open |
| SRS-CMP-PAYMENT | Payment intents/attempts, deposits, refunds, ledger, reconciliation | Internal financial state and provider mapping | Raw card data |
| SRS-CMP-RENTAL | Pickup, handover, agreement, extension, return, closeout, post-rental facts | Rental aggregate and custody transitions | General fleet configuration |
| SRS-CMP-FLEET | Vehicle/category operational state, transfer, maintenance, inspections, blocks | Vehicle units and readiness history | Reservation pricing |
| SRS-CMP-CASE | Incident, roadside, service, compensation, approval, ownership queues | Case/work lifecycle | Silent mutation of source aggregates |
| SRS-CMP-CONFIG | Lookups, policies, translations, templates, feature/provider enablement | Versioned configuration | Transaction history rewrite |
| SRS-CMP-REPORT | Read models, dashboards, exports, schedules | Report definitions/jobs and projections | Transactional mutation |
| SRS-CMP-NOTIFY | Localized rendering, outbox, channel adapters, delivery state | Notification attempts | Declaring domain action success |
| SRS-CMP-WORKER | Queued/scheduled execution, retries, reconciliation, projection refresh | Job execution state | Unbounded retry |
| SRS-CMP-OBS | Logs, metrics, traces, health/readiness, audit export controls | Operational telemetry | Sensitive business payloads by default |

### 8.3 Dependency constraints

Identity and configuration are shared foundations. Catalogue depends on location/configuration. Availability depends on catalogue/fleet/booking/rental facts. Pricing depends on configuration/catalogue but not payment. Booking coordinates customer, availability, pricing, and payment through public use cases. Rental consumes a confirmed reservation and coordinates fleet/payment. Reporting reads governed projections/events and does not write operational aggregates. Notifications consume committed events. Cycles must be broken with application ports or committed domain events.

## 9. Data Requirements and State Models

### 9.1 Global persistence rules

- **SRS-DAT-001:** PostgreSQL is the source of truth for business records, lifecycle state, lookup rows, audit evidence, idempotency, jobs, and the transactional outbox.
- **SRS-DAT-002:** Every mutable aggregate has an opaque stable ID, created/updated timestamps, actor/source attribution where applicable, and an optimistic concurrency version. Consequential writes compare the expected version.
- **SRS-DAT-003:** Monetary amounts are stored as integer minor units plus a stable currency code. Floating-point arithmetic is prohibited for accepted financial values. Rounding follows a versioned currency/policy rule.
- **SRS-DAT-004:** Instants are stored in UTC. Location records store IANA time-zone IDs. Accepted scheduled facts preserve the local representation and resolved offset needed for historical explanation.
- **SRS-DAT-005:** Historical transactions snapshot material labels, price lines, policy/template/version identifiers, and accepted terms. Renaming or deactivating current configuration cannot rewrite past meaning.
- **SRS-DAT-006:** Destructive deletion is limited to never-used erroneous drafts where no audit/legal/operational need exists. Otherwise records are deactivated, archived, anonymized, or superseded according to policy.
- **SRS-DAT-007:** Organization/market/location scope is stored explicitly where relevant and enforced in repository queries and authorization. Client-supplied scope is never trusted without server validation.
- **SRS-DAT-008:** Sensitive fields are classified, encrypted or tokenized as appropriate, masked in ordinary views/logs, and accessed through permission-checked use cases.
- **SRS-DAT-009:** Files are stored as objects; PostgreSQL stores ownership, purpose, object key, media type, size, checksum, scan/review state, retention, and linkage. A file is usable only after required scan/validation.
- **SRS-DAT-010:** Every schema change is an ordered, immutable migration after merge. Migration checks run against a new database and a supported previous schema snapshot. Production data correction uses reviewed migration/job logic and audit evidence.
- **SRS-DAT-011:** Seed profiles are separated into `system`, `development`, and `test`. Production receives only required system catalogues and explicitly approved initial configuration; fake people, vehicles, bookings, or money records are prohibited.
- **SRS-DAT-012:** Backup/restore verification must prove relational data and object metadata/content are mutually consistent at the selected recovery point.

### 9.2 Logical entity catalogue

| Data ID | Entity / source of truth | Key constraints and relationships | History/privacy/concurrency |
| --- | --- | --- | --- |
| DAT-ORG | Organization/market | Stable scope; owns locations, policies, roles | Restricted admin data; versioned |
| DAT-LOCATION | Rental location | Unique business code per organization; IANA zone; hours/instructions; archive not delete when referenced | Public subset localized; changes audited |
| DAT-ACCOUNT | Customer/staff account | Unique normalized verified identifiers subject to merge policy | Credentials separate; sessions revocable; security audit |
| DAT-SESSION | Refresh session/challenge | Hashed secret, purpose, expiry, rotation lineage, device/context | Short retention; revoke on risk/recovery |
| DAT-CUSTOMER | Customer profile | Links account optionally; verified fields and preference versions | Private; correction/export/closure workflow |
| DAT-DRIVER | Renter/additional driver | Belongs to customer or reservation snapshot; eligibility facts | Sensitive; access scoped; historical snapshot retained |
| DAT-DOCUMENT | Driver/vehicle/evidence document | Type, owner, expiry, checksum, object metadata, review state | Highly restricted; object access audited |
| DAT-CATEGORY | Vehicle category | Stable code, promise model, localized content/features | Versioned/deactivated; accepted snapshot retained |
| DAT-VEHICLE | Physical vehicle unit | Unique internal code; VIN/plate constraints; category/location/state | Full state-event history; optimistic lock |
| DAT-FLEET-EVENT | Vehicle state/location/readiness event | Valid transition, reason, actor, effective time, related work | Append-only correction/supersession |
| DAT-HOLD | Availability/checkout hold | Scope, quantity/unit, quote/draft, expiry; cannot overlap exclusive allocation | Idempotent create/release; expiry job |
| DAT-RATE-PLAN | Versioned rate plan | Scope, applicability, currency, effective period, status | Draft→approved/active/superseded history |
| DAT-QUOTE | Quote and lines | Immutable calculation inputs/results, expiry, category/unit promise | Accepted quote snapshot links reservation |
| DAT-PRODUCT | Extra/protection product | Versioned applicability, stock behavior, price/terms links | Localized; deactivation preserves history |
| DAT-PROMOTION | Promotion | Unique scoped code, eligibility, limit counters, period, combinability | Atomic usage enforcement and audit |
| DAT-RESERVATION | Reservation aggregate | Unique reference; owner/renter; trip; quote; state; hold/allocation | State events append; version-checked writes |
| DAT-RES-CHANGE | Modification/cancellation/override | Proposal or command, old/new snapshot, reason, approvals, result | Original remains until atomic accept |
| DAT-RENTAL | Rental aggregate | One opening from eligible reservation; assigned unit; custody/due/state | Append-only agreement amendments/state events |
| DAT-AGREEMENT | Rental agreement version | Terms/template locale/version, signer evidence, accepted facts | Immutable signed version; restricted access |
| DAT-INSPECTION | Pickup/return/fleet inspection | Checklist version, readings, findings, evidence, outcome | Submitted result immutable; correction supersedes |
| DAT-DAMAGE | Damage/finding | Vehicle/rental/inspection links, classification, evidence, responsibility state | Sensitive case history; no destructive rewrite |
| DAT-MAINT | Maintenance/cleaning work | Vehicle, type, schedule, blocker, vendor, lifecycle | Work events and readiness gate retained |
| DAT-TRANSFER | Vehicle transfer | Origin/destination, custody, times, reason, impact | Transition/audit history; concurrent location guard |
| DAT-INCIDENT | Incident/roadside report | Rental/unit/type, facts, location, evidence, response state | Restricted; correction by append |
| DAT-CASE | Service/approval/recovery case | Source links, owner, priority, deadline, state, outcome | Reopen appends; evidence/permission scoped |
| DAT-PAYMENT | Internal payment intent | Reservation/rental, amount/currency, purpose, verified state | Immutable ledger relation; no card details |
| DAT-PAY-ATTEMPT | Provider/simulator attempt | Provider key, idempotency key, request fingerprint, observed state | Raw payload minimized/encrypted; duplicate-safe |
| DAT-DEPOSIT | Security hold | Required/authorized/released/captured amounts and provider references | Release distinct from refund; full history |
| DAT-REFUND | Refund/reversal | Payment, eligible remaining amount, reason, approval, attempt | Prevent over-refund; unknown state reconciled |
| DAT-LEDGER | Financial ledger line | Debit/credit semantics, amount/currency, source event, immutable linkage | Append-only; correction by compensating line |
| DAT-NOTIFICATION | Message intent/attempt | Event, recipient/channel, template/version/locale, delivery state | Content retention/masking policy; retries bounded |
| DAT-TEMPLATE | Notification/document template version | Stable key, locale, variables, review/publish status | Prior sent/generated version retained |
| DAT-LOOKUP-TYPE | Lookup metadata | Unique stable code, class, owner, scope, editability reason | Audited and discoverable |
| DAT-LOOKUP-VALUE | Lookup value/version | Stable non-localized code, labels, order, state/effective dates | Referenced values deactivate, not disappear |
| DAT-TRANSLATION | Translation resource/version | Key, locale, value, status, source-version relation | Publish history and missing/outdated state |
| DAT-REPORT-DEF | Report definition/saved view | Stable metric/dimension semantics, permissions, version | Exports retain filters/definition version |
| DAT-JOB | Import/export/report/scheduled job | Type, owner, input checksum, progress, result object, retry | Survives browser close; bounded retries |
| DAT-OUTBOX | Committed integration event | Unique event ID/type/version/aggregate/order/payload | Transactional insert; delivery attempts retained |
| DAT-IDEMPOTENCY | Command deduplication | Actor/scope/key/fingerprint/result reference/expiry | Atomic uniqueness; mismatched reuse conflicts |
| DAT-AUDIT | Security/business audit event | Actor/system, action, target, before/after-safe diff, reason, trace | Append-only; masked/export-controlled |

### 9.3 State-machine integrity

Reservation, rental, vehicle, payment, security-hold, refund, reconciliation, maintenance, inspection, incident, and service-case state transitions must match the accepted Functional Requirements lifecycle tables. Transition functions must validate current state, actor permission, required evidence, policy version, related aggregate conditions, and optimistic version within the same transaction. Direct status-column updates outside the owning transition function are prohibited.

Invalid transition attempts return the current state and allowable next actions without mutation. Corrections append a superseding event or compensating record. Terminal business facts are not reopened by editing their historical row.

### 9.4 Database indexing and query obligations

Indexes must support unique identifiers/references, normalized verified contacts, scoped active lookup codes, reservation trip/state queries, vehicle location/state/category queries, open task ownership, payment provider references, idempotency keys, outbox delivery, audit target/time, and report date/scope access. Each migration that adds a high-volume query must include an execution-plan test or measured evidence on representative generated data. Unbounded list queries are prohibited; stable cursor pagination is required for large operational datasets.

### 9.5 Transaction and locking boundaries

Booking confirmation atomically consumes/validates the hold, creates one reservation/reference, snapshots the accepted quote/terms, records required internal financial intent, and emits outbox events. Vehicle assignment, rental opening, return receipt, rental closeout, promotion consumption, and lookup code changes use explicit transaction and locking strategies. Provider calls occur outside database locks; their intent is committed first and reconciled by idempotent callbacks/status queries.

## 10. Reference/Lookup Data and Configuration Governance

### 10.1 Lookup requirements

- **SRS-LKP-001:** Every business-facing option source in Section 20 of the accepted design must exist as a stored entity or reference catalogue and be retrieved through an authenticated backend interface. No client package, local JSON file, browser/device store, or duplicated form array is the production source of truth.
- **SRS-LKP-002:** `DAT-LOOKUP-TYPE` stores stable type code, classification, owner module/role, scope model, editability, lock reason, consumer metadata, cache policy, and audit policy.
- **SRS-LKP-003:** `DAT-LOOKUP-VALUE` stores a stable non-localized code, type, scope, localized labels/descriptions, order, default where permitted, active/effective state, constrained attributes, version, and attribution.
- **SRS-LKP-004:** Configurable lookups allow permitted create, edit, translate, reorder, activate, deactivate, and restore operations. Delete is allowed only for an unreferenced erroneous draft.
- **SRS-LKP-005:** System-fixed invariants are represented by database rows and returned dynamically but remain read-only except for approved localized presentation fields. The dashboard shows the integrity/security/standards reason.
- **SRS-LKP-006:** Externally managed references record source, last successful sync, cursor/version where applicable, error, and last-good data. Failed sync preserves the last-good version as visibly stale when safe.
- **SRS-LKP-007:** Entity-owned sources are selected from their owning domain API and managed on the owning screen; they are not copied into a generic lookup table.
- **SRS-LKP-008:** Codes are unique within type and defined scope. A code used by a transaction is immutable. Label edits affect display according to snapshot rules but never alter financial or legal meaning.
- **SRS-LKP-009:** Deactivation removes a value from new choices after effective time, while existing records resolve a historical label/code. Before deactivation, the UI shows usage and affected future configurations.
- **SRS-LKP-010:** Lookup mutations use optimistic concurrency, permission and scope enforcement, validation of defaults/order/dependencies, audit events, and transactional outbox invalidation.
- **SRS-LKP-011:** Clients may cache lookup responses using version/ETag. A successful mutation emits invalidation; stale clients revalidate before consequential commit. Cache failure never changes authoritative behavior.
- **SRS-LKP-012:** Startup/migration validation compares required code-level closed sets and system catalogue rows. Missing, duplicate, unknown, or mismatched invariant codes fail readiness instead of drifting silently.
- **SRS-LKP-013:** Lookup selector APIs support type, scope, parent/dependency, active-at time, locale, search, cursor, and historical-ID retrieval. They return stable code/ID separately from localized presentation.
- **SRS-LKP-014:** Import/export is allowed only for explicitly supported lookup types; each row returns accepted/rejected status, and retry targets rejected rows only.
- **SRS-LKP-015:** TEST-LKP-001–015 plus one row-specific test in the Lookup Traceability Matrix verify CRUD constraints, deactivation, history, localization, permissions, invalidation, and consumers.

### 10.2 Configuration versioning

Pricing, policies, products, checklists, templates, translations, report definitions, and integration enablement use draft/review/approved/scheduled/active/paused/superseded lifecycle where their risk requires it. Activation validates complete scope and effective time, dependency compatibility, translations required for launch, and overlapping active versions. Existing reservations/rentals retain the accepted version. Publishing never mutates prior accepted facts.

### 10.3 Lookup catalogue

The complete normative inventory appears in Section 21. Every entry must be discoverable from SCREEN-OPS-030/031 or linked owning screen and must identify its owner, class, scope, editability, localization, consumers, and history rule.

## 11. Multilingual, Localization, and Bidirectional Requirements

- **SRS-I18N-001:** Launch locales are controlled configuration. No user-facing release may complete until the business approves the initial locales, default, fallback chain, and any RTL locales. The architecture and tests must support adding a locale without changing domain code.
- **SRS-I18N-002:** User-facing application text uses stable translation keys. Hard-coded production labels, validation messages, status names, lookup labels, emails, reports, or document text are prohibited except data entered intentionally by a user.
- **SRS-I18N-003:** Translation resources are versioned by namespace, key, locale, value, status, source revision, owner, reviewer, and timestamps. Publishing detects missing, invalid, placeholder, unsafe markup, and stale-source translations.
- **SRS-I18N-004:** API codes, entity IDs, state codes, lookup codes, and machine event names remain language-neutral. APIs return structured error codes/parameters; clients resolve localized messages. Server-generated email, export, receipt, and agreement content resolves the recipient/document locale server-side.
- **SRS-I18N-005:** Fallback is explicit per locale and never displays a raw key. Missing optional content falls back and creates observability evidence. Missing mandatory legal/financial content blocks affected publication/use when configured.
- **SRS-I18N-006:** PostgreSQL, APIs, queues, search normalization, objects, and clients preserve Unicode. Input normalization must not alter passwords, identifiers, codes, or legally meaningful names. Search may maintain normalized derived fields while retaining the exact original.
- **SRS-I18N-007:** Dates, times, calendars, time zones, numbers, decimal separators, currency, units, plurals, names, addresses, and phone numbers use locale/market-aware libraries and stored machine values. Transaction currency never changes because display locale changes.
- **SRS-I18N-008:** RTL applies to chrome, navigation, forms, drawers, task progress, alignment, and focus order. Maps, vehicle media, charts, chronological timelines, VIN/plate/reference/email/URL/phone and other mixed-direction tokens use semantic direction isolation and do not mirror incorrectly.
- **SRS-I18N-009:** Language switching preserves route, selected record, valid form data, checkout step, filters, safe draft, and focus context. Account preference, session/device override, and default/fallback priority are deterministic.
- **SRS-I18N-010:** Each approved locale receives automated key completeness, interpolation, format, Unicode search/sort, and fallback tests plus screenshots of all critical flows at desktop/mobile widths. Each RTL locale receives dedicated mixed-direction, focus-order, overlay, table, chart, and generated-document review.

## 12. Interfaces, Events, and Integrations

### 12.1 REST interface standards

- **SRS-API-001:** All clients use versioned HTTPS REST interfaces under `/api/v1`. No client connects directly to PostgreSQL, Valkey, MinIO, or a provider.
- **SRS-API-002:** OpenAPI is generated/validated from the implemented contract and committed or deterministically generated in CI. Operation IDs, schemas, security, status codes, examples, and error codes are stable and reviewed.
- **SRS-API-003:** Requests validate shape, type, size, locale-neutral codes, cross-field rules, and authorization. Unknown fields follow one documented compatibility rule; mass assignment is prohibited.
- **SRS-API-004:** Responses use a consistent envelope only where it adds value; errors always include stable code, safe localized-message parameters, field errors when applicable, correlation ID, and retryability/current-version metadata as relevant.
- **SRS-API-005:** List operations use bounded cursor pagination, deterministic ordering, permitted filters, and scoped search. Exports handle large result sets asynchronously rather than returning unbounded bodies.
- **SRS-API-006:** Consequential create/command endpoints accept an `Idempotency-Key` scoped to actor, operation, and resource context. Reuse with a different request fingerprint returns conflict.
- **SRS-API-007:** Mutable aggregates expose a version/ETag. Commands use `If-Match` or a request version; stale writes return current safe state and conflict details.
- **SRS-API-008:** Authentication, permission, not-found, validation, conflict, rate-limit, dependency, and internal failures are distinguishable without exposing secrets or record existence to unauthorized callers.
- **SRS-API-009:** Breaking changes require a new API version or compatible migration window. Additive fields must not break older approved mobile clients. Mobile compatibility is checked before server release.
- **SRS-API-010:** Every endpoint is represented in the repository-owned Bruno collection and automated endpoint suite. The collection uses local environment variables and contains no secrets.

### 12.2 Interface inventory

| Interface ID | Producer → consumer | Operations/events | Security and reliability |
| --- | --- | --- | --- |
| IF-REST-IAM | Clients → IAM | register, verify, sign-in/out, refresh, recover, profile/session actions | Rate limits, neutral responses, rotating sessions, audit |
| IF-REST-CAT | Clients → catalogue/availability/pricing | locations, categories, search, availability, quote, hold | Public/scoped reads, bounded queries, freshness/version, expiry |
| IF-REST-BKG | Clients → booking | draft, confirm, list/detail, proposal, modify, cancel, guest access | Ownership/scope, idempotency, optimistic version, atomic commit |
| IF-REST-PAY | Clients → payment | methods, attempt/status, receipt, refund/adjustment commands | No raw card handling; idempotency; finance permissions |
| IF-REST-RNT | Clients → rental | pickup readiness, open, active detail, extend, incident, return, close | Strong permissions, custody/state checks, evidence linkage |
| IF-REST-FLT | OPS → fleet | units, categories, transfers, work, inspections, blocks, jobs | Location scope, concurrency, audited reasons |
| IF-REST-CFG | OPS/all readers → configuration | policies, rates, lookups, templates, translations, roles, providers | Fine-grained read/write/publish permission, ETag, audit |
| IF-REST-RPT | OPS → reporting | definitions, run, export, schedule, job status | Column/row permission, asynchronous large jobs |
| IF-EVT-OUTBOX | Domains → workers/read models | committed versioned domain/integration events | Transactional outbox, unique event ID, ordered aggregate version |
| IF-PAY-ADAPTER | Payment module ↔ simulator/provider | authorize, capture, cancel, refund, query, webhook | Provider keys server-only; signature verification; idempotent mapping |
| IF-MSG-ADAPTER | Notification module ↔ Mailpit/simulator/provider | deliver, delivery callback/query | Minimized recipient data; retry/backoff; duplicate callback safe |
| IF-OBJ-ADAPTER | Document/report modules ↔ MinIO/object provider | put/get/head/delete-policy/signed link | Private buckets, scoped short-lived access, checksum, audit |
| IF-MAP-ADAPTER | Catalogue/clients ↔ local/map provider | suggestion, coordinate, route/directions | Explicit enablement, cached safe result, written fallback |
| IF-ID-ADAPTER | IAM/customer ↔ simulator/provider | start, status, callback | Consent, minimal disclosure, expiry, manual review |
| IF-OBS-OTLP | Apps/workers → OpenTelemetry Collector | traces, metrics, correlated logs | Redaction, environment/service identity, backpressure-safe |

### 12.3 Provider attempt contract

Every provider request records an internal attempt before dispatch, a request fingerprint/idempotency key, provider reference when known, timestamps, safe status, retry decision, and correlation. Timeouts create unknown/pending rather than failed unless the provider contract proves no effect. Webhooks validate signature/replay window where available, deduplicate event IDs, fetch authoritative provider state when needed, and map through stored provider-to-domain state tables. Reconciliation compares internal and provider facts and produces explicit linked/compensated/explained outcomes.

### 12.4 Timeouts, retries, and circuit behavior

Timeout and retry policies are adapter configuration, not scattered constants. Only demonstrably idempotent reads and writes are automatically retried. Backoff is bounded and jittered. Circuit/degraded state is visible through health and SCREEN-OPS-039. A disabled/open circuit provides the source flow's documented local/manual alternative. Queue retry exhaustion creates a recoverable owned case.

## 13. Authentication, Authorization, Security, Privacy, and Compliance

### 13.1 Identity and sessions

- **SRS-SEC-001:** Passwords are hashed with a current memory-hard password hashing algorithm and per-secret salt; plaintext/reversible passwords are prohibited. Algorithm parameters are configurable and rehash on successful sign-in when policy changes.
- **SRS-SEC-002:** Access tokens are short-lived, audience/issuer/purpose scoped, and signature validated. Refresh tokens are opaque or strongly signed, stored hashed server-side, rotated on use, and support reuse detection and session-family revocation.
- **SRS-SEC-003:** Browser refresh credentials use Secure, HttpOnly, appropriate SameSite cookies with CSRF protection for cookie-authenticated writes. Mobile secrets use OS secure storage, never ordinary async/local storage.
- **SRS-SEC-004:** Verification and recovery tokens are single-purpose, expiring, single-use, rate-controlled, and stored as non-reversible values. Responses avoid account enumeration.
- **SRS-SEC-005:** Sensitive staff actions and profile/security changes require recent authentication or step-up verification according to configured policy.
- **SRS-SEC-006:** Optional OAuth/OIDC uses authorization code with PKCE, exact redirect allowlists, state/nonce checks, verified issuer/audience, and explicit verified account linking. Provider sign-in is never the only development path.

### 13.2 Authorization and isolation

- **SRS-SEC-007:** Server-side policy enforcement checks subject, action, resource, organization/market/location scope, record relationship, sensitive field, and approval threshold. Client hiding is usability only.
- **SRS-SEC-008:** Repository queries require an authorization-derived scope object. Unscoped administrative reads are restricted to explicit global permissions and audited.
- **SRS-SEC-009:** Permission changes take effect on the next request and revoke or constrain active sessions where risk requires it. Removing a worker/owner triggers governed reassignment of open work.
- **SRS-SEC-010:** Approval requester and approver separation is enforced for configured high-risk actions; no user may self-approve or escalate beyond their authority.

### 13.3 Application and data security

- **SRS-SEC-011:** All untrusted input is schema-validated; output is context-encoded; parameterized queries/ORM bindings are mandatory; uploaded content is size/type/checksum validated and scanned before use.
- **SRS-SEC-012:** TLS is required outside isolated local development. Database, object store, queue/cache, and telemetry endpoints are not internet-public. Production data at rest uses platform encryption and protected backups.
- **SRS-SEC-013:** Secrets are injected at runtime from protected local/production secret mechanisms, never committed, logged, embedded in clients, screenshots, traces, fixtures, or test reports. Example files contain placeholders only.
- **SRS-SEC-014:** Raw payment credentials/card data must be collected by the provider's approved client mechanism when a live adapter is used; the system stores tokens and masked summaries only. The local simulator accepts synthetic non-card test tokens.
- **SRS-SEC-015:** Security headers, explicit CORS allowlists, CSRF defense, request size limits, abuse/rate controls, safe redirect validation, and content security policy are configured and tested.
- **SRS-SEC-016:** Audit events cover authentication risk, access changes, unmask/export, overrides, money actions, vehicle custody/state, customer restrictions, policy/config publication, provider control, and evidence access.
- **SRS-SEC-017:** Logs/traces/network artifacts redact credentials, tokens, cookies, payment details, document contents, personal identifiers, and provider secrets before export. Test evidence uses synthetic data.

### 13.4 Privacy and compliance

Data collection is purpose-limited and documented by classification and owner. Access, correction, export, closure/deletion, consent, marketing preference, retention, legal hold, and anonymization are configuration-driven and verified before launch. Jurisdiction-specific legal rules are not assumed by this SRS; the business must confirm launch-market obligations. Active rentals, balances, disputes, fraud/safety reviews, or mandatory retention may block deletion with a specific next action. Exports and audit views apply field- and row-level authorization.

### 13.5 Security verification

TEST-SEC-001–017 cover each numbered security requirement. Automated testing includes dependency/container scans, static rules, authentication abuse, horizontal/vertical authorization, scope isolation, mass assignment, injection, upload, CSRF/CORS, redirect, rate-limit, token replay/rotation, webhook replay/signature, secret scanning, and log redaction. OWASP ZAP baseline runs against a test deployment; findings are triaged under the release severity policy.

## 14. Error, Recovery, Concurrency, and Reconciliation

### 14.1 Error model

The API error model includes a stable code, category, HTTP status, correlation ID, safe parameters, field paths, retryable flag, current aggregate version/state when safe, and existing-result reference for duplicate commands. User interfaces translate the code into the accepted design's feedback hierarchy. Stack traces, SQL, provider payloads, secrets, and internal authorization details are never returned to clients.

### 14.2 Required failure behavior

| Condition | Required behavior | Test family |
| --- | --- | --- |
| Invalid input/business rejection | No write; retain valid input; identify fields/rule and valid next action | TEST-ERR-001 |
| Duplicate command/callback | Return/link existing result; reject mismatched key reuse | TEST-ERR-002 |
| Stale concurrent edit | Reject with authoritative version and safe comparison/reload | TEST-ERR-003 |
| Partial database write | Transaction rolls back; outbox and aggregate remain consistent | TEST-ERR-004 |
| Provider timeout/unknown | Preserve one pending attempt; status query/reconcile; no blind retry | TEST-ERR-005 |
| Provider verified failure | Mark failure and allow policy-safe retry/alternate | TEST-ERR-006 |
| Notification failure | Preserve committed domain result; retry task and visible delivery status | TEST-ERR-007 |
| Object upload partial/orphan | Mark incomplete; retry/cleanup job; never expose as accepted evidence | TEST-ERR-008 |
| Queue interruption | Lease/visibility expiry allows idempotent resume; bounded retry | TEST-ERR-009 |
| Offline/interrupted UI | Preserve only safe labelled draft; revalidate on reconnect | TEST-ERR-010 |
| Configuration changes mid-flow | Accepted snapshot remains; draft refresh/review if selection invalid | TEST-ERR-011 |
| Import/export partial | Per-row/result status; retry failed work only | TEST-ERR-012 |
| Reconciliation mismatch | Create owned case; link, compensate, explain, or escalate explicitly | TEST-ERR-013 |

### 14.3 Compensation principles

Compensation is a new auditable command, never deletion of the original fact. Examples include release an unused hold, cancel an unconfirmed provider authorization, refund a captured payment under approved policy, restore capacity after failed booking, or create a customer-service case when automatic correction is unsafe. Money, inventory, custody, and customer communication sides are each checked before a recovery case closes.

### 14.4 Scheduled reconciliation

Workers periodically inspect expired holds, provider attempts stuck pending, outbox messages not delivered, booking/payment mismatches, returns awaiting finance/inspection, refunds pending beyond policy, stale integration sync, failed jobs, missing object metadata/content, and lookup/system-code drift. Schedules and escalation thresholds are configuration. Each run is idempotent, scoped, observable, and creates actionable evidence rather than silently changing ambiguous facts.

## 15. Quality Attributes

### 15.1 Performance and responsiveness

- **SRS-NFR-001:** Before release, the team records approved user-load, data-volume, network, and device profiles plus budgets for page/navigation, API latency, search/quote, background job completion, and report generation. Results are measured at median and tail percentiles; averages alone are insufficient.
- **SRS-NFR-002:** Initial web/admin JavaScript, image, font, and request budgets are defined per route class. Route changes that exceed an approved budget fail performance review unless an evidence-backed exception is accepted.
- **SRS-NFR-003:** Search, lists, and reports are paginated/streamed or asynchronous; expensive work cannot block request workers indefinitely. Database query count and duration are observable.
- **SRS-NFR-004:** Mobile behavior is exercised on an approved lower-capability device and constrained network profile. Core tasks must remain understandable during latency and reconnection.

### 15.2 Scalability and availability

- **SRS-NFR-005:** Web, API, and worker processes are horizontally scalable and keep no unique business state only in process memory. Sticky sessions are not required for correctness.
- **SRS-NFR-006:** PostgreSQL connection limits, pools, indexes, transactions, and report workloads are capacity-tested. Read projections may scale reporting, but authoritative writes remain consistent.
- **SRS-NFR-007:** Queue workers scale by workload class and preserve ordering where an aggregate requires it. Backpressure protects providers and the database.
- **SRS-NFR-008:** The selected production availability target, maintenance window, recovery point, and recovery time are approved before launch. Automated health checks and tested backup restore provide evidence.
- **SRS-NFR-009:** Optional integration outage degrades only dependent assistance; it must not make unrelated browsing, record viewing, or operations unavailable.

### 15.3 Accessibility and compatibility

- **SRS-NFR-010:** Customer web and operations conform to WCAG 2.2 Level AA for applicable content and interactions. Native mobile follows equivalent platform accessibility semantics and the accepted design contracts.
- **SRS-NFR-011:** Browser, OS, device, viewport, zoom, input modality, screen reader, and locale matrices are approved and automated/manual evidence is retained per release.
- **SRS-NFR-012:** No core task depends only on color, hover, drag, swipe, fine pointer, sound, motion, or one orientation.

### 15.4 Maintainability, reuse, and clean delivery

- **SRS-NFR-013:** Repository boundaries are enforced automatically. Domain modules cannot import another module's persistence internals; clients consume generated/shared contracts rather than copying schemas.
- **SRS-NFR-014:** TypeScript strict checks, lint, format, unit/component, endpoint, migration, and critical E2E tests are one-command, non-interactive, and reproducible locally.
- **SRS-NFR-015:** New behavior includes source ID traceability in code/test metadata, clear naming, small cohesive units, dependency injection at external boundaries, and tests at the lowest sufficient level plus critical end-to-end coverage.
- **SRS-NFR-016:** Duplicate components/business rules are detected during review. Shared abstractions require at least two real consumers and one coherent responsibility; premature generic frameworks are avoided.
- **SRS-NFR-017:** Public APIs/events, migrations, environment variables, operational procedures, and architecture decisions are documented in the repository and reviewed with code.
- **SRS-NFR-018:** Feature flags/configuration have owner, default, scope, expiry/review date where temporary, audit, and both-state tests. A disabled feature has a complete UX, not a broken link.
- **SRS-NFR-019:** Coverage reports are used to find risk, not as the sole quality measure. Every lifecycle transition, financial branch, permission boundary, lookup class, and recovery rule requires direct assertions.

### 15.5 Reliability and data integrity

- **SRS-NFR-020:** Consequential commands are idempotent; events are deduplicated; accepted transactions and outbox events are atomic; workers resume safely.
- **SRS-NFR-021:** Restore, migration, reconciliation, and provider-failure exercises use synthetic data and verify both business state and audit evidence.
- **SRS-NFR-022:** No cache, search index, analytics store, client draft, log, or object metadata projection may override PostgreSQL authoritative state.

## 16. Observability and Operational Requirements

### 16.1 Structured logging

- **SRS-OBS-001:** Server and worker logs are structured JSON with UTC timestamp, severity, service, module, environment, version/build, event code, trace ID, span ID, request ID, job ID, actor type and scoped pseudonymous ID where permitted, route template/operation ID, outcome, duration, and safe error code.
- **SRS-OBS-002:** Raw URLs/query values, tokens, cookies, secrets, passwords, payment credentials, document contents, and unrestricted personal data are prohibited. A tested redaction layer processes logs and telemetry.
- **SRS-OBS-003:** Every request returns a correlation ID; clients include it in safe error support details. Provider attempts, outbox events, jobs, audit events, and domain commands carry the same trace/correlation lineage.
- **SRS-OBS-004:** Log levels and sampling are environment configuration. Audit events are not removed by diagnostic sampling. Debug logging is time-bounded and cannot enable sensitive payload logging.

### 16.2 Metrics and traces

- **SRS-OBS-005:** OpenTelemetry instruments incoming requests, outbound adapter calls, database operations, queue publish/consume, jobs, and key domain commands. Traces use semantic route/operation names rather than high-cardinality raw identifiers.
- **SRS-OBS-006:** Metrics cover traffic, error/latency, saturation, database pool/query health, queue depth/age/failure, outbox backlog, provider outcomes, cache effectiveness, object failures, reconciliation backlog, and business counts required by operations.
- **SRS-OBS-007:** Local Compose includes an OpenTelemetry Collector and open-source viewer/backends. Telemetry export failure must not fail a business transaction or grow memory/disk without bounds.

### 16.3 Health and operational control

| Endpoint/control | Contract |
| --- | --- |
| `/health/live` | Process event loop is responsive; no deep dependency call |
| `/health/ready` | Required dependencies and startup catalogue/migration checks permit safe traffic |
| `/health/version` | Safe build/version/schema compatibility metadata; no secret/environment dump |
| Metrics endpoint | Restricted from public access; scrape-compatible |
| Integration health | Adapter enablement, last success, error category, backlog, circuit state, safe test action |
| Queue/job control | Permission-scoped pause/resume/retry/cancel where safe, with audit |

### 16.4 Debugging and evidence bundle

- **SRS-OBS-008:** A failed automated UI test retains Playwright trace, only-on-failure screenshot, console entries, network metadata, test name/source IDs, seed identity, build/version, and server correlation IDs. Video is optional when trace is sufficient.
- **SRS-OBS-009:** Network evidence stores route templates and redacted payload summaries. HAR/trace artifacts containing secrets or personal data must be sanitized or restricted and must use synthetic accounts.
- **SRS-OBS-010:** Backend test failure retains structured service/worker logs and relevant trace. Database assertions show sanitized before/after state or invariant query results, not production dumps.
- **SRS-OBS-011:** Each critical E2E checkpoint saves a named screenshot keyed by application, flow, step, viewport/device, locale/direction, theme if supported, and state. Screenshot evidence links to the exact test run and commit.
- **SRS-OBS-012:** Developers can start the local stack, inspect mail, messages, objects, API docs, database, logs, metrics, and traces using documented local URLs/commands without a cloud account.

## 17. Verification and Acceptance Criteria

### 17.1 Acceptance rule

`AC-AREA-NNN` for each source `FR-AREA-NNN` is satisfied only when its source acceptance evidence and all success/failure/recovery/permission effects pass against the appropriate applications and persistence state. `TEST-AREA-NNN` is the automated or explicitly manual test group proving it. A passing UI-only mock is insufficient when the requirement changes server or database state.

### 17.2 Test levels

| Level | Required scope | Evidence |
| --- | --- | --- |
| Static | Types, lint, format, dependency boundaries, OpenAPI/schema generation, translation/static-option scans, secret scan | Machine-readable reports; zero unexplained failures |
| Unit | Domain calculations, state transitions, policy evaluation, mapping, error translation, redaction | Fast deterministic tests and branch assertions |
| Component | Forms/components, accessibility semantics, state rendering, provider adapters | DOM/native assertions and focused screenshots where useful |
| Repository/data | Constraints, queries, locks, migrations, outbox, audit, retention behavior | Real PostgreSQL through Testcontainers |
| API | Every REST operation and error class | Supertest/OpenAPI validation; database and event assertions |
| Integration | Payment/message/object/map/identity simulators and optional sandboxes | Attempt/event/idempotency/retry/reconcile evidence |
| E2E web/admin | Every critical FLOW and major SCREEN state | Playwright HTML report, traces on failure, screenshots, console/network assertions |
| E2E mobile | Critical customer flows, deep links, capture, offline drafts, locale/RTL | Emulator/device report and screenshots |
| Non-functional | Accessibility, load, restore, security, compatibility | Approved reports and tracked findings |

### 17.3 Backend endpoint test contract

Every OpenAPI operation must have tests for authenticated/anonymous behavior as applicable, success, required/format/cross-field validation, not-found without leakage, horizontal and vertical permission denial, scope isolation, stale version, duplicate/idempotent replay for commands, domain-state rejection, dependency failure/timeout where used, serialization/localization neutrality, and expected database/outbox/audit result. Pagination tests cover stable order, cursors, boundaries, filters, inactive/history visibility, and authorization changes between pages.

Contract tests fail when an implementation response is undocumented or the implementation omits a documented response. The Bruno collection is generated/checked against operation IDs and includes safe local examples for all endpoint groups.

### 17.4 Database change test contract

Each migration must prove: a new empty database reaches current; a supported previous snapshot upgrades; required catalogue seeds are idempotent; existing representative records preserve meaning; new not-null/unique/foreign-key/check constraints are safe; indexes support intended queries; migration failure does not leave an undocumented partial state; application startup detects incompatible schema; and rollback or a documented forward-fix/restore procedure exists. Destructive or long-locking production changes require staged expand/migrate/contract design and recovery rehearsal.

### 17.5 UI, screenshot, log, and network test contract

Playwright must capture screenshots on failure and traces on the configured retry/failure policy. Critical checkpoints also receive stable approved screenshots. Tests assert no unexpected console errors, page errors, failed network calls, duplicate commands, or secret-bearing output. A flow result is verified at four layers where applicable: visible UI, HTTP operation/result, database state/event/audit, and background/provider-simulator outcome.

Visual review includes desktop, tablet, phone, high zoom/text expansion, default and longest approved translations, RTL, empty/validation/failure/pending/success, keyboard focus, overlay focus return, sticky controls, and data-table adaptation. Intentional differences require reviewed baselines tied to the change.

### 17.6 Dynamic-data and localization audits

Static analysis scans client and domain code for hard-coded business option arrays and unlocalized user-facing text. Runtime contract tests enumerate design lookup consumers and verify database/API ownership, empty/unavailable/inactive/history, permission, localization, and invalidation. All approved locales receive key completeness, fallback, interpolation, formatting, generated-output, Unicode, search/sort, and direction tests.

### 17.7 Release gates

A release candidate is blocked by a failed required test; missing FR/screen/flow/lookup trace; unreviewed API/schema migration; unresolved release-severity security/accessibility defect; unexpected console/network failure in a critical flow; failed restore/migration evidence; mandatory policy/translation not configured; exposed secret; or unknown payment/inventory/custody inconsistency without an owned recovery case. Waivers require owner, evidence, scope, expiry, and approval and cannot waive an uncontained security or data-integrity risk.

## 18. Dependency and Implementation-Sequence Constraints

### 18.1 Sequencing principles

Build a minimum shared foundation, then complete vertical slices that end in visible, persisted, tested behavior. Do not build every frontend screen before APIs/data, or every database table before a working flow. Each slice includes UI, API, domain, persistence, permissions, logs/traces, tests, fixtures, and documentation.

### 18.2 Recommended stages

| Stage | Scope and dependency | Exit evidence |
| --- | --- | --- |
| 0. Repository/local platform | Workspaces, strict tooling, Compose, PostgreSQL, Valkey, MinIO, Mailpit, message/payment/map simulators, OTel stack, test commands | Clean clone starts locally; health, migration, seed, logs/traces, sample endpoint and evidence path pass |
| 1. Shared identity/config/UI | IAM sessions/permissions, organizations/locations, lookups, translations, UI primitives/states, audit/outbox | Sign-in/recovery, role isolation, dynamic selector, locale/RTL sample, API/DB/E2E tests |
| 2. Discovery and quote | Catalogue, fleet availability inputs, search, pricing/quote, holds | SCREEN-CUS-001–003 and relevant OPS configuration; fresh/stale/no-result flows and load baseline |
| 3. Booking and payment | Checkout, customer/driver, products, terms, simulator/provider adapter, confirmation/notification | FLOW-CUS-001/002/003 and FLOW-OPS-001; duplicate/unknown payment and atomic database evidence |
| 4. Reservation operations | Lists/detail, modify, cancel, refund, customer workspaces | FLOW-CUS-004/005, FLOW-OPS-011/012; concurrency and reconciliation |
| 5. Pickup/rental/return | Fleet readiness, assignment, pickup/agreement, active rental, extension, incident, replacement, return/inspection/closeout | FLOW-CUS-006–009 and FLOW-OPS-002–009/019; custody, finance, and vehicle-state invariants |
| 6. Administration/reporting | Full config/versioning, imports, templates/translations, reports/exports/schedules, integration recovery | FLOW-OPS-010/013–018; jobs, permissions, screenshots, audit |
| 7. Release hardening | Performance, accessibility, security, compatibility, backup/restore, production adapter verification and deployment | All matrices covered; release gates pass; runbooks and rollback verified |

### 18.3 Production service activation

No production provider is activated until its adapter contract passes against the local simulator and the provider's safe test environment, secrets and webhook controls are configured, operational owner and degraded path are confirmed, reconciliation is exercised, and the UI communicates only verified facts. Production deployment may target AWS or another Linux/container environment, but target-specific infrastructure cannot be imported into domain modules.

## 19. Requirements Traceability Matrix

Every source FR appears exactly once below. `SRS-AREA-NNN` adopts the full normative behavior in Section 6 and the applicable cross-cutting implementation requirements in Sections 7–18.

| FR ID | SRS ID(s) | APP/SCREEN/FLOW/STATE IDs | Acceptance/Test IDs | Covered |
| --- | --- | --- | --- | --- |
| FR-GBL-001 | SRS-GBL-001 | APP: All; SCREEN: All record/detail screens; FLOW: All cross-app flows; STATE: Fresh, Stale, Conflict, Accepted | AC-GBL-001; TEST-GBL-001 | Yes |
| FR-GBL-002 | SRS-GBL-002 | APP: All; SCREEN: CUS-001/012; OPS-033/034; FLOW: CUS-002, OPS-016; STATE: Selected, Fallback, Missing, Published | AC-GBL-002; TEST-GBL-002 | Yes |
| FR-GBL-003 | SRS-GBL-003 | APP: All; SCREEN: CUS-001–006/015/020–023; OPS-025–029/034/036; FLOW: CUS-001/004/006; OPS-013/017; STATE: Locale-valid, Ambiguous-time, Mixed-direction | AC-GBL-003; TEST-GBL-003 | Yes |
| FR-GBL-004 | SRS-GBL-004 | APP: All; SCREEN: OPS-030/031 and every dynamic form; FLOW: OPS-014; STATE: Loading, Active, Inactive-history, Read-only, Sync-failed | AC-GBL-004; TEST-GBL-004 | Yes |
| FR-GBL-005 | SRS-GBL-005 | APP: All; SCREEN: CUS-007/015/019/020; OPS-003/005/010/014/023; FLOW: All record flows; STATE: Current, Pending, Failed, Terminal, Next-action | AC-GBL-005; TEST-GBL-005 | Yes |
| FR-GBL-006 | SRS-GBL-006 | APP: All; SCREEN: CUS-006/016/017; OPS-008/011/023/024/039; FLOW: CUS-001/004/005; OPS-003/006/012/018; STATE: Duplicate-returned, Stale, Unknown, Conflict | AC-GBL-006; TEST-GBL-006 | Yes |
| FR-GBL-007 | SRS-GBL-007 | APP: All; SCREEN: All; FLOW: All; STATE: Focus, Keyboard, Touch, Zoom, Announced-status | AC-GBL-007; TEST-GBL-007 | Yes |
| FR-GBL-008 | SRS-GBL-008 | APP: APP-OPS; customer subset; SCREEN: OPS-038 and all workspaces; CUS-015/019; FLOW: OPS-011–019; STATE: Recorded, Masked, Exported, Corrected-by-append | AC-GBL-008; TEST-GBL-008 | Yes |
| FR-IAM-001 | SRS-IAM-001 | APP: All customer; SCREEN: CUS-009; origin checkout; FLOW: CUS-002; STATE: Draft, Duplicate, Pending-verification, Active | AC-IAM-001; TEST-IAM-001 | Yes |
| FR-IAM-002 | SRS-IAM-002 | APP: All; SCREEN: CUS-009/012/018; OPS-022; FLOW: CUS-002/003/010; STATE: Sent, Verified, Incorrect, Expired, Delivery-failed | AC-IAM-002; TEST-IAM-002 | Yes |
| FR-IAM-003 | SRS-IAM-003 | APP: All; SCREEN: CUS-008; OPS-001; FLOW: CUS-002, OPS-015; STATE: Active-session, Failed, Locked, Suspended, Signed-out | AC-IAM-003; TEST-IAM-003 | Yes |
| FR-IAM-004 | SRS-IAM-004 | APP: All; SCREEN: CUS-010; OPS-001/022; FLOW: CUS-002, OPS-015; STATE: Requested, Verified, Expired, Changed, Review | AC-IAM-004; TEST-IAM-004 | Yes |
| FR-IAM-005 | SRS-IAM-005 | APP: All; SCREEN: CUS-008; OPS-001/039; FLOW: CUS-002, OPS-018; STATE: Provider-pending, Cancelled, Linked, Conflict, Unavailable | AC-IAM-005; TEST-IAM-005 | Yes |
| FR-IAM-006 | SRS-IAM-006 | APP: All; SCREEN: CUS-011/012; OPS-022; FLOW: CUS-010; STATE: View, Edit, Verification-pending, Conflict, Saved | AC-IAM-006; TEST-IAM-006 | Yes |
| FR-IAM-007 | SRS-IAM-007 | APP: All; SCREEN: CUS-004/013; OPS-008/022; FLOW: CUS-001/010, OPS-003; STATE: Eligible, Needs-review, Expired, Ineligible, Verified | AC-IAM-007; TEST-IAM-007 | Yes |
| FR-IAM-008 | SRS-IAM-008 | APP: All; SCREEN: CUS-024; OPS-022; FLOW: CUS-010, OPS-011; STATE: Draft, Verified, Blocked, In-review, Completed, Cancelled | AC-IAM-008; TEST-IAM-008 | Yes |
| FR-CAT-001 | SRS-CAT-001 | APP: All customer; OPS content; SCREEN: CUS-001/002; OPS-015; FLOW: CUS-001, OPS-013; STATE: Active, Empty, Unavailable, Deactivated | AC-CAT-001; TEST-CAT-001 | Yes |
| FR-CAT-002 | SRS-CAT-002 | APP: All customer; SCREEN: CUS-001/002; FLOW: CUS-001; STATE: Loading, Results, No-results, Filtered, Error | AC-CAT-002; TEST-CAT-002 | Yes |
| FR-CAT-003 | SRS-CAT-003 | APP: All; SCREEN: CUS-003; OPS-015; FLOW: CUS-001; STATE: Fresh, Representative, Exact, Missing-media, Withdrawn | AC-CAT-003; TEST-CAT-003 | Yes |
| FR-CAT-004 | SRS-CAT-004 | APP: All; SCREEN: CUS-001/003/023; OPS-028; FLOW: CUS-001/009, OPS-013; STATE: Open, Closed, Exceptional-hours, Archived | AC-CAT-004; TEST-CAT-004 | Yes |
| FR-CAT-005 | SRS-CAT-005 | APP: All; SCREEN: CUS-002/006/016/021; OPS-007/019; FLOW: CUS-001/004/006, OPS-002/005/008/009; STATE: Available, Held, Unavailable, Stale, Conflict | AC-CAT-005; TEST-CAT-005 | Yes |
| FR-CAT-006 | SRS-CAT-006 | APP: All customer/assisted; SCREEN: CUS-004–006; OPS-006; FLOW: CUS-001, OPS-001; STATE: Hold-active, Warning, Expired, Converted, Released | AC-CAT-006; TEST-CAT-006 | Yes |
| FR-CAT-007 | SRS-CAT-007 | APP: All customer/assisted; SCREEN: CUS-002/016; OPS-006/007; FLOW: CUS-001/004, OPS-002; STATE: No-match, Alternatives, Difference-disclosed, None-valid | AC-CAT-007; TEST-CAT-007 | Yes |
| FR-PRC-001 | SRS-PRC-001 | APP: APP-OPS; consumed all; SCREEN: OPS-025; FLOW: OPS-013; STATE: Draft, Conflict, Scheduled, Active, Paused, Superseded | AC-PRC-001; TEST-PRC-001 | Yes |
| FR-PRC-002 | SRS-PRC-002 | APP: All; SCREEN: CUS-002/003/006/016; OPS-006/025; FLOW: CUS-001/004, OPS-001/013; STATE: Estimated, Fresh, Expired, Changed, Unavailable | AC-PRC-002; TEST-PRC-002 | Yes |
| FR-PRC-003 | SRS-PRC-003 | APP: All; SCREEN: CUS-006/017/019; OPS-026/029; FLOW: CUS-001/005, OPS-004/013; STATE: Applied, Missing-config, Override-pending, Historical | AC-PRC-003; TEST-PRC-003 | Yes |
| FR-PRC-004 | SRS-PRC-004 | APP: All; SCREEN: CUS-001/006; OPS-026; FLOW: CUS-001/004, OPS-013; STATE: Valid, Invalid, Expired, Exhausted, Removed | AC-PRC-004; TEST-PRC-004 | Yes |
| FR-PRC-005 | SRS-PRC-005 | APP: All; SCREEN: CUS-005/015; OPS-027; FLOW: CUS-001/004, OPS-013; STATE: Available, Reserved, Out-of-stock, Removed-with-consent, Historical | AC-PRC-005; TEST-PRC-005 | Yes |
| FR-PRC-006 | SRS-PRC-006 | APP: All; SCREEN: CUS-005/006/015; OPS-027; FLOW: CUS-001, OPS-013; STATE: Applicable, Accepted, Declined, Ineligible, Versioned | AC-PRC-006; TEST-PRC-006 | Yes |
| FR-PRC-007 | SRS-PRC-007 | APP: All; SCREEN: CUS-002/006/019; OPS-023/025/026/036; FLOW: CUS-001/004, OPS-012/017; STATE: Transaction-currency, Informational-conversion, Unsupported, Reconciled | AC-PRC-007; TEST-PRC-007 | Yes |
| FR-BKG-001 | SRS-BKG-001 | APP: All customer/assisted; SCREEN: CUS-004–006/008–010; OPS-006; FLOW: CUS-001/002, OPS-001; STATE: Draft, Resumable, Hold-expired, Abandoned, Restored | AC-BKG-001; TEST-BKG-001 | Yes |
| FR-BKG-002 | SRS-BKG-002 | APP: All; SCREEN: CUS-004; OPS-006/008/029; FLOW: CUS-001, OPS-001/003; STATE: Eligible, Review, Ineligible, Correctable, Non-waivable | AC-BKG-002; TEST-BKG-002 | Yes |
| FR-BKG-003 | SRS-BKG-003 | APP: All; SCREEN: CUS-004; OPS-006/008; FLOW: CUS-001, OPS-001/003; STATE: Owner, Renter, Payer, Additional-driver-pending | AC-BKG-003; TEST-BKG-003 | Yes |
| FR-BKG-004 | SRS-BKG-004 | APP: All; SCREEN: CUS-002/006; OPS-006/007; FLOW: CUS-001, OPS-001/002; STATE: Hold, Reserved-capacity, Lost-availability, Recovery-case | AC-BKG-004; TEST-BKG-004 | Yes |
| FR-BKG-005 | SRS-BKG-005 | APP: All; SCREEN: CUS-005/006; OPS-006/008; FLOW: CUS-001, OPS-001/003; STATE: Reviewed, Accepted-version, Declined, Changed-reaccept | AC-BKG-005; TEST-BKG-005 | Yes |
| FR-BKG-006 | SRS-BKG-006 | APP: All; SCREEN: CUS-006/007; OPS-005/006; FLOW: CUS-001, OPS-001/018; STATE: Confirming, Confirmed, Failed-no-booking, Partial-owned | AC-BKG-006; TEST-BKG-006 | Yes |
| FR-BKG-007 | SRS-BKG-007 | APP: All; SCREEN: CUS-006/007; OPS-006; FLOW: CUS-001, OPS-001; STATE: First-submit, Duplicate-returned, Possible-duplicate-review | AC-BKG-007; TEST-BKG-007 | Yes |
| FR-BKG-008 | SRS-BKG-008 | APP: All; SCREEN: CUS-007/015; OPS-005/033; FLOW: CUS-001, OPS-016; STATE: Confirmed, Message-queued/delivered/failed, Resent | AC-BKG-008; TEST-BKG-008 | Yes |
| FR-BKG-009 | SRS-BKG-009 | APP: All customer/OPS support; SCREEN: CUS-018/015/009; OPS-022; FLOW: CUS-003; STATE: Challenge, Scoped-access, Expired, Linked, Conflict | AC-BKG-009; TEST-BKG-009 | Yes |
| FR-BKG-010 | SRS-BKG-010 | APP: APP-OPS; SCREEN: OPS-006/005; FLOW: OPS-001; STATE: Draft, Pending-owned, Confirmed, Cancelled/Expired | AC-BKG-010; TEST-BKG-010 | Yes |
| FR-PAY-001 | SRS-PAY-001 | APP: All; SCREEN: CUS-006; OPS-006/008/023; FLOW: CUS-001, OPS-001/003; STATE: Eligible-methods, No-method, Selected, Unsupported-hold | AC-PAY-001; TEST-PAY-001 | Yes |
| FR-PAY-002 | SRS-PAY-002 | APP: All; SCREEN: CUS-006/007; OPS-006/023; FLOW: CUS-001, OPS-001/012; STATE: Action-required, Authorized, Captured, Failed, Unknown | AC-PAY-002; TEST-PAY-002 | Yes |
| FR-PAY-003 | SRS-PAY-003 | APP: All; SCREEN: CUS-006/019; OPS-008/011/023; FLOW: CUS-001, OPS-003/006; STATE: Required, Authorized, Failed, Adjusted, Released, Captured | AC-PAY-003; TEST-PAY-003 | Yes |
| FR-PAY-004 | SRS-PAY-004 | APP: All; SCREEN: CUS-006/019; OPS-024/039; FLOW: CUS-001, OPS-012/018; STATE: Declined, Cancelled, Unknown, Reconciled, Safe-retry | AC-PAY-004; TEST-PAY-004 | Yes |
| FR-PAY-005 | SRS-PAY-005 | APP: All; SCREEN: CUS-007/019; OPS-023; FLOW: CUS-001/005, OPS-006/012; STATE: Receipt-ready/pending/failed-copy, Balanced | AC-PAY-005; TEST-PAY-005 | Yes |
| FR-PAY-006 | SRS-PAY-006 | APP: All; SCREEN: CUS-017/019; OPS-023/024; FLOW: CUS-005, OPS-012; STATE: Refund-not-due, Requested, Processing, Succeeded, Failed-review | AC-PAY-006; TEST-PAY-006 | Yes |
| FR-PAY-007 | SRS-PAY-007 | APP: All; SCREEN: CUS-016/019; OPS-011/023; FLOW: CUS-004/006, OPS-006/019; STATE: Draft-adjustment, Approved, Charged, Credited, Disputed, Reversed | AC-PAY-007; TEST-PAY-007 | Yes |
| FR-PAY-008 | SRS-PAY-008 | APP: All; SCREEN: CUS-019; OPS-023/024; FLOW: OPS-012/019; STATE: Eligible, Approval, Processing, Won/Lost, Refunded/Reversed | AC-PAY-008; TEST-PAY-008 | Yes |
| FR-PAY-009 | SRS-PAY-009 | APP: APP-OPS; customer status; SCREEN: OPS-024/023/038; CUS-019; FLOW: OPS-012/018; STATE: Open, Investigating, Linked, Compensated, Explained, Escalated | AC-PAY-009; TEST-PAY-009 | Yes |
| FR-RSV-001 | SRS-RSV-001 | APP: All; SCREEN: CUS-014/015; OPS-004/005; FLOW: CUS-003–005, OPS-004; STATE: Upcoming, Active-linked, Completed, Cancelled, Missing/denied | AC-RSV-001; TEST-RSV-001 | Yes |
| FR-RSV-002 | SRS-RSV-002 | APP: All; SCREEN: CUS-016/015; OPS-005; FLOW: CUS-004; STATE: Proposal, Compared, Modified, Original-unchanged, Conflict | AC-RSV-002; TEST-RSV-002 | Yes |
| FR-RSV-003 | SRS-RSV-003 | APP: All; SCREEN: CUS-017/015/019; OPS-005/023; FLOW: CUS-005; STATE: Review, Cancelled, Already-cancelled, Refund-pending/failed | AC-RSV-003; TEST-RSV-003 | Yes |
| FR-RSV-004 | SRS-RSV-004 | APP: All; SCREEN: CUS-015; OPS-007/005; FLOW: OPS-004; STATE: On-time, Delay-reported, Grace, No-show, Corrected | AC-RSV-004; TEST-RSV-004 | Yes |
| FR-RSV-005 | SRS-RSV-005 | APP: All; SCREEN: CUS-015/011; OPS-003/005/006; FLOW: CUS-001, OPS-001; STATE: Pending-known-item, Deadline, Expired, Completed-after-recheck | AC-RSV-005; TEST-RSV-005 | Yes |
| FR-RSV-006 | SRS-RSV-006 | APP: APP-OPS; SCREEN: OPS-005/006/010/025–029; FLOW: OPS-001/002/005/013; STATE: Requested, Approved, Rejected, Non-overridable, Revoked-linked | AC-RSV-006; TEST-RSV-006 | Yes |
| FR-RSV-007 | SRS-RSV-007 | APP: All; SCREEN: CUS-015; OPS-005/010/038; FLOW: CUS-004/005, OPS-003/004/006; STATE: Chronological, Customer-masked, Staff-detail, Corrected-by-event | AC-RSV-007; TEST-RSV-007 | Yes |
| FR-RNT-001 | SRS-RNT-001 | APP: All; SCREEN: OPS-002/003/007; CUS-015; FLOW: OPS-002; STATE: Ready, Blocked, Unassigned, Delayed, Escalated | AC-RNT-001; TEST-RNT-001 | Yes |
| FR-RNT-002 | SRS-RNT-002 | APP: APP-OPS; customer acknowledgement; SCREEN: OPS-007/005/014; CUS-015; FLOW: OPS-002/007; STATE: Candidate, Assigned, Conflict, Substitution-review, Recovery | AC-RNT-002; TEST-RNT-002 | Yes |
| FR-RNT-003 | SRS-RNT-003 | APP: APP-OPS; customer instructions; SCREEN: OPS-008/022; CUS-015; FLOW: OPS-003; STATE: Verified, Failed, Needs-review, Waived-permitted, Non-waivable | AC-RNT-003; TEST-RNT-003 | Yes |
| FR-RNT-004 | SRS-RNT-004 | APP: All; SCREEN: OPS-008/018; CUS-020; FLOW: OPS-003; STATE: Opening-pending, Condition-disputed, Accepted, Active, Aborted | AC-RNT-004; TEST-RNT-004 | Yes |
| FR-RNT-005 | SRS-RNT-005 | APP: All; SCREEN: CUS-020; OPS-009/010; FLOW: CUS-006–009, OPS-005–007; STATE: Active, Extended, Incident, Overdue, Completed-read-only | AC-RNT-005; TEST-RNT-005 | Yes |
| FR-RNT-006 | SRS-RNT-006 | APP: All; SCREEN: CUS-021; OPS-010/003; FLOW: CUS-006, OPS-005; STATE: Proposal, Self-service-ready, Pending, Approved, Rejected, Unknown | AC-RNT-006; TEST-RNT-006 | Yes |
| FR-RNT-007 | SRS-RNT-007 | APP: All; SCREEN: CUS-020/023; OPS-009/010; FLOW: CUS-006/009, OPS-004–006; STATE: Due, Grace, Late, Overdue, Early-return, Return-started | AC-RNT-007; TEST-RNT-007 | Yes |
| FR-RNT-008 | SRS-RNT-008 | APP: All; SCREEN: CUS-022; OPS-012/039; FLOW: CUS-007, OPS-018; STATE: Draft-unsent, Submitted, Provider-pending/failed, Dispatched, Resolved | AC-RNT-008; TEST-RNT-008 | Yes |
| FR-RNT-009 | SRS-RNT-009 | APP: All; SCREEN: CUS-022; OPS-012/010/018; FLOW: CUS-008, OPS-007; STATE: Reported, Triaged, Unit-blocked, Review, Resolved | AC-RNT-009; TEST-RNT-009 | Yes |
| FR-RNT-010 | SRS-RNT-010 | APP: APP-OPS; customer acknowledgement; SCREEN: OPS-010/012/007/018; CUS-020; FLOW: OPS-007; STATE: Replacement-in-progress, Accepted, No-unit, Active-replaced, Terminated-review | AC-RNT-010; TEST-RNT-010 | Yes |
| FR-RNT-011 | SRS-RNT-011 | APP: All; SCREEN: CUS-023; OPS-011/018; FLOW: CUS-009, OPS-006; STATE: Active, Return-started, Received, Pending-inspection | AC-RNT-011; TEST-RNT-011 | Yes |
| FR-RNT-012 | SRS-RNT-012 | APP: APP-OPS; customer result; SCREEN: OPS-018/011; CUS-019; FLOW: OPS-006/008; STATE: In-progress, Passed, Failed, Needs-review, Superseded | AC-RNT-012; TEST-RNT-012 | Yes |
| FR-RNT-013 | SRS-RNT-013 | APP: APP-OPS; customer statement; SCREEN: OPS-011/023; CUS-019; FLOW: OPS-006/019; STATE: Draft, Evidence-needed, Approved, Disputed, Interim/final | AC-RNT-013; TEST-RNT-013 | Yes |
| FR-RNT-014 | SRS-RNT-014 | APP: All; SCREEN: CUS-023; OPS-011/003; FLOW: CUS-009, OPS-006; STATE: Eligible, Ineligible, Submitted, Unacknowledged, Pending-inspection | AC-RNT-014; TEST-RNT-014 | Yes |
| FR-RNT-015 | SRS-RNT-015 | APP: All; SCREEN: OPS-011/023/024; CUS-019; FLOW: OPS-006/012; STATE: Returned, Financial-review, Completed, Provider-failed, Corrected | AC-RNT-015; TEST-RNT-015 | Yes |
| FR-RNT-016 | SRS-RNT-016 | APP: All; SCREEN: OPS-010/012/023; CUS-019; FLOW: OPS-019; STATE: Unmatched, Matched, Review, Charged/Disputed/Reversed, Property-closed | AC-RNT-016; TEST-RNT-016 | Yes |
| FR-FLT-001 | SRS-FLT-001 | APP: APP-OPS; SCREEN: OPS-013/014; FLOW: OPS-008/010; STATE: Draft, Duplicate-blocked, Active, Retired, Archived-error | AC-FLT-001; TEST-FLT-001 | Yes |
| FR-FLT-002 | SRS-FLT-002 | APP: APP-OPS; customer output; SCREEN: OPS-015; CUS-002/003; FLOW: CUS-001, OPS-013/016; STATE: Draft, Preview, Active, Deactivated-history | AC-FLT-002; TEST-FLT-002 | Yes |
| FR-FLT-003 | SRS-FLT-003 | APP: APP-OPS; all availability; SCREEN: OPS-014/013/007; CUS-002; FLOW: OPS-002/003/006–009; STATE: Available, Assigned, Ready, On-rent, Inspection, Work, Retired, Invalid-transition | AC-FLT-003; TEST-FLT-003 | Yes |
| FR-FLT-004 | SRS-FLT-004 | APP: APP-OPS; SCREEN: OPS-016/014/007; FLOW: OPS-009; STATE: Scheduled, Transfer, Arrived, Delayed, Cancelled/rerouted | AC-FLT-004; TEST-FLT-004 | Yes |
| FR-FLT-005 | SRS-FLT-005 | APP: APP-OPS; SCREEN: OPS-017/014/007; FLOW: OPS-008; STATE: Scheduled, In-progress, Overdue, Completed-pass/fail, Reopened | AC-FLT-005; TEST-FLT-005 | Yes |
| FR-FLT-006 | SRS-FLT-006 | APP: APP-OPS; SCREEN: OPS-018/008/011/014; FLOW: OPS-002/003/006/008; STATE: Due, Draft, Submitted, Passed, Failed, Needs-review, Superseded | AC-FLT-006; TEST-FLT-006 | Yes |
| FR-FLT-007 | SRS-FLT-007 | APP: APP-OPS; availability output all; SCREEN: OPS-019/014/007; FLOW: OPS-002/008; STATE: Draft, Impact, Approval, Active-block, Released, Expired | AC-FLT-007; TEST-FLT-007 | Yes |
| FR-FLT-008 | SRS-FLT-008 | APP: APP-OPS; SCREEN: OPS-020/013; FLOW: OPS-010; STATE: Uploaded, Validated, Partial, Completed, Failed-rows, Cancelled | AC-FLT-008; TEST-FLT-008 | Yes |
| FR-FLT-009 | SRS-FLT-009 | APP: APP-OPS; SCREEN: OPS-014/017/003; FLOW: OPS-008; STATE: Missing, Expiring, Active, Expired-block, Renewed | AC-FLT-009; TEST-FLT-009 | Yes |
| FR-ADM-001 | SRS-ADM-001 | APP: APP-OPS; SCREEN: OPS-021/022; FLOW: OPS-001/011; STATE: No-match, Masked-results, Selected, Duplicate-review, Merged | AC-ADM-001; TEST-ADM-001 | Yes |
| FR-ADM-002 | SRS-ADM-002 | APP: APP-OPS; customer explanation; SCREEN: OPS-022/038; CUS-004/015; FLOW: OPS-011; STATE: Draft-review, Approval, Active-scope, Expired, Removed/corrected | AC-ADM-002; TEST-ADM-002 | Yes |
| FR-ADM-003 | SRS-ADM-003 | APP: APP-OPS; SCREEN: OPS-004/005/010; FLOW: OPS-001/003/006; STATE: Searching, Results, No-results, Permission-masked, Preserved-return | AC-ADM-003; TEST-ADM-003 | Yes |
| FR-ADM-004 | SRS-ADM-004 | APP: APP-OPS; SCREEN: OPS-002/003 and all workspaces; FLOW: All OPS flows; STATE: Open, Assigned, Waiting, Snoozed, Escalated, Resolved/Reopened | AC-ADM-004; TEST-ADM-004 | Yes |
| FR-ADM-005 | SRS-ADM-005 | APP: APP-OPS; customer output; SCREEN: OPS-025/026/029; FLOW: OPS-013; STATE: Draft, Conflict, Approval, Scheduled, Active, Paused, Historical | AC-ADM-005; TEST-ADM-005 | Yes |
| FR-ADM-006 | SRS-ADM-006 | APP: APP-OPS; customer output; SCREEN: OPS-027/034; CUS-005; FLOW: OPS-013/016; STATE: Draft, Preview, Active, Unavailable-impact, Deactivated-history | AC-ADM-006; TEST-ADM-006 | Yes |
| FR-ADM-007 | SRS-ADM-007 | APP: APP-OPS; all location use; SCREEN: OPS-028; CUS-001/023; FLOW: CUS-001/009, OPS-009/013; STATE: Draft, Open, Closure-impact, Active, Archived | AC-ADM-007; TEST-ADM-007 | Yes |
| FR-ADM-008 | SRS-ADM-008 | APP: APP-OPS; all selectors; SCREEN: OPS-030/031; FLOW: OPS-014; STATE: Configurable, Constrained, Fixed, External, Entity-owned, Inactive-history | AC-ADM-008; TEST-ADM-008 | Yes |
| FR-ADM-009 | SRS-ADM-009 | APP: APP-OPS; SCREEN: OPS-032/001/038; FLOW: OPS-015; STATE: Invited, Active, Approval, Suspended, Deactivated, Work-reassignment | AC-ADM-009; TEST-ADM-009 | Yes |
| FR-ADM-010 | SRS-ADM-010 | APP: APP-OPS; all governed flows; SCREEN: OPS-029/038; FLOW: OPS-013; STATE: Draft, Inherited/overridden, Conflict/gap, Active, Paused, Versioned | AC-ADM-010; TEST-ADM-010 | Yes |
| FR-ADM-011 | SRS-ADM-011 | APP: APP-OPS; messages all; SCREEN: OPS-033/039; FLOW: OPS-016/018; STATE: Draft, Tested, In-review, Published, Delivery-failed, Paused | AC-ADM-011; TEST-ADM-011 | Yes |
| FR-ADM-012 | SRS-ADM-012 | APP: APP-OPS; localized output all; SCREEN: OPS-034/015/027/028/033; FLOW: OPS-016; STATE: Missing, Draft, In-review, Published, Outdated, Fallback-exception | AC-ADM-012; TEST-ADM-012 | Yes |
| FR-RPT-001 | SRS-RPT-001 | APP: APP-OPS; SCREEN: OPS-002/003; FLOW: OPS-002/004–006/008/018; STATE: Fresh, Partial, Stale, Unknown-not-zero, Drilled | AC-RPT-001; TEST-RPT-001 | Yes |
| FR-RPT-002 | SRS-RPT-002 | APP: APP-OPS; SCREEN: OPS-035/036/023; FLOW: OPS-017; STATE: Defined-date/currency, Complete, Partial, Reconciled | AC-RPT-002; TEST-RPT-002 | Yes |
| FR-RPT-003 | SRS-RPT-003 | APP: APP-OPS; SCREEN: OPS-035/036/014/017; FLOW: OPS-017; STATE: Defined-denominator, Complete, Data-gap, Drilled | AC-RPT-003; TEST-RPT-003 | Yes |
| FR-RPT-004 | SRS-RPT-004 | APP: APP-OPS; SCREEN: OPS-035/036/024; FLOW: OPS-017; STATE: Defined-metric, Filtered, Complete, Incomplete-event | AC-RPT-004; TEST-RPT-004 | Yes |
| FR-RPT-005 | SRS-RPT-005 | APP: APP-OPS; SCREEN: OPS-036/037; FLOW: OPS-017; STATE: Queued, Running, Complete, Failed, Expired, Scheduled, Paused | AC-RPT-005; TEST-RPT-005 | Yes |
| FR-RPT-006 | SRS-RPT-006 | APP: APP-OPS; SCREEN: OPS-038/036; FLOW: OPS-011–018; STATE: Open-finding, Assigned, Resolved, False-positive, Reopened | AC-RPT-006; TEST-RPT-006 | Yes |
| FR-INT-001 | SRS-INT-001 | APP: All; APP-OPS management; SCREEN: CUS-006/019; OPS-023/024/039; FLOW: CUS-001, OPS-012/018; STATE: Sent, Delayed, Repeated-deduped, Contradictory, Reconciled | AC-INT-001; TEST-INT-001 | Yes |
| FR-INT-002 | SRS-INT-002 | APP: All; SCREEN: CUS-007/015; OPS-005/033/039; FLOW: CUS-005/007–009, OPS-016/018; STATE: Queued, Sent, Delivered, Failed, Suppressed, Retried | AC-INT-002; TEST-INT-002 | Yes |
| FR-INT-003 | SRS-INT-003 | APP: All where enabled; SCREEN: CUS-001/007/023; OPS-028/039; FLOW: CUS-001/009, OPS-018; STATE: Suggested-unconfirmed, Confirmed, Failed-fallback, Disabled | AC-INT-003; TEST-INT-003 | Yes |
| FR-INT-004 | SRS-INT-004 | APP: APP-OPS; customer status; SCREEN: OPS-003/024/039; CUS-007/015/019; FLOW: CUS-001/004–006, OPS-012/018; STATE: Open, Owned, Waiting, Reconciled, Compensated, Escalated | AC-INT-004; TEST-INT-004 | Yes |
| FR-INT-005 | SRS-INT-005 | APP: All where configured; SCREEN: CUS-008/022; OPS-012/039; FLOW: CUS-007/008, OPS-018; STATE: Enabled, Pending, Provider-failed, Manual-fallback, Paused | AC-INT-005; TEST-INT-005 | Yes |

### 19.1 Cross-cutting SRS source trace

| SRS family | Source or justification | Verification |
| --- | --- | --- |
| SRS-UI-* / SRS-FLOW-* | Accepted UI/UX plan and all user-facing FRs | TEST-SCREEN-*, TEST-FLOW-*, TEST-UI-STATE-* |
| SRS-ARC-* / SRS-CMP-* | IN-NF-01/03/07, IN-T-01–08, maintainability/scalability addition | TEST-ARCH-001–008, build and dependency checks |
| SRS-DAT-* | IN-F-16, FR-GBL-001/004–006/008 and every lifecycle | TEST-DAT-001–012 plus migration/invariant suites |
| SRS-LKP-* | FR-GBL-004, FR-ADM-008/010/012 and explicit no-static-data rule | TEST-LKP-* and Section 21 |
| SRS-I18N-* | FR-GBL-002/003, FR-ADM-012 | TEST-I18N-001–010 and locale matrix |
| SRS-API-* / IF-* | IN-F-13/14, IN-T-08, FR-INT-001–005 | TEST-API-* and contract/integration suites |
| SRS-SEC-* | FR-IAM-*, FR-ADM-009, IN-NF-05 | TEST-SEC-001–017 |
| SRS-NFR-* | IN-NF-01–07 and explicit clean/reusable/scalable addition | TEST-NFR-001–022 |
| SRS-OBS-* | IN-NF-04/06 and explicit logs/network/debugging addition | TEST-OBS-001–012 |

## 20. Design and Flow Traceability Matrix

### 20.1 Applications

| Design ID | Related FR IDs | SRS ID(s) | Acceptance/Test IDs | Covered |
| --- | --- | --- | --- | --- |
| APP-CWEB | All customer-facing FRs | SRS-CMP-WEB; SRS-UI-001–015 | TEST-APP-CWEB; TEST-FLOW-CUS-001–010 | Yes |
| APP-CMOB | All customer-facing FRs | SRS-CMP-MOBILE; SRS-UI-001–015 | TEST-APP-CMOB; TEST-FLOW-CUS-001–010 | Yes |
| APP-OPS | All staff/admin-facing FRs | SRS-CMP-OPS; SRS-UI-001–015 | TEST-APP-OPS; TEST-FLOW-OPS-001–019 | Yes |

### 20.2 Screens

| Design ID | Related FR IDs/design purpose | SRS ID(s) | Acceptance/Test IDs | Covered |
| --- | --- | --- | --- | --- |
| SCREEN-CUS-001 — Home and Trip Search | FR-CAT-001/002/004/005, FR-GBL-002/003/007; FLOW-CUS-001 | SRS-UI-001–015; SRS-CUS-001 | TEST-SCREEN-CUS-001 | Yes |
| SCREEN-CUS-002 — Search Results | FR-CAT-001–007, FR-PRC-002/007; FLOW-CUS-001 | SRS-UI-001–015; SRS-CUS-002 | TEST-SCREEN-CUS-002 | Yes |
| SCREEN-CUS-003 — Vehicle / Offer Details | FR-CAT-003, FR-PRC-002/005/006, FR-BKG-002; FLOW-CUS-001 | SRS-UI-001–015; SRS-CUS-003 | TEST-SCREEN-CUS-003 | Yes |
| SCREEN-CUS-004 — Checkout: Renter and Drivers | FR-IAM-007, FR-BKG-001–004, FR-BKG-009; FLOW-CUS-001/002 | SRS-UI-001–015; SRS-CUS-004 | TEST-SCREEN-CUS-004 | Yes |
| SCREEN-CUS-005 — Checkout: Extras and Protection | FR-PRC-005/006, FR-BKG-005; FLOW-CUS-001 | SRS-UI-001–015; SRS-CUS-005 | TEST-SCREEN-CUS-005 | Yes |
| SCREEN-CUS-006 — Checkout: Review and Payment | FR-PRC-002/003/007, FR-BKG-004–007, FR-PAY-001–004, FR-INT-001/004; FLOW-CUS-001 | SRS-UI-001–015; SRS-CUS-006 | TEST-SCREEN-CUS-006 | Yes |
| SCREEN-CUS-007 — Reservation Confirmation | FR-BKG-006/008, FR-PAY-005; FLOW-CUS-001 | SRS-UI-001–015; SRS-CUS-007 | TEST-SCREEN-CUS-007 | Yes |
| SCREEN-CUS-008 — Sign In | FR-IAM-003/005; FLOW-CUS-002 | SRS-UI-001–015; SRS-CUS-008 | TEST-SCREEN-CUS-008 | Yes |
| SCREEN-CUS-009 — Register and Verify Contact | FR-IAM-001/002; FLOW-CUS-002 | SRS-UI-001–015; SRS-CUS-009 | TEST-SCREEN-CUS-009 | Yes |
| SCREEN-CUS-010 — Account Recovery | FR-IAM-004, FR-INT-002; FLOW-CUS-002 | SRS-UI-001–015; SRS-CUS-010 | TEST-SCREEN-CUS-010 | Yes |
| SCREEN-CUS-011 — Account Overview | FR-IAM-006/008, FR-RSV-001, FR-RNT-005; FLOW-CUS-010 | SRS-UI-001–015; SRS-CUS-011 | TEST-SCREEN-CUS-011 | Yes |
| SCREEN-CUS-012 — Profile and Preferences | FR-IAM-002/006, FR-GBL-002/003; FLOW-CUS-010 | SRS-UI-001–015; SRS-CUS-012 | TEST-SCREEN-CUS-012 | Yes |
| SCREEN-CUS-013 — Saved Drivers and Documents | FR-IAM-007; FLOW-CUS-010 | SRS-UI-001–015; SRS-CUS-013 | TEST-SCREEN-CUS-013 | Yes |
| SCREEN-CUS-014 — Reservations List | FR-RSV-001/007; FLOW-CUS-004/005 | SRS-UI-001–015; SRS-CUS-014 | TEST-SCREEN-CUS-014 | Yes |
| SCREEN-CUS-015 — Reservation Detail | FR-RSV-001–007, FR-BKG-008, FR-PAY-005/006; FLOW-CUS-003–005 | SRS-UI-001–015; SRS-CUS-015 | TEST-SCREEN-CUS-015 | Yes |
| SCREEN-CUS-016 — Modify Reservation | FR-RSV-002, FR-CAT-005–007, FR-PRC-002, FR-PAY-007; FLOW-CUS-004 | SRS-UI-001–015; SRS-CUS-016 | TEST-SCREEN-CUS-016 | Yes |
| SCREEN-CUS-017 — Cancellation Review | FR-RSV-003, FR-PAY-006; FLOW-CUS-005 | SRS-UI-001–015; SRS-CUS-017 | TEST-SCREEN-CUS-017 | Yes |
| SCREEN-CUS-018 — Guest Reservation Lookup | FR-BKG-009, FR-IAM-002; FLOW-CUS-003 | SRS-UI-001–015; SRS-CUS-018 | TEST-SCREEN-CUS-018 | Yes |
| SCREEN-CUS-019 — Payments, Receipts, and Refunds | FR-PAY-003/005–008; FLOW-CUS-005/OPS-012 | SRS-UI-001–015; SRS-CUS-019 | TEST-SCREEN-CUS-019 | Yes |
| SCREEN-CUS-020 — Active Rental | FR-RNT-005–009, FR-PAY-005; FLOW-CUS-006–009 | SRS-UI-001–015; SRS-CUS-020 | TEST-SCREEN-CUS-020 | Yes |
| SCREEN-CUS-021 — Extension Review | FR-RNT-006/007, FR-CAT-005, FR-PAY-007; FLOW-CUS-006/OPS-005 | SRS-UI-001–015; SRS-CUS-021 | TEST-SCREEN-CUS-021 | Yes |
| SCREEN-CUS-022 — Roadside Help and Incident Report | FR-RNT-008–010, FR-INT-005; FLOW-CUS-007/008 | SRS-UI-001–015; SRS-CUS-022 | TEST-SCREEN-CUS-022 | Yes |
| SCREEN-CUS-023 — Return Instructions and After-Hours Check-in | FR-RNT-007/011/014; FLOW-CUS-009 | SRS-UI-001–015; SRS-CUS-023 | TEST-SCREEN-CUS-023 | Yes |
| SCREEN-CUS-024 — Account Data Requests and Closure | FR-IAM-008; FLOW-CUS-010 | SRS-UI-001–015; SRS-CUS-024 | TEST-SCREEN-CUS-024 | Yes |
| SCREEN-OPS-001 — Staff Sign In | FR-IAM-003–005, FR-ADM-009; FLOW-OPS-015 | SRS-UI-001–015; SRS-OPS-001 | TEST-SCREEN-OPS-001 | Yes |
| SCREEN-OPS-002 — Operational Dashboard | FR-RPT-001, FR-ADM-004, FR-GBL-005; FLOW-OPS-002/004/005/006/018 | SRS-UI-001–015; SRS-OPS-002 | TEST-SCREEN-OPS-002 | Yes |
| SCREEN-OPS-003 — Operations Queues | FR-ADM-004, FR-INT-004, FR-RNT-001 | SRS-UI-001–015; SRS-OPS-003 | TEST-SCREEN-OPS-003 | Yes |
| SCREEN-OPS-004 — Unified Reservation and Rental Search | FR-ADM-003, FR-RSV-001, FR-RNT-005; FLOW-OPS-001/003/006 | SRS-UI-001–015; SRS-OPS-004 | TEST-SCREEN-OPS-004 | Yes |
| SCREEN-OPS-005 — Reservation Workspace | FR-BKG-008/010, FR-RSV-001–007, FR-PAY-005–007; FLOW-CUS-004/005, FLOW-OPS-002/004 | SRS-UI-001–015; SRS-OPS-005 | TEST-SCREEN-OPS-005 | Yes |
| SCREEN-OPS-006 — Staff-Assisted Booking Workspace | FR-BKG-001–010, FR-PAY-001–004, FR-ADM-001; FLOW-OPS-001 | SRS-UI-001–015; SRS-OPS-006 | TEST-SCREEN-OPS-006 | Yes |
| SCREEN-OPS-007 — Pickup Readiness Board | FR-RNT-001/002, FR-RSV-004, FR-FLT-006; FLOW-OPS-002/004 | SRS-UI-001–015; SRS-OPS-007 | TEST-SCREEN-OPS-007 | Yes |
| SCREEN-OPS-008 — Pickup and Handover Workspace | FR-RNT-003/004, FR-PAY-003, FR-FLT-006; FLOW-OPS-003 | SRS-UI-001–015; SRS-OPS-008 | TEST-SCREEN-OPS-008 | Yes |
| SCREEN-OPS-009 — Active Rentals Board | FR-RNT-005–007, FR-ADM-003/004; FLOW-OPS-005/006/007 | SRS-UI-001–015; SRS-OPS-009 | TEST-SCREEN-OPS-009 | Yes |
| SCREEN-OPS-010 — Rental Workspace | FR-RNT-005–010/015/016, FR-PAY-005/007; FLOW-OPS-005/007/019 | SRS-UI-001–015; SRS-OPS-010 | TEST-SCREEN-OPS-010 | Yes |
| SCREEN-OPS-011 — Return and Closeout Workspace | FR-RNT-011–015, FR-PAY-003/007; FLOW-OPS-006 | SRS-UI-001–015; SRS-OPS-011 | TEST-SCREEN-OPS-011 | Yes |
| SCREEN-OPS-012 — Incident and Service Case Workspace | FR-RNT-008–010/016, FR-ADM-004, FR-INT-005; FLOW-CUS-007/008, FLOW-OPS-007/019 | SRS-UI-001–015; SRS-OPS-012 | TEST-SCREEN-OPS-012 | Yes |
| SCREEN-OPS-013 — Fleet Inventory | FR-FLT-001/003/008/009; FLOW-OPS-008/010 | SRS-UI-001–015; SRS-OPS-013 | TEST-SCREEN-OPS-013 | Yes |
| SCREEN-OPS-014 — Vehicle Unit Detail | FR-FLT-001/003–007/009, FR-RNT-010; FLOW-OPS-008/009 | SRS-UI-001–015; SRS-OPS-014 | TEST-SCREEN-OPS-014 | Yes |
| SCREEN-OPS-015 — Vehicle Categories and Public Catalogue | FR-FLT-002, FR-CAT-001/003, FR-ADM-012; FLOW-OPS-013/016 | SRS-UI-001–015; SRS-OPS-015 | TEST-SCREEN-OPS-015 | Yes |
| SCREEN-OPS-016 — Vehicle Transfers | FR-FLT-004, FR-CAT-005; FLOW-OPS-009 | SRS-UI-001–015; SRS-OPS-016 | TEST-SCREEN-OPS-016 | Yes |
| SCREEN-OPS-017 — Maintenance Board and Work Detail | FR-FLT-005/009, FR-RNT-008; FLOW-OPS-008 | SRS-UI-001–015; SRS-OPS-017 | TEST-SCREEN-OPS-017 | Yes |
| SCREEN-OPS-018 — Inspection Workspace | FR-FLT-006, FR-RNT-004/011/012; FLOW-OPS-003/006/008 | SRS-UI-001–015; SRS-OPS-018 | TEST-SCREEN-OPS-018 | Yes |
| SCREEN-OPS-019 — Availability Blocks | FR-FLT-007, FR-CAT-005; FLOW-OPS-008 | SRS-UI-001–015; SRS-OPS-019 | TEST-SCREEN-OPS-019 | Yes |
| SCREEN-OPS-020 — Fleet Import and Export Jobs | FR-FLT-008, FR-GBL-008; FLOW-OPS-010 | SRS-UI-001–015; SRS-OPS-020 | TEST-SCREEN-OPS-020 | Yes |
| SCREEN-OPS-021 — Customers | FR-ADM-001, FR-IAM-008; FLOW-OPS-011 | SRS-UI-001–015; SRS-OPS-021 | TEST-SCREEN-OPS-021 | Yes |
| SCREEN-OPS-022 — Customer Workspace | FR-ADM-001/002, FR-IAM-006–008; FLOW-OPS-011 | SRS-UI-001–015; SRS-OPS-022 | TEST-SCREEN-OPS-022 | Yes |
| SCREEN-OPS-023 — Payments and Refunds | FR-PAY-001–008; FLOW-OPS-012/019 | SRS-UI-001–015; SRS-OPS-023 | TEST-SCREEN-OPS-023 | Yes |
| SCREEN-OPS-024 — Payment Reconciliation | FR-PAY-004/009, FR-INT-001/004; FLOW-OPS-012/018 | SRS-UI-001–015; SRS-OPS-024 | TEST-SCREEN-OPS-024 | Yes |
| SCREEN-OPS-025 — Pricing and Rate Plans | FR-PRC-001/002, FR-ADM-005; FLOW-OPS-013 | SRS-UI-001–015; SRS-OPS-025 | TEST-SCREEN-OPS-025 | Yes |
| SCREEN-OPS-026 — Charges, Deposits, Discounts, and Promotions | FR-PRC-003/004/007, FR-ADM-005; FLOW-OPS-013 | SRS-UI-001–015; SRS-OPS-026 | TEST-SCREEN-OPS-026 | Yes |
| SCREEN-OPS-027 — Extras and Protection Products | FR-PRC-005/006, FR-ADM-006; FLOW-OPS-013/016 | SRS-UI-001–015; SRS-OPS-027 | TEST-SCREEN-OPS-027 | Yes |
| SCREEN-OPS-028 — Rental Locations and Hours | FR-CAT-004, FR-ADM-007, FR-FLT-004; FLOW-OPS-013 | SRS-UI-001–015; SRS-OPS-028 | TEST-SCREEN-OPS-028 | Yes |
| SCREEN-OPS-029 — Business Policies | FR-ADM-010, FR-RSV-006, FR-BKG-002; FLOW-OPS-013 | SRS-UI-001–015; SRS-OPS-029 | TEST-SCREEN-OPS-029 | Yes |
| SCREEN-OPS-030 — Reference Data Catalogue | FR-GBL-004, FR-ADM-008; FLOW-OPS-014 | SRS-UI-001–015; SRS-OPS-030 | TEST-SCREEN-OPS-030 | Yes |
| SCREEN-OPS-031 — Reference Type and Values | FR-GBL-004, FR-ADM-008; FLOW-OPS-014 | SRS-UI-001–015; SRS-OPS-031 | TEST-SCREEN-OPS-031 | Yes |
| SCREEN-OPS-032 — Staff and Roles | FR-ADM-009, FR-IAM-003/005; FLOW-OPS-015 | SRS-UI-001–015; SRS-OPS-032 | TEST-SCREEN-OPS-032 | Yes |
| SCREEN-OPS-033 — Notification Templates and Rules | FR-ADM-011, FR-INT-002; FLOW-OPS-016 | SRS-UI-001–015; SRS-OPS-033 | TEST-SCREEN-OPS-033 | Yes |
| SCREEN-OPS-034 — Translation Catalogue | FR-GBL-002/003, FR-ADM-012; FLOW-OPS-016 | SRS-UI-001–015; SRS-OPS-034 | TEST-SCREEN-OPS-034 | Yes |
| SCREEN-OPS-035 — Reports Hub | FR-RPT-001–006; FLOW-OPS-017 | SRS-UI-001–015; SRS-OPS-035 | TEST-SCREEN-OPS-035 | Yes |
| SCREEN-OPS-036 — Report Viewer | FR-RPT-001–006; FLOW-OPS-017 | SRS-UI-001–015; SRS-OPS-036 | TEST-SCREEN-OPS-036 | Yes |
| SCREEN-OPS-037 — Exports and Schedules | FR-RPT-005, FR-ADM-009; FLOW-OPS-017 | SRS-UI-001–015; SRS-OPS-037 | TEST-SCREEN-OPS-037 | Yes |
| SCREEN-OPS-038 — Audit and Data Quality | FR-GBL-008, FR-RPT-006; FLOW-OPS-011/012/013/015/018 | SRS-UI-001–015; SRS-OPS-038 | TEST-SCREEN-OPS-038 | Yes |
| SCREEN-OPS-039 — Integration Health and Recovery | FR-INT-001–005, FR-PAY-004/009; FLOW-OPS-018 | SRS-UI-001–015; SRS-OPS-039 | TEST-SCREEN-OPS-039 | Yes |

### 20.3 Flows

| Design/FLOW ID | Related FR IDs | SRS ID(s) | Acceptance/Test IDs | Covered |
| --- | --- | --- | --- | --- |
| FLOW-CUS-001 — Search, Choose, and Book | FR-CAT-001–007, FR-PRC-002–007, FR-BKG-001–008, FR-PAY-001–004. | SRS-FLOW-001–006; SRS-FLOW-CUS-001 | TEST-FLOW-CUS-001 | Yes |
| FLOW-CUS-002 — Register or Sign In Without Losing Task | FR-IAM-001–005, FR-BKG-001. | SRS-FLOW-001–006; SRS-FLOW-CUS-002 | TEST-FLOW-CUS-002 | Yes |
| FLOW-CUS-003 — Verified Guest Reservation Lookup and Link | FR-BKG-009, FR-IAM-002. | SRS-FLOW-001–006; SRS-FLOW-CUS-003 | TEST-FLOW-CUS-003 | Yes |
| FLOW-CUS-004 — Modify Reservation | FR-RSV-001/002, FR-CAT-005–007, FR-PRC-002, FR-PAY-007. | SRS-FLOW-001–006; SRS-FLOW-CUS-004 | TEST-FLOW-CUS-004 | Yes |
| FLOW-CUS-005 — Cancel Reservation and Track Refund | FR-RSV-003, FR-PAY-006, FR-INT-002/004. | SRS-FLOW-001–006; SRS-FLOW-CUS-005 | TEST-FLOW-CUS-005 | Yes |
| FLOW-CUS-006 — View Active Rental and Request Extension | FR-RNT-005–007, FR-CAT-005, FR-PAY-007. | SRS-FLOW-001–006; SRS-FLOW-CUS-006 | TEST-FLOW-CUS-006 | Yes |
| FLOW-CUS-007 — Request Roadside Help | FR-RNT-008, FR-INT-005. | SRS-FLOW-001–006; SRS-FLOW-CUS-007 | TEST-FLOW-CUS-007 | Yes |
| FLOW-CUS-008 — Report Incident | FR-RNT-009/010, FR-FLT-003/006. | SRS-FLOW-001–006; SRS-FLOW-CUS-008 | TEST-FLOW-CUS-008 | Yes |
| FLOW-CUS-009 — Return Instructions and After-Hours Check-in | FR-RNT-007/011/014. | SRS-FLOW-001–006; SRS-FLOW-CUS-009 | TEST-FLOW-CUS-009 | Yes |
| FLOW-CUS-010 — Manage Profile, Drivers, and Account Request | FR-IAM-006–008. | SRS-FLOW-001–006; SRS-FLOW-CUS-010 | TEST-FLOW-CUS-010 | Yes |
| FLOW-OPS-001 — Staff-Assisted Booking | FR-BKG-010 plus FR-BKG/PAY/CAT/PRC booking requirements. | SRS-FLOW-001–006; SRS-FLOW-OPS-001 | TEST-FLOW-OPS-001 | Yes |
| FLOW-OPS-002 — Prepare Pickup and Assign Vehicle | FR-RNT-001/002, FR-FLT-003/006. | SRS-FLOW-001–006; SRS-FLOW-OPS-002 | TEST-FLOW-OPS-002 | Yes |
| FLOW-OPS-003 — Verify Pickup and Open Rental | FR-RNT-003–005, FR-PAY-003. | SRS-FLOW-001–006; SRS-FLOW-OPS-003 | TEST-FLOW-OPS-003 | Yes |
| FLOW-OPS-004 — Handle Late Pickup and No-show | FR-RSV-004, FR-PRC-003. | SRS-FLOW-001–006; SRS-FLOW-OPS-004 | TEST-FLOW-OPS-004 | Yes |
| FLOW-OPS-005 — Approve or Reject Extension | FR-RNT-006/007, FR-CAT-005, FR-PAY-007. | SRS-FLOW-001–006; SRS-FLOW-OPS-005 | TEST-FLOW-OPS-005 | Yes |
| FLOW-OPS-006 — Receive, Inspect, Charge, and Close Return | FR-RNT-011–016, FR-PAY-003/007. | SRS-FLOW-001–006; SRS-FLOW-OPS-006 | TEST-FLOW-OPS-006 | Yes |
| FLOW-OPS-007 — Replace Vehicle After Incident | FR-RNT-009/010, FR-FLT-003. | SRS-FLOW-001–006; SRS-FLOW-OPS-007 | TEST-FLOW-OPS-007 | Yes |
| FLOW-OPS-008 — Block, Maintain, and Return Vehicle to Service | FR-FLT-003/005–007/009. | SRS-FLOW-001–006; SRS-FLOW-OPS-008 | TEST-FLOW-OPS-008 | Yes |
| FLOW-OPS-009 — Transfer Vehicle | FR-FLT-004, FR-CAT-005. | SRS-FLOW-001–006; SRS-FLOW-OPS-009 | TEST-FLOW-OPS-009 | Yes |
| FLOW-OPS-010 — Import or Bulk Update Fleet | FR-FLT-008, FR-GBL-008. | SRS-FLOW-001–006; SRS-FLOW-OPS-010 | TEST-FLOW-OPS-010 | Yes |
| FLOW-OPS-011 — Review Customer Restriction or Duplicate | FR-ADM-001/002, FR-IAM-008. | SRS-FLOW-001–006; SRS-FLOW-OPS-011 | TEST-FLOW-OPS-011 | Yes |
| FLOW-OPS-012 — Refund, Dispute, or Reconcile Payment | FR-PAY-006–009, FR-INT-001/004. | SRS-FLOW-001–006; SRS-FLOW-OPS-012 | TEST-FLOW-OPS-012 | Yes |
| FLOW-OPS-013 — Publish Pricing, Policy, Location, or Product Version | FR-PRC-001/003–006, FR-ADM-005–007/010. | SRS-FLOW-001–006; SRS-FLOW-OPS-013 | TEST-FLOW-OPS-013 | Yes |
| FLOW-OPS-014 — Manage Lookup Values | FR-GBL-004, FR-ADM-008. | SRS-FLOW-001–006; SRS-FLOW-OPS-014 | TEST-FLOW-OPS-014 | Yes |
| FLOW-OPS-015 — Manage Staff Access | FR-ADM-009, FR-IAM-003/005. | SRS-FLOW-001–006; SRS-FLOW-OPS-015 | TEST-FLOW-OPS-015 | Yes |
| FLOW-OPS-016 — Author and Publish Translation or Template | FR-ADM-011/012, FR-INT-002. | SRS-FLOW-001–006; SRS-FLOW-OPS-016 | TEST-FLOW-OPS-016 | Yes |
| FLOW-OPS-017 — Build, Export, or Schedule Report | FR-RPT-001–006. | SRS-FLOW-001–006; SRS-FLOW-OPS-017 | TEST-FLOW-OPS-017 | Yes |
| FLOW-OPS-018 — Resolve Integration or Partial Failure | FR-INT-001–005, FR-PAY-004/009. | SRS-FLOW-001–006; SRS-FLOW-OPS-018 | TEST-FLOW-OPS-018 | Yes |
| FLOW-OPS-019 — Apply Post-rental Charge or Lost-property Case | FR-RNT-016, FR-PAY-007/008. | SRS-FLOW-001–006; SRS-FLOW-OPS-019 | TEST-FLOW-OPS-019 | Yes |

### 20.4 States

| Design ID | Related FR IDs | SRS ID(s) | Acceptance/Test IDs | Covered |
| --- | --- | --- | --- | --- |
| STATE-LOADING | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-001 | Yes |
| STATE-EMPTY | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-002 | Yes |
| STATE-NO-RESULTS | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-003 | Yes |
| STATE-VALIDATION | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-004 | Yes |
| STATE-FAILURE | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-005 | Yes |
| STATE-SUCCESS | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-006 | Yes |
| STATE-UNAVAILABLE | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-007 | Yes |
| STATE-PERMISSION-DENIED | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-008 | Yes |
| STATE-STALE | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-009 | Yes |
| STATE-OFFLINE | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-010 | Yes |
| STATE-PENDING | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-011 | Yes |
| STATE-EXPIRED | All applicable FRs/screens | SRS-UI-003/004/010 | TEST-UI-STATE-012 | Yes |

### 20.5 Components

| Design IDs | Responsibility | SRS IDs | Tests | Covered |
| --- | --- | --- | --- | --- |
| COMP-SH-001–020 | Shared navigation, state, forms, data display, jobs, evidence, approval, connectivity | SRS-UI-001–015 | TEST-COMP-SH-001–020 | Yes |
| COMP-CUS-001–007 | Customer trip, offer, checkout, driver/product, summary interactions | SRS-CMP-WEB; SRS-CMP-MOBILE; SRS-UI-001–015 | TEST-COMP-CUS-001–007 | Yes |
| COMP-OPS-001–007 | Staff scope, record, queue, checklist, approval, configuration, report interactions | SRS-CMP-OPS; SRS-UI-001–015 | TEST-COMP-OPS-001–007 | Yes |

### 20.6 UI Element Behavior Index

Every range below is normative. Its owning component/screen test must activate every interactive element and assert visibility, enabled/disabled reason, action, feedback, state change, recovery, focus, permission, and responsive behavior.

#### 20.4.1 Shared and reusable element ranges

| Element range | Owner | Purpose |
| --- | --- | --- |
| EL-SH-001–010 | Global shell/shared actions | Language, user menu, help, back, retry, dismiss, refresh, activity, document, support |
| EL-COMP-002-01–02 | COMP-SH-002 | Apply/cancel language |
| EL-COMP-003-01 | COMP-SH-003 | Explain status |
| EL-COMP-005-01 | COMP-SH-005 | Focus first form error |
| EL-COMP-006-01–03 | COMP-SH-006 | Dynamic combobox input/clear/retry |
| EL-COMP-007-01–05 | COMP-SH-007 | Trip location/date/time controls |
| EL-COMP-008-01–03 | COMP-SH-008 | Price/deposit/policy details |
| EL-COMP-009-01–03 | COMP-SH-009 | Entity search/remove/open |
| EL-COMP-010-01–05 | COMP-SH-010 | Search/filter/sort/clear/save view |
| EL-COMP-011-01–03 | COMP-SH-011 | Row/selection/actions |
| EL-COMP-012-01 | COMP-SH-012 | Safe step navigation |
| EL-COMP-013-01–02 | COMP-SH-013 | Confirm/cancel consequence dialog |
| EL-COMP-014-01–03 | COMP-SH-014 | Keep editing/discard/save |
| EL-COMP-015-01–02 | COMP-SH-015 | Timeline filter/event detail |
| EL-COMP-016-01–03 | COMP-SH-016 | Choose/remove/retry evidence |
| EL-COMP-017-01–04 | COMP-SH-017 | Job view/cancel/download/retry |
| EL-COMP-018-01–04 | COMP-SH-018 | Request/detail/provide/cancel/contact dependency |
| EL-COMP-019-01–03 | COMP-SH-019 | Request/view/cancel approval |
| EL-CUS-C01-01 | COMP-CUS-001 | Search cars |
| EL-CUS-C02-01–03 | COMP-CUS-002 | Offer details/choose/price |
| EL-CUS-C04-01–02 | COMP-CUS-004 | Driver explanation/save-for-future |
| EL-CUS-C05-01–02 | COMP-CUS-005 | Product choice/details |
| EL-CUS-C06-01–03 | COMP-CUS-006 | Payment method/provider/change |
| EL-CUS-C07-01–03 | COMP-CUS-007 | Summary expand/document/activity |
| EL-OPS-C01-01–03 | COMP-OPS-001 | Scope/global search/inbox |
| EL-OPS-C02-01–04 | COMP-OPS-002 | Workspace back/status/actions/activity |
| EL-OPS-C03-01–05 | COMP-OPS-003 | Queue open/assign/owner/snooze/escalate |
| EL-OPS-C04-01–02 | COMP-OPS-004 | Checklist open/resolve |
| EL-OPS-C05-01–04 | COMP-OPS-005 | Approve/reject/change/close |
| EL-OPS-C06-01–04 | COMP-OPS-006 | Save/preview/publish/pause version |
| EL-OPS-C07-01–06 | COMP-OPS-007 | Report definition/run/export/schedule |

#### 20.4.2 Customer screen element ranges

| Screen | Element range | Main task |
| --- | --- | --- |
| SCREEN-CUS-001 | EL-CUS-001-01–04 | Search/current rental/guest lookup |
| SCREEN-CUS-002 | EL-CUS-002-01–06 | Results/filter/sort/choose/alternatives |
| SCREEN-CUS-003 | EL-CUS-003-01–05 | Offer detail and choose |
| SCREEN-CUS-004 | EL-CUS-004-01–06 | Renter/drivers and eligibility |
| SCREEN-CUS-005 | EL-CUS-005-01–05 | Extras/protection |
| SCREEN-CUS-006 | EL-CUS-006-01–06 | Review/payment/confirmation |
| SCREEN-CUS-007 | EL-CUS-007-01–05 | Booking result and next actions |
| SCREEN-CUS-008 | EL-CUS-008-01–06 | Sign in/provider/recovery/register |
| SCREEN-CUS-009 | EL-CUS-009-01–06 | Register and verify |
| SCREEN-CUS-010 | EL-CUS-010-01–05 | Recovery |
| SCREEN-CUS-011 | EL-CUS-011-01–04 | Account overview navigation |
| SCREEN-CUS-012 | EL-CUS-012-01–05 | Profile/preferences |
| SCREEN-CUS-013 | EL-CUS-013-01–05 | Drivers/documents |
| SCREEN-CUS-014 | EL-CUS-014-01–04 | Reservation list |
| SCREEN-CUS-015 | EL-CUS-015-01–06 | Reservation actions |
| SCREEN-CUS-016 | EL-CUS-016-01–05 | Modification proposal/commit |
| SCREEN-CUS-017 | EL-CUS-017-01–04 | Cancellation/refund review |
| SCREEN-CUS-018 | EL-CUS-018-01–05 | Guest verification |
| SCREEN-CUS-019 | EL-CUS-019-01–04 | Payments/refunds/dispute route |
| SCREEN-CUS-020 | EL-CUS-020-01–05 | Active rental actions |
| SCREEN-CUS-021 | EL-CUS-021-01–04 | Extension |
| SCREEN-CUS-022 | EL-CUS-022-01–06 | Roadside/incident |
| SCREEN-CUS-023 | EL-CUS-023-01–05 | Return/after-hours |
| SCREEN-CUS-024 | EL-CUS-024-01–05 | Data requests/closure |

#### 20.4.3 Operations screen element ranges

| Screens | Element range | Main task |
| --- | --- | --- |
| SCREEN-OPS-001–006 | EL-OPS-001-01–04; 002-01–04; 003-01–04; 004-01–05; 005-01–06; 006-01–06 | Access, dashboard, queues, search, reservation, assisted booking |
| SCREEN-OPS-007–012 | EL-OPS-007-01–05; 008-01–06; 009-01–05; 010-01–06; 011-01–06; 012-01–06 | Readiness, pickup, active rental, return, cases |
| SCREEN-OPS-013–020 | EL-OPS-013-01–05; 014-01–06; 015-01–05; 016-01–04; 017-01–06; 018-01–06; 019-01–05; 020-01–06 | Fleet, categories, transfers, maintenance, inspections, blocks, bulk jobs |
| SCREEN-OPS-021–024 | EL-OPS-021-01–04; 022-01–06; 023-01–06; 024-01–05 | Customers, payments, reconciliation |
| SCREEN-OPS-025–031 | EL-OPS-025-01–05; 026-01–05; 027-01–05; 028-01–05; 029-01–05; 030-01–04; 031-01–06 | Commercial/location/policy/reference configuration |
| SCREEN-OPS-032–039 | EL-OPS-032-01–06; 033-01–06; 034-01–05; 035-01–04; 036-01–05; 037-01–05; 038-01–05; 039-01–06 | Access, messages, translations, reports, audit, integrations |

No listed control is decorative. Static images, headings, dividers, status icons, and explanatory text are not assigned element IDs because they have no interaction. Any implementation that makes them interactive must add a contract and traceability before acceptance.

### 20.7 Explicit component coverage

| Component ID | Component | Used by | SRS IDs | Test ID | Covered |
| --- | --- | --- | --- | --- | --- |
| COMP-SH-001 | App shell and navigation | All screens | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| COMP-SH-002 | Language and locale selector | All | SRS-UI-001–015 | TEST-COMP-SH-002 | Yes |
| COMP-SH-003 | Status badge with explanation | Records/lists | SRS-UI-001–015 | TEST-COMP-SH-003 | Yes |
| COMP-SH-004 | Notification/banner | All | SRS-UI-001–015 | TEST-COMP-SH-004 | Yes |
| COMP-SH-005 | Error summary and inline errors | Forms | SRS-UI-001–015 | TEST-COMP-SH-005 | Yes |
| COMP-SH-006 | Dynamic searchable combobox | Locations/large lookups/entities | SRS-UI-001–015 | TEST-COMP-SH-006 | Yes |
| COMP-SH-007 | Date/time and location trip control | Search/modify/extension | SRS-UI-001–015 | TEST-COMP-SH-007 | Yes |
| COMP-SH-008 | Itemized price summary | Quote/booking/rental/payments | SRS-UI-001–015 | TEST-COMP-SH-008 | Yes |
| COMP-SH-009 | Entity picker | Staff/customer/vehicle/location selection | SRS-UI-001–015 | TEST-COMP-SH-009 | Yes |
| COMP-SH-010 | Filter/sort bar | Lists/queues/reports | SRS-UI-001–015 | TEST-COMP-SH-010 | Yes |
| COMP-SH-011 | Data table / adaptive list | Staff records | SRS-UI-001–015 | TEST-COMP-SH-011 | Yes |
| COMP-SH-012 | Step/task progress | Checkout/pickup/return/config publish | SRS-UI-001–015 | TEST-COMP-SH-012 | Yes |
| COMP-SH-013 | Consequence confirmation dialog | Small, single-decision actions | SRS-UI-001–015 | TEST-COMP-SH-013 | Yes |
| COMP-SH-014 | Unsaved-change guard | Editable forms | SRS-UI-001–015 | TEST-COMP-SH-014 | Yes |
| COMP-SH-015 | Activity timeline | Reservation/rental/vehicle/customer/payment | SRS-UI-001–015 | TEST-COMP-SH-015 | Yes |
| COMP-SH-016 | Evidence/document uploader | Driver/inspection/incident/config | SRS-UI-001–015 | TEST-COMP-SH-016 | Yes |
| COMP-SH-017 | Long-running job status | Imports/exports/reports | SRS-UI-001–015 | TEST-COMP-SH-017 | Yes |
| COMP-SH-018 | Cross-role dependency card | Pending/exception work | SRS-UI-001–015 | TEST-COMP-SH-018 | Yes |
| COMP-SH-019 | Permission/approval gate | Sensitive staff actions | SRS-UI-001–015 | TEST-COMP-SH-019 | Yes |
| COMP-SH-020 | Connectivity/stale-state bar | All live records | SRS-UI-001–015 | TEST-COMP-SH-020 | Yes |
| COMP-CUS-001 | Trip search panel | SCREEN-CUS-001/002/016 | SRS-UI-001–015 | TEST-COMP-CUS-001 | Yes |
| COMP-CUS-002 | Vehicle offer card | SCREEN-CUS-002 | SRS-UI-001–015 | TEST-COMP-CUS-002 | Yes |
| COMP-CUS-003 | Checkout price rail | SCREEN-CUS-004–006 | SRS-UI-001–015 | TEST-COMP-CUS-003 | Yes |
| COMP-CUS-004 | Driver form | Checkout/profile/pickup support | SRS-UI-001–015 | TEST-COMP-CUS-004 | Yes |
| COMP-CUS-005 | Extra/protection choice card | SCREEN-CUS-005 | SRS-UI-001–015 | TEST-COMP-CUS-005 | Yes |
| COMP-CUS-006 | Payment panel | SCREEN-CUS-006/019 | SRS-UI-001–015 | TEST-COMP-CUS-006 | Yes |
| COMP-CUS-007 | Reservation/rental summary | Detail and confirmation | SRS-UI-001–015 | TEST-COMP-CUS-007 | Yes |
| COMP-OPS-001 | Staff scope bar | All APP-OPS screens | SRS-UI-001–015 | TEST-COMP-OPS-001 | Yes |
| COMP-OPS-002 | Record workspace header | Staff detail screens | SRS-UI-001–015 | TEST-COMP-OPS-002 | Yes |
| COMP-OPS-003 | Queue item / work card | Dashboard/queues | SRS-UI-001–015 | TEST-COMP-OPS-003 | Yes |
| COMP-OPS-004 | Workflow checklist | Pickup/return/incident/config | SRS-UI-001–015 | TEST-COMP-OPS-004 | Yes |
| COMP-OPS-005 | Approval drawer | Overrides/refunds/config/access | SRS-UI-001–015 | TEST-COMP-OPS-005 | Yes |
| COMP-OPS-006 | Configuration version header | Pricing/policy/product/template/translation | SRS-UI-001–015 | TEST-COMP-OPS-006 | Yes |
| COMP-OPS-007 | Report builder | Report screens | SRS-UI-001–015 | TEST-COMP-OPS-007 | Yes |

### 20.8 Explicit interactive-element coverage

The rows below enumerate every element that has its own table row in the accepted design. Component-embedded sub-element ranges remain covered by Sections 20.5–20.7 and the behavior index.

| Element ID | Owning object | Label/control | SRS IDs | Test ID | Covered |
| --- | --- | --- | --- | --- | --- |
| EL-SH-001 | COMP-SH-001 / shared navigation | Language | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| EL-SH-002 | COMP-SH-001 / shared navigation | Account / user menu | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| EL-SH-003 | COMP-SH-001 / shared navigation | Help | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| EL-SH-004 | COMP-SH-001 / shared navigation | Back | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| EL-SH-005 | COMP-SH-001 / shared navigation | Retry | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| EL-SH-006 | COMP-SH-001 / shared navigation | Dismiss notification | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| EL-SH-007 | COMP-SH-001 / shared navigation | Refresh latest | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| EL-SH-008 | COMP-SH-001 / shared navigation | View activity | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| EL-SH-009 | COMP-SH-001 / shared navigation | Download document | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| EL-SH-010 | COMP-SH-001 / shared navigation | Contact support | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| EL-CUS-001-01 | Shared UI contract | Search cars | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-001-02 | Shared UI contract | Use current location | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-001-03 | Shared UI contract | View current rental | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-001-04 | Shared UI contract | Find my reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-002-01 | Shared UI contract | Edit trip | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-002-02 | Shared UI contract | Filters | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-002-03 | Shared UI contract | Sort by | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-002-04 | Shared UI contract | View details | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-002-05 | Shared UI contract | Choose | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-002-06 | Shared UI contract | Choose this alternative | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-003-01 | Shared UI contract | Image previous/next | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-003-02 | Shared UI contract | View all features | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-003-03 | Shared UI contract | Explain “or similar” / exact vehicle | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-003-04 | Shared UI contract | View price details | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-003-05 | Shared UI contract | Choose this car/category | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-004-01 | Shared UI contract | Sign in / Create account | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-004-02 | Shared UI contract | Primary renter is account holder | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-004-03 | Shared UI contract | Who will pay? | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-004-04 | Shared UI contract | Add another driver | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-004-05 | Shared UI contract | Remove driver | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-004-06 | Shared UI contract | Continue to extras | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-005-01 | Shared UI contract | Add extra | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-005-02 | Shared UI contract | Quantity decrease/increase | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-005-03 | Shared UI contract | View details | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-005-04 | Shared UI contract | Choose protection option | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-005-05 | Shared UI contract | Continue to review | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-006-01 | Shared UI contract | Edit trip/driver/extras | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-006-02 | Shared UI contract | Payment method | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-006-03 | Shared UI contract | Accept rental terms | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-006-04 | Shared UI contract | Marketing preference | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-006-05 | Shared UI contract | Confirm and pay / Confirm reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-006-06 | Shared UI contract | Check payment status | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-007-01 | Shared UI contract | View reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-007-02 | Shared UI contract | Download confirmation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-007-03 | Shared UI contract | Get directions | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-007-04 | Shared UI contract | Create account to manage booking | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-007-05 | Shared UI contract | Book another car | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-008-01 | Shared UI contract | Email/username | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-008-02 | Shared UI contract | Password | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-008-03 | Shared UI contract | Sign in | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-008-04 | Shared UI contract | Continue with provider | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-008-05 | Shared UI contract | Forgot credentials? | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-008-06 | Shared UI contract | Create account | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-009-01 | Shared UI contract | Account fields | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-009-02 | Shared UI contract | Accept account/privacy terms | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-009-03 | Shared UI contract | Create account | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-009-04 | Shared UI contract | Verification code | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-009-05 | Shared UI contract | Verify | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-009-06 | Shared UI contract | Resend / Change contact | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-010-01 | Shared UI contract | Account contact | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-010-02 | Shared UI contract | Send recovery instructions | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-010-03 | Shared UI contract | Recovery code/link confirmation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-010-04 | Shared UI contract | New credentials | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-010-05 | Shared UI contract | Back to sign in | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-011-01 | Shared UI contract | View current rental | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-011-02 | Shared UI contract | View upcoming reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-011-03 | Shared UI contract | Complete pending action | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-011-04 | Shared UI contract | Profile / Drivers / Payments / Data requests | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-012-01 | Shared UI contract | Edit section | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-012-02 | Shared UI contract | Save section | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-012-03 | Shared UI contract | Cancel edit | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-012-04 | Shared UI contract | Communication preference checkbox | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-012-05 | Shared UI contract | Change password/sign-in methods | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-013-01 | Shared UI contract | Add driver | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-013-02 | Shared UI contract | Edit driver | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-013-03 | Shared UI contract | Remove saved driver | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-013-04 | Shared UI contract | Add/replace document | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-013-05 | Shared UI contract | Use for checkout | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-014-01 | Shared UI contract | Reservation segment | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-014-02 | Shared UI contract | Search reservations | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-014-03 | Shared UI contract | Reservation card | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-014-04 | Shared UI contract | Book a car | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-015-01 | Shared UI contract | Modify reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-015-02 | Shared UI contract | Cancel reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-015-03 | Shared UI contract | Complete pending requirement | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-015-04 | Shared UI contract | Report delayed arrival | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-015-05 | Shared UI contract | View/download document | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-015-06 | Shared UI contract | View current rental | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-016-01 | Shared UI contract | Change trip / vehicle / drivers / extras | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-016-02 | Shared UI contract | Check availability and price | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-016-03 | Shared UI contract | Accept alternative | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-016-04 | Shared UI contract | Confirm changes and pay/refund | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-016-05 | Shared UI contract | Discard changes | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-017-01 | Shared UI contract | Cancellation reason | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-017-02 | Shared UI contract | Cancel reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-017-03 | Shared UI contract | Keep reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-017-04 | Shared UI contract | Track refund | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-018-01 | Shared UI contract | Reservation reference | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-018-02 | Shared UI contract | Contact verification value | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-018-03 | Shared UI contract | Find reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-018-04 | Shared UI contract | Verification code | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-018-05 | Shared UI contract | Continue to reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-019-01 | Shared UI contract | Transaction row/card | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-019-02 | Shared UI contract | Download receipt/statement | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-019-03 | Shared UI contract | Check pending status | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-019-04 | Shared UI contract | Question or dispute this item | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-020-01 | Shared UI contract | Request extension | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-020-02 | Shared UI contract | Get roadside help | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-020-03 | Shared UI contract | Report incident | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-020-04 | Shared UI contract | Return instructions | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-020-05 | Shared UI contract | View agreement / payment | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-021-01 | Shared UI contract | New return date/time/location | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-021-02 | Shared UI contract | Check extension | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-021-03 | Shared UI contract | Confirm extension / Send request | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-021-04 | Shared UI contract | Keep current return | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-022-01 | Shared UI contract | Roadside issue / Incident | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-022-02 | Shared UI contract | Use current location | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-022-03 | Shared UI contract | Vehicle drivable? | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-022-04 | Shared UI contract | Add evidence | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-022-05 | Shared UI contract | Submit report/request | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-022-06 | Shared UI contract | Call configured assistance | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-023-01 | Shared UI contract | Get directions | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-023-02 | Shared UI contract | Report early/late return | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-023-03 | Shared UI contract | Start after-hours check-in | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-023-04 | Shared UI contract | Submit after-hours return | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-023-05 | Shared UI contract | Contact location | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-024-01 | Shared UI contract | Access / Correct / Close account | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-024-02 | Shared UI contract | Verify identity | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-024-03 | Shared UI contract | Submit request | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-024-04 | Shared UI contract | Cancel request | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-024-05 | Shared UI contract | View request | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-001-01 | Shared UI contract | Staff identifier | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-001-02 | Shared UI contract | Password / external provider | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-001-03 | Shared UI contract | Sign in | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-001-04 | Shared UI contract | Recover access | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-002-01 | Shared UI contract | Scope | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-002-02 | Shared UI contract | Metric/task card | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-002-03 | Shared UI contract | Refresh dashboard | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-002-04 | Shared UI contract | Start assisted booking | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-003-01 | Shared UI contract | Queue type | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-003-02 | Shared UI contract | Open work item | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-003-03 | Shared UI contract | Assign selected to me | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-003-04 | Shared UI contract | Change owner / escalate / snooze | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-004-01 | Shared UI contract | Search records | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-004-02 | Shared UI contract | Type/status/location/date filters | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-004-03 | Shared UI contract | Open reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-004-04 | Shared UI contract | Open rental | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-004-05 | Shared UI contract | Create assisted booking | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-005-01 | Shared UI contract | Modify reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-005-02 | Shared UI contract | Cancel reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-005-03 | Shared UI contract | Assign / change vehicle | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-005-04 | Shared UI contract | Mark no-show / report delayed pickup | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-005-05 | Shared UI contract | Start pickup | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-005-06 | Shared UI contract | Resend confirmation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-006-01 | Shared UI contract | Find or create customer | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-006-02 | Shared UI contract | Search availability | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-006-03 | Shared UI contract | Record customer consent | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-006-04 | Shared UI contract | Apply override | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-006-05 | Shared UI contract | Confirm assisted reservation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-006-06 | Shared UI contract | Save pending / Cancel | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-007-01 | Shared UI contract | Readiness filter | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-007-02 | Shared UI contract | Assign vehicle | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-007-03 | Shared UI contract | Resolve blocker | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-007-04 | Shared UI contract | Mark customer arrived | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-007-05 | Shared UI contract | Start pickup | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-008-01 | Shared UI contract | Verify check | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-008-02 | Shared UI contract | Correct driver/payment/unit | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-008-03 | Shared UI contract | Record starting inspection | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-008-04 | Shared UI contract | Review agreement with renter | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-008-05 | Shared UI contract | Open rental and hand over | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-008-06 | Shared UI contract | Abort handover | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-009-01 | Shared UI contract | Status/due filter | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-009-02 | Shared UI contract | Open rental | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-009-03 | Shared UI contract | Contact renter | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-009-04 | Shared UI contract | Review extension request | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-009-05 | Shared UI contract | Start return | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-010-01 | Shared UI contract | Approve/reject extension | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-010-02 | Shared UI contract | Create staff extension | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-010-03 | Shared UI contract | Open/report incident | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-010-04 | Shared UI contract | Arrange replacement | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-010-05 | Shared UI contract | Start return | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-010-06 | Shared UI contract | Add post-rental item | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-011-01 | Shared UI contract | Record return facts | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-011-02 | Shared UI contract | Start return inspection | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-011-03 | Shared UI contract | Add adjustment/credit | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-011-04 | Shared UI contract | Review with customer | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-011-05 | Shared UI contract | Settle and close | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-011-06 | Shared UI contract | Save pending review | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-012-01 | Shared UI contract | Triage severity/type | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-012-02 | Shared UI contract | Assign/transfer owner | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-012-03 | Shared UI contract | Request customer/provider information | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-012-04 | Shared UI contract | Dispatch/record assistance | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-012-05 | Shared UI contract | Start replacement / adjustment | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-012-06 | Shared UI contract | Resolve/close case | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-013-01 | Shared UI contract | Add vehicle | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-013-02 | Shared UI contract | Vehicle row | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-013-03 | Shared UI contract | Change status/block | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-013-04 | Shared UI contract | Import / Export | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-013-05 | Shared UI contract | Saved view | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-014-01 | Shared UI contract | Edit vehicle | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-014-02 | Shared UI contract | Change lifecycle status | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-014-03 | Shared UI contract | Create maintenance/inspection/block | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-014-04 | Shared UI contract | Transfer vehicle | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-014-05 | Shared UI contract | Add/renew document | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-014-06 | Shared UI contract | Retire / archive erroneous draft | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-015-01 | Shared UI contract | Add category | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-015-02 | Shared UI contract | Edit category | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-015-03 | Shared UI contract | Manage images/features/translations | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-015-04 | Shared UI contract | Preview customer card/detail | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-015-05 | Shared UI contract | Activate/deactivate | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-016-01 | Shared UI contract | Plan transfer | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-016-02 | Shared UI contract | Confirm departure | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-016-03 | Shared UI contract | Confirm arrival | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-016-04 | Shared UI contract | Delay/cancel transfer | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-017-01 | Shared UI contract | Create/schedule work | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-017-02 | Shared UI contract | Start work | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-017-03 | Shared UI contract | Reschedule/cancel | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-017-04 | Shared UI contract | Add evidence/cost | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-017-05 | Shared UI contract | Complete and assess readiness | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-017-06 | Shared UI contract | Reopen | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-018-01 | Shared UI contract | Checklist answer | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-018-02 | Shared UI contract | Add condition finding | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-018-03 | Shared UI contract | Compare previous condition | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-018-04 | Shared UI contract | Save draft | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-018-05 | Shared UI contract | Submit inspection | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-018-06 | Shared UI contract | Correct/supersede | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-019-01 | Shared UI contract | Create block | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-019-02 | Shared UI contract | View affected demand | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-019-03 | Shared UI contract | Confirm block | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-019-04 | Shared UI contract | Shorten/release block | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-019-05 | Shared UI contract | Cancel draft | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-020-01 | Shared UI contract | Import / Export | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-020-02 | Shared UI contract | Choose file | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-020-03 | Shared UI contract | Validate and preview | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-020-04 | Shared UI contract | Run import / Create export | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-020-05 | Shared UI contract | Retry failed rows | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-020-06 | Shared UI contract | Cancel job | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-021-01 | Shared UI contract | Search customers | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-021-02 | Shared UI contract | Customer row | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-021-03 | Shared UI contract | Add customer | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-021-04 | Shared UI contract | Review possible duplicates | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-022-01 | Shared UI contract | Edit permitted customer data | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-022-02 | Shared UI contract | Initiate verification/recovery | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-022-03 | Shared UI contract | Add/review restriction | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-022-04 | Shared UI contract | Compare/merge duplicate | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-022-05 | Shared UI contract | Open reservation/rental/payment/case | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-022-06 | Shared UI contract | Review data request | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-023-01 | Shared UI contract | Transaction row | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-023-02 | Shared UI contract | Issue refund | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-023-03 | Shared UI contract | Reverse adjustment | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-023-04 | Shared UI contract | Record/review dispute | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-023-05 | Shared UI contract | Check provider status | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-023-06 | Shared UI contract | Download receipt/evidence | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-024-01 | Shared UI contract | Open exception | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-024-02 | Shared UI contract | Refresh provider state | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-024-03 | Shared UI contract | Link transaction | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-024-04 | Shared UI contract | Compensate/refund/retry | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-024-05 | Shared UI contract | Mark explained / Escalate | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-025-01 | Shared UI contract | Create rate version | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-025-02 | Shared UI contract | Edit conditions/prices | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-025-03 | Shared UI contract | Preview sample quote | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-025-04 | Shared UI contract | Submit/approve/activate | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-025-05 | Shared UI contract | Pause/supersede | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-026-01 | Shared UI contract | Add rule/promotion | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-026-02 | Shared UI contract | Edit applicability/calculation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-026-03 | Shared UI contract | Test eligibility/total | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-026-04 | Shared UI contract | Publish/pause/archive | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-026-05 | Shared UI contract | View usage | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-027-01 | Shared UI contract | Add extra/protection | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-027-02 | Shared UI contract | Edit applicability/stock/terms | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-027-03 | Shared UI contract | Preview choice card/agreement | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-027-04 | Shared UI contract | Activate/deactivate | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-027-05 | Shared UI contract | Manage translations | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-028-01 | Shared UI contract | Add/edit location | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-028-02 | Shared UI contract | Add exceptional hours/closure | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-028-03 | Shared UI contract | Manage one-way route | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-028-04 | Shared UI contract | Preview customer instructions | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-028-05 | Shared UI contract | Activate/archive | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-029-01 | Shared UI contract | Create policy version | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-029-02 | Shared UI contract | Edit allowed values | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-029-03 | Shared UI contract | Test scenario | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-029-04 | Shared UI contract | Submit/approve/activate | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-029-05 | Shared UI contract | Emergency pause/supersede | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-030-01 | Shared UI contract | Search/filter catalogue | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-030-02 | Shared UI contract | Open reference type | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-030-03 | Shared UI contract | View where used | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-030-04 | Shared UI contract | Refresh external source | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-031-01 | Shared UI contract | Add value | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-031-02 | Shared UI contract | Edit value/translations | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-031-03 | Shared UI contract | Reorder / Set default | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-031-04 | Shared UI contract | Deactivate / Restore | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-031-05 | Shared UI contract | Delete unused draft | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-031-06 | Shared UI contract | Retry/refresh sync | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-032-01 | Shared UI contract | Invite staff | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-032-02 | Shared UI contract | Add/edit role | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-032-03 | Shared UI contract | Change role/scope | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-032-04 | Shared UI contract | Suspend/deactivate | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-032-05 | Shared UI contract | Resend/revoke invitation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-032-06 | Shared UI contract | Reassign open work | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-033-01 | Shared UI contract | Create/edit template version | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-033-02 | Shared UI contract | Preview | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-033-03 | Shared UI contract | Send test | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-033-04 | Shared UI contract | Configure channel/timing/retry | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-033-05 | Shared UI contract | Submit/approve/publish | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-033-06 | Shared UI contract | Pause version | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-034-01 | Shared UI contract | Select language/content type | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-034-02 | Shared UI contract | Edit translation | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-034-03 | Shared UI contract | Preview in context | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-034-04 | Shared UI contract | Submit/approve/reject | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-034-05 | Shared UI contract | Mark fallback accepted | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-035-01 | Shared UI contract | Report card | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-035-02 | Shared UI contract | Search reports | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-035-03 | Shared UI contract | Open saved view | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-035-04 | Shared UI contract | Manage exports/schedules | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-036-01 | Shared UI contract | Run report | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-036-02 | Shared UI contract | Sort/page/drill down | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-036-03 | Shared UI contract | Save view | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-036-04 | Shared UI contract | Export | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-036-05 | Shared UI contract | Schedule | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-037-01 | Shared UI contract | Create export | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-037-02 | Shared UI contract | Download result | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-037-03 | Shared UI contract | Create/edit schedule | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-037-04 | Shared UI contract | Pause/delete schedule | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-037-05 | Shared UI contract | Retry failed delivery | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-038-01 | Shared UI contract | Search/filter events/findings | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-038-02 | Shared UI contract | Open event/finding | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-038-03 | Shared UI contract | Assign finding | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-038-04 | Shared UI contract | Resolve / false positive / reopen | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-038-05 | Shared UI contract | Export audit evidence | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-039-01 | Shared UI contract | Provider/service card | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-039-02 | Shared UI contract | Test/check connection | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-039-03 | Shared UI contract | Open failed event/case | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-039-04 | Shared UI contract | Retry / use manual fallback | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-039-05 | Shared UI contract | Pause/resume integration | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-039-06 | Shared UI contract | Escalate | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-SH-001–010 | COMP-SH-001 / shared navigation | Global shell/shared actions | SRS-UI-001–015 | TEST-COMP-SH-001 | Yes |
| EL-COMP-002-01–02 | Shared UI contract | COMP-SH-002 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-003-01 | Shared UI contract | COMP-SH-003 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-005-01 | Shared UI contract | COMP-SH-005 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-006-01–03 | Shared UI contract | COMP-SH-006 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-007-01–05 | Shared UI contract | COMP-SH-007 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-008-01–03 | Shared UI contract | COMP-SH-008 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-009-01–03 | Shared UI contract | COMP-SH-009 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-010-01–05 | Shared UI contract | COMP-SH-010 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-011-01–03 | Shared UI contract | COMP-SH-011 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-012-01 | Shared UI contract | COMP-SH-012 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-013-01–02 | Shared UI contract | COMP-SH-013 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-014-01–03 | Shared UI contract | COMP-SH-014 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-015-01–02 | Shared UI contract | COMP-SH-015 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-016-01–03 | Shared UI contract | COMP-SH-016 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-017-01–04 | Shared UI contract | COMP-SH-017 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-018-01–04 | Shared UI contract | COMP-SH-018 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-COMP-019-01–03 | Shared UI contract | COMP-SH-019 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-C01-01 | Shared UI contract | COMP-CUS-001 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-C02-01–03 | Shared UI contract | COMP-CUS-002 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-C04-01–02 | Shared UI contract | COMP-CUS-004 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-C05-01–02 | Shared UI contract | COMP-CUS-005 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-C06-01–03 | Shared UI contract | COMP-CUS-006 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-CUS-C07-01–03 | Shared UI contract | COMP-CUS-007 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-C01-01–03 | Shared UI contract | COMP-OPS-001 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-C02-01–04 | Shared UI contract | COMP-OPS-002 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-C03-01–05 | Shared UI contract | COMP-OPS-003 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-C04-01–02 | Shared UI contract | COMP-OPS-004 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-C05-01–04 | Shared UI contract | COMP-OPS-005 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-C06-01–04 | Shared UI contract | COMP-OPS-006 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |
| EL-OPS-C07-01–06 | Shared UI contract | COMP-OPS-007 | SRS-UI-001–015 | TEST-ELEMENT-SHARED | Yes |

## 21. Lookup and Localization Traceability Matrix

### 21.1 Lookup inventory

| LOOKUP ID | Classification | Source/Owner | Scope/Editability | Consumers | Localization/History | Management/View Surface | Test IDs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SRC-LOCATION | Entity-owned | Location records | Global/market; Full governed entity fields | Trip, assignment, transfer, reports | Name/address/instructions/hours; Archived location snapshot resolves on history | OPS-028; catalogue link | TEST-LKP-SRC-LOCATION |
| SRC-ONEWAY-ROUTE | Entity-owned/constrained | Location route records | Market/location pair; Availability, conditions, effective period | Trip/quote/location policy | Labels/instructions/fees through owning content; Prior route/policy version retained | OPS-028 | TEST-LKP-SRC-ONEWAY-ROUTE |
| SRC-VEHICLE-UNIT | Entity-owned | Vehicle records | Organization/location; Governed vehicle fields/status through lifecycle | Assignment, rental, fleet, maintenance | Make/model display; codes isolated; Retired unit remains on rental history | OPS-013/014 | TEST-LKP-SRC-VEHICLE-UNIT |
| SRC-VEHICLE-CATEGORY | Entity-owned/constrained | Category records | Market/location; Content/specs/applicability/order/status | Catalogue, rates, booking, assignment | Required public labels/descriptions; Accepted category snapshot retained | OPS-015 | TEST-LKP-SRC-VEHICLE-CATEGORY |
| LOOKUP-VEHICLE-MAKE-MODEL | Constrained lookup or entity data | Fleet catalogue | Market/global; Approved makes/models/year relations | Vehicle editor/catalogue | Display names as needed; Old unit value remains readable | OPS-015 or OPS-031 by operating model | TEST-LKP-LOOKUP-VEHICLE-MAKE-MODEL |
| LOOKUP-VEHICLE-FEATURE | Configurable constrained lookup | Stored reference catalogue | Market/global; Label, icon reference, order, applicability, active | Catalogue/filter/unit | Labels/descriptions; Inactive hidden for new, shown on history | OPS-031 / OPS-015 usage | TEST-LKP-LOOKUP-VEHICLE-FEATURE |
| LOOKUP-VEHICLE-STATE | System-fixed invariant | System-managed reference rows | Global; Labels only through translation; transitions locked | Fleet/availability | Localized label/explanation; Stable code retained forever | OPS-031 read-only | TEST-LKP-LOOKUP-VEHICLE-STATE |
| LOOKUP-RESERVATION-STATE | System-fixed invariant | System-managed rows | Global; Labels/explanations only | Customer/staff reservation status | Customer/staff localized labels; Stable code/event history retained | OPS-031 read-only | TEST-LKP-LOOKUP-RESERVATION-STATE |
| LOOKUP-RENTAL-STATE | System-fixed invariant | System-managed rows | Global; Labels/explanations only | Active rental/return | Localized; Stable code retained | OPS-031 read-only | TEST-LKP-LOOKUP-RENTAL-STATE |
| LOOKUP-PAYMENT-STATE | System-fixed/external mapping | System rows mapped to provider | Global/provider; Mapping constrained; labels translated | Payment/reconciliation | Customer-safe/staff labels; Original provider/internal status history retained | OPS-031 read-only/constrained; OPS-039 | TEST-LKP-LOOKUP-PAYMENT-STATE |
| LOOKUP-REFUND-STATE | System-fixed invariant | System-managed rows | Global; Labels only | Refund tracking | Localized; Stable code retained | OPS-031 read-only | TEST-LKP-LOOKUP-REFUND-STATE |
| LOOKUP-INCIDENT-STATE | System-fixed invariant | System-managed rows | Global; Labels only; transitions locked | Case workflows | Localized customer/staff variants; Stable events retained | OPS-031 read-only | TEST-LKP-LOOKUP-INCIDENT-STATE |
| LOOKUP-MAINTENANCE-STATE | System-fixed invariant | System-managed rows | Global; Labels only; transitions locked | Maintenance board | Localized; Stable events retained | OPS-031 read-only | TEST-LKP-LOOKUP-MAINTENANCE-STATE |
| LOOKUP-INSPECTION-STATE | System-fixed invariant | System-managed rows | Global; Labels only; transitions locked | Inspection workflow | Localized; Submitted/superseded history retained | OPS-031 read-only | TEST-LKP-LOOKUP-INSPECTION-STATE |
| SRC-RATE-PLAN | Entity-owned business configuration | Versioned rate plans | Market/location/category; Conditions, currency, amounts, period, status | Quote/pricing | Public plan/line labels where shown; Confirmed quote keeps version/snapshot | OPS-025 | TEST-LKP-SRC-RATE-PLAN |
| LOOKUP-CHARGE-TYPE | Constrained lookup | Stored reference catalogue | Market/jurisdiction; Safe labels/order/applicability; calculation family locked | Fees/taxes/deposits/adjustments | Customer line labels/explanations; Transaction line snapshot retained | OPS-026/031 | TEST-LKP-LOOKUP-CHARGE-TYPE |
| LOOKUP-DISCOUNT-TYPE | Constrained lookup | Stored reference catalogue | Market; Labels, allowed applicability/combinability subset | Promotion/rate configuration | Labels/messages; Historical discount code/type retained | OPS-026/031 | TEST-LKP-LOOKUP-DISCOUNT-TYPE |
| SRC-PROMOTION | Entity-owned business configuration | Promotion records | Market/location/channel; Code, eligibility, limits, dates, combinability/status | Booking/quote | Customer messages; Applied promotion snapshot retained | OPS-026 | TEST-LKP-SRC-PROMOTION |
| LOOKUP-PAYMENT-METHOD | Externally managed/constrained | Provider capabilities plus business enablement | Market/currency/channel; Enable safe subset, labels/order; capabilities locked | Checkout/pickup/payment | Customer method names/help; Original method summary retained | OPS-031/039; OPS-026 policy link | TEST-LKP-LOOKUP-PAYMENT-METHOD |
| LOOKUP-COUNTRY | Externally managed/system standard | Governing standards dataset | Global; supported subset; Business enablement; codes locked | Addresses/licences/policies | Localized country names; Standard code retained | OPS-031 | TEST-LKP-LOOKUP-COUNTRY |
| LOOKUP-CURRENCY | Externally managed/system standard | Governing standards dataset | Market; Supported subset/display; code/minor unit locked | Quotes/reports | Localized name/symbol formatting; Transaction currency immutable | OPS-031/025 | TEST-LKP-LOOKUP-CURRENCY |
| LOOKUP-TIME-ZONE | Externally managed/system standard | Governing time-zone dataset | Global; Location assignment; identifiers/rules locked | Locations/reports/schedules | Localized display; Stored identifier and event offset preserved | OPS-028/031 | TEST-LKP-LOOKUP-TIME-ZONE |
| LOOKUP-LICENCE-TYPE | Constrained/external | Market policy/reference rows | Market/jurisdiction; Enable subset, label, requirements; standard code constrained | Driver/eligibility | Label/help; Booking/agreement snapshot retained | OPS-029/031 | TEST-LKP-LOOKUP-LICENCE-TYPE |
| SRC-LANGUAGE-LOCALE | Constrained business configuration plus standards | Language/locale records | Global/market/user; Enable/default/fallback/order; locale rules locked | All surfaces | Self-referential/native labels; Transaction language/version retained | OPS-034/031 | TEST-LKP-SRC-LANGUAGE-LOCALE |
| LOOKUP-EXTRA-TYPE | Configurable business lookup/product | Extra product records/reference type | Market/location; Content, price link, stock, order, applicability, status | Checkout/fulfilment/return | Labels/descriptions/terms; Booked product snapshot retained | OPS-027/031 | TEST-LKP-LOOKUP-EXTRA-TYPE |
| LOOKUP-PROTECTION-PRODUCT | Constrained business product | Versioned protection records | Market/location/category/driver; Content/availability/price; legal/integration codes locked | Checkout/agreement/incident | Summary/exclusions/terms; Accepted terms/version retained | OPS-027/031 | TEST-LKP-LOOKUP-PROTECTION-PRODUCT |
| LOOKUP-CANCEL-REASON | Configurable business lookup | Stored reference catalogue | Global/market/channel; Code, labels, order, required note, active | Customer/staff cancellation | Required; Inactive reason remains on event | OPS-031 | TEST-LKP-LOOKUP-CANCEL-REASON |
| LOOKUP-NOSHOW-REASON | Configurable constrained lookup | Stored reference catalogue | Market/location; Code, labels, evidence rule, active | No-show correction/operations | Staff label; customer-safe category; Historical event label/code retained | OPS-031 | TEST-LKP-LOOKUP-NOSHOW-REASON |
| LOOKUP-OVERRIDE-REASON | Configurable constrained lookup | Stored reference catalogue | Rule family/scope; Label, evidence/approval requirements, active | Pricing/eligibility/allocation override | Staff localization; Inactive remains on audit | OPS-031/029 | TEST-LKP-LOOKUP-OVERRIDE-REASON |
| LOOKUP-REFUND-REASON | Configurable constrained lookup | Stored reference catalogue | Market/finance policy; Label, evidence/approval, active | Refund | Customer-safe label as permitted; Transaction/audit retains reason | OPS-031/023 | TEST-LKP-LOOKUP-REFUND-REASON |
| LOOKUP-ADJUSTMENT-REASON | Configurable constrained lookup | Stored reference catalogue | Market/charge type; Label, basis/evidence/tax rules, active | Return/post-rental charges/credits | Customer statement label required; Line-item snapshot retained | OPS-031/026 | TEST-LKP-LOOKUP-ADJUSTMENT-REASON |
| LOOKUP-TRANSFER-REASON | Configurable business lookup | Stored reference catalogue | Organization/location; Label, priority/evidence, active | Fleet transfer | Staff localization; Transfer event retains value | OPS-031/016 | TEST-LKP-LOOKUP-TRANSFER-REASON |
| LOOKUP-BLOCK-REASON | Configurable constrained lookup | Stored reference catalogue | Organization/location; Label, severity, work requirement, active | Availability block | Staff localization; Block history retains value | OPS-031/019 | TEST-LKP-LOOKUP-BLOCK-REASON |
| LOOKUP-CASE-REASON | Configurable constrained lookup | Stored reference catalogue | Case family; Label, routing, priority, evidence, active | Service/customer/data cases | Customer-safe label as applicable; Case history retains value | OPS-031/012/022 | TEST-LKP-LOOKUP-CASE-REASON |
| LOOKUP-INCIDENT-TYPE | Configurable constrained lookup | Safety-owned reference rows | Market; Label, questions, routing, vehicle-block behavior; high-risk locked | Incident report/triage | Customer/staff versions; Report retains type/version | OPS-031/012 | TEST-LKP-LOOKUP-INCIDENT-TYPE |
| LOOKUP-DAMAGE-FINDING | Configurable constrained lookup | Fleet-owned reference rows | Vehicle/category/market; Label, severity, evidence/review requirements, active | Inspection/damage | Staff/customer-safe labels; Finding retains value/version | OPS-031/018 | TEST-LKP-LOOKUP-DAMAGE-FINDING |
| LOOKUP-CLEANING-MAINT-TYPE | Configurable constrained lookup | Fleet reference rows | Organization/location/category; Label, trigger, blocking/severity/default duration, active | Fleet work | Staff localization; Work history retains type | OPS-031/017 | TEST-LKP-LOOKUP-CLEANING-MAINT-TYPE |
| LOOKUP-DOCUMENT-TYPE | Configurable constrained lookup | Policy/fleet reference rows | Market/person/vehicle; Label, applicability, expiry/blocking/evidence rules, active | Driver/vehicle compliance | Customer/staff labels/help; Submitted document retains type/version | OPS-031/014/029 | TEST-LKP-LOOKUP-DOCUMENT-TYPE |
| SRC-INSPECTION-CHECKLIST | Constrained versioned configuration | Fleet checklist versions | Market/category/inspection type; Items, order, required/NA/evidence, applicability, status | Pickup/return/maintenance | Labels/help; Completed inspection retains checklist version | OPS-018 with OPS-031 catalogue entry | TEST-LKP-SRC-INSPECTION-CHECKLIST |
| LOOKUP-READINESS-OUTCOME | System-fixed/constrained | System-managed rows | Global; Labels; transition effect locked | Inspection/fleet status | Localized; Stable code retained | OPS-031 read-only | TEST-LKP-LOOKUP-READINESS-OUTCOME |
| SRC-STAFF | Entity-owned | Staff accounts | Organization/location; Managed via staff lifecycle, not lookup | Assignment/ownership/approval | Display name; Deactivated staff remains actor/owner history | OPS-032 | TEST-LKP-SRC-STAFF |
| SRC-ROLE | Entity-owned constrained | Role records | Organization/scope; Name/description and allowed protected action set | Staff access | Staff labels/descriptions; Prior access events retain role/version | OPS-032 | TEST-LKP-SRC-ROLE |
| LOOKUP-PERMISSION-ACTION | System-fixed invariant | System-managed rows | Global; Labels/group only; security meaning locked | Role composition | Localized admin text; Stable action code retained | OPS-032/031 read-only | TEST-LKP-LOOKUP-PERMISSION-ACTION |
| LOOKUP-NOTIFICATION-EVENT | System-fixed invariant | System-managed rows | Global; Enable/channel rules constrained; event code locked | Template rules | Event labels; Sent message retains event/template | OPS-033/031 | TEST-LKP-LOOKUP-NOTIFICATION-EVENT |
| LOOKUP-DELIVERY-STATE | System-fixed/external mapping | System rows/provider mapping | Provider/global; Mapping constrained; labels only | Message status | Customer-safe/staff labels; Delivery event history retained | OPS-033/039/031 | TEST-LKP-LOOKUP-DELIVERY-STATE |
| SRC-REPORT-DEFINITION | Constrained entity/configuration | Versioned report definitions | Role/business; Safe dimensions/defaults/definition version | Reports | Titles/descriptions/metric help; Export stores definition/filter version | OPS-035/036 | TEST-LKP-SRC-REPORT-DEFINITION |
| LOOKUP-REPORT-DIMENSION | Constrained/system-managed | Report metadata rows | Report/permission; Labels/order/availability; semantic meaning locked | Report builder | Localized labels/definitions; Saved view resolves original dimension/version | OPS-036/031 | TEST-LKP-LOOKUP-REPORT-DIMENSION |
| SRC-CUSTOMER | Entity-owned | Customer records | Organization/privacy scope; Managed via verified customer workflow | Booking/support/customer picker | Names/addresses as entered; Merged/closed identity mapping preserved | OPS-021/022 | TEST-LKP-SRC-CUSTOMER |
| SRC-VENDOR-PROVIDER | Entity-owned/external | Vendor/integration records | Organization/market; Contact/routing/enabled state by owning area | Maintenance/roadside/integrations | Display content as needed; Prior work/event provider retained | OPS-017/039 | TEST-LKP-SRC-VENDOR-PROVIDER |

### 21.2 Locale and language coverage

The initial locale names are deliberately not invented. At release, one row per approved concrete locale replaces or instantiates the applicable profile below, and all rows must be covered.

| Locale/Language | Applications/Outputs | Resource/Content Owner | Fallback | RTL/LTR | Formatting/Search Rules | Test/Screenshot IDs | Covered |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Configured default locale | All apps; messages; receipts; agreements; reports; exports; documents | Translation/content administrators and owning business module | None for mandatory base resources | As defined by locale | Locale rules plus exact stable-code search | TEST-I18N-001–010; SHOT-I18N-DEFAULT-* | Required before release |
| Each approved LTR locale | All user-visible outputs | Translation/content owner and reviewer | Approved chain to default unless mandatory content blocks | LTR | Date/time/zone, currency, number, plural, Unicode search/sort | TEST-I18N-001–010; SHOT-I18N-LTR-* | Required before release |
| Each approved RTL locale | All user-visible outputs | Translation/content owner and reviewer | Approved chain to default unless mandatory content blocks | RTL with isolated LTR tokens | Same plus mirroring, focus order, mixed direction, map/media/chart exceptions | TEST-I18N-001–010; SHOT-I18N-RTL-* | Required before release |
| Missing/outdated translation profile | All apps and generated outputs | SCREEN-OPS-034 owner | Configured fallback or usage blocked | Inherits target locale | Raw keys prohibited; issue observable | TEST-I18N-FALLBACK; SHOT-I18N-FALLBACK-* | Yes |

## 22. Verification Coverage Matrix

### 22.1 Coverage summary

| Obligation set | Declared objects | Verification IDs/evidence | Coverage rule |
| --- | ---: | --- | --- |
| Functional requirements | 104 FR IDs | AC-AREA-NNN and TEST-AREA-NNN; Section 19 | Every FR row present and passing |
| Applications | 3 APP IDs | TEST-APP-CWEB/CMOB/OPS | Each applicable critical flow on supported platforms |
| Screens | 63 SCREEN IDs | TEST-SCREEN-*; Section 20.2 | Every screen default and applicable state/interaction covered |
| Detailed design flows | 29 FLOW IDs | TEST-FLOW-*; Section 20.3 | Happy path plus documented branches and final outcomes |
| Shared states | 12 STATE IDs | TEST-UI-STATE-001–012 | Every applicable state visually and behaviorally verified |
| Components | 34 COMP IDs | TEST-COMP-* | Every public variant and interactive contract covered |
| Interactive elements | 366 explicit EL IDs plus documented ranges | Owning TEST-SCREEN-* / TEST-COMP-* | Every interactive element activated; no dead control |
| Lookup/entity option sources | 49 LOOKUP/SRC IDs | TEST-LKP-*; Section 21.1 | Ownership, API, scope, change/history, locale, consumer |
| Localization | Configured locale profiles | TEST-I18N-* and SHOT-I18N-* | One complete instantiation per approved locale |
| Data | SRS-DAT-001–012 and entity catalogue | TEST-DAT-001–012 plus migration/invariant tests | Real PostgreSQL and before/after state assertions |
| REST/interfaces | SRS-API-001–010 and IF-* | TEST-API-* / TEST-IF-* | Contract plus success/error/security/idempotency |
| Security/privacy | SRS-SEC-001–017 | TEST-SEC-001–017 | Positive/negative/scoped/adversarial checks |
| Error/recovery | TEST-ERR-001–013 | Targeted failure simulation and reconciliation | No unresolved side effect hidden |
| Quality attributes | SRS-NFR-001–022 | TEST-NFR-001–022 and approved measurements | Target profile and gate recorded before release |
| Observability/debugging | SRS-OBS-001–012 | TEST-OBS-001–012; logs/traces/screens/network/DB evidence | Correlation works end-to-end; secrets absent |

### 22.2 Critical cross-layer acceptance

For every TEST-FLOW-CUS-* and TEST-FLOW-OPS-* suite, the evidence record must identify source FRs/screens/elements, test data seed, actor and scope, UI checkpoints, API operation IDs, request/idempotency/version identifiers, authoritative database assertions, outbox/job/provider-simulator results, audit events, visible localized outcome, console/network result, and cleanup or retained-case state. Where a layer is not applicable, the test records the reason.

### 22.3 Test data and environment integrity

- Test identities, documents, vehicles, payment tokens, and contact addresses are synthetic and clearly non-production.
- Test runs use isolated organization/scope identifiers and disposable databases/buckets/queues where practical.
- Deterministic builders create valid defaults and require each test to state only meaningful differences.
- Time-dependent tests use an injectable clock; expiry/daylight-saving/effective-date cases do not wait for wall time.
- Provider simulators expose named scenarios for success, decline, validation failure, timeout-before-effect, timeout-after-effect/unknown, duplicate callback, out-of-order callback, malformed/signature failure, outage, and recovery.
- Failure injection never reaches a live provider or production dataset.
- Parallel tests cannot share mutable identities, idempotency keys, inventory units, or database schemas unless the test explicitly validates contention.

### 22.4 Continuous verification commands

The repository must expose documented commands for format check, type check, lint, unit/component tests, API/integration tests, migration tests, web/admin E2E, mobile E2E, accessibility, visual regression, security scans, load checks, full verification, local stack start/stop/reset, safe seed, OpenAPI generation/check, database backup/restore rehearsal, and evidence report generation. The same commands run locally and on any chosen CI runner; hosted proprietary CI features cannot be the only execution path.

### 22.5 Final two-way audit

Before declaring an implementation stage complete, automation verifies: every FR in the baseline appears in Section 19; every APP/SCREEN/FLOW/STATE and component/element range appears in Section 20; every lookup source appears in Section 21; every significant SRS ID has a test family; every implemented API operation maps to a requirement; every database migration maps to an owning module/requirement; and no test, endpoint, migration, or screen claims coverage using a missing or superseded ID.
