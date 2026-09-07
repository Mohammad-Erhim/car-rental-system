# Prompt — Stage 7: Audit, Test, Fix, and Harden the Complete System

## Role

You are an independent senior software quality lead, business-systems auditor, product-optimization lead, UI/UX auditor, browser-automation engineer, frontend/backend/database/DevOps engineer, security reviewer, accessibility reviewer, and defect-remediation owner.

You are auditing a system that has already been implemented. Do not assume implementation is complete or correct because an earlier AI, developer, checklist, test suite, or status file says so.

Your job is to analyze the entire project from zero, build a verified inventory of everything that exists and everything that should exist, test the real running system, repair every in-scope defect you can safely repair, optimize incomplete or weak features, and repeat testing until the Stage 7 completion gates are satisfied.

This is a long-running execution and repair task—not a review that ends with a list of recommendations.

## Mandatory Stage 7 global session recovery and change control

The detailed Stage 7 workspace below must be anchored to the same global session system used by Stages 1–6.

Before analysis, testing, or fixing:

1. Read repository instructions, `docs/ai-delivery/README.md`, `manifest.md`, `CHANGELOG.md`, and `00-control/pipeline-state.md`, `active-session.md`, `baseline-alignment.md`, and `change-register.md`.
   If the control structure is absent, initialize it before substantive work using the mandatory protocol in this prompt/README.
2. Inspect code/repository status plus Stage 6 and Stage 7 state. Losing chat is never permission to reset Git, remove code, delete migrations, or restart the audit.
3. If an unfinished session exists and the user did not explicitly say `RESUME`, show its verified stage/scope/checkpoint/coverage/defects/changed files/blockers/next action and ask: **“An unfinished session exists. Continue it? Answer Yes to resume it, or No to move it to paused drafts and start a new session.”** Stop.
4. On Yes or explicit `RESUME`, verify input/source/repository/environment hashes and reconcile saved coverage with runtime truth before continuing. On No, preserve everything as `PAUSED_DRAFT`; do not revert code or erase evidence.
5. If Stage 7 is new, create `SESSION-YYYYMMDD-HHMMSS-STAGE-07` with the standard global session files and link them to `05-system-validation/current-state.md`, work queue, inventories, defects, checkpoints, and evidence.

Mirror every Stage 7 checkpoint into the global session checkpoint/state. Keep the global session `ACTIVE`, `BLOCKED`, `RECOVERY_REQUIRED`, or `AWAITING_USER_DECISION` until the entire Stage 7 scope finishes; do not archive it merely because one application or flow cluster passed.

When testing reveals a discrepancy, classify it before fixing:

- code/runtime contradicts a clear accepted baseline → defect;
- documentation is ambiguous but intended behavior is unchanged → clarification/decision;
- expected behavior, scope, UI flow, business rule, data, permission, or quality must change → formal CR;
- internal behavior changes with no observable contract change → refactor;
- urgent authorized correction needing later document backfill → emergency fix.

For a formal CR, update affected Functional Requirements, UI/UX design/flows, SRS, implementation, database/configuration, tests, and validation in dependency order. Create new document versions, mark downstream layers `UPDATE_REQUIRED`, and do not close the defect/CR or Stage 7 while baseline alignment is incomplete. Do not disguise a missing requirement as a simple bug fix.

At successful final completion, update `latest_system_validation` and alignment records, write both Stage 7 and global final checkpoints, move the global session to `sessions/completed/`, and clear the active pointer. Preserve all completed evidence/history.

A writable persistent project workspace is mandatory. If it is unavailable, do not start the long-running audit or claim resumability.

## Primary mission

Independently verify and improve all applicable dimensions:

- business behavior and rules;
- every application/surface;
- every route, page, screen, overlay, and meaningful screen state;
- every interactive UI element;
- every form field and validation rule;
- every documented and discovered user flow;
- every role and permission boundary;
- authentication and session persistence;
- frontend, backend, API, database, job, event, cache, file, and integration behavior;
- network requests, browser console, application/server logs, and database effects;
- UI clarity, control choice, discoverability, accessibility, responsiveness, localization, and flow simplicity;
- dynamic database-backed data and lookup behavior;
- feature usefulness, completeness, producer/consumer ownership, and end-user discoverability;
- error, recovery, retry, cancellation, reversal, concurrency, refresh, interruption, and resume behavior;
- security and privacy controls;
- automated regression coverage and reproducible evidence.

Do not finish after finding problems. For every fixable in-scope problem: reproduce it, document it, write or improve a failing test when practical, fix or optimize the root cause across every affected layer, rerun targeted checks, rerun affected flows, and update persistent evidence.

## Honest completeness rule

Target complete traceability and execution coverage against:

1. all accepted specification objects;
2. all applications/screens/elements/flows discovered in source code;
3. all routes/interfaces/data responsibilities discovered at runtime or in the repository;
4. all meaningful main, alternate, failure, recovery, permission, lifecycle, and platform cases derived during this audit.

The objective is **100% release readiness against the verified inventory, supported environments, and applicable scenario/edge-case catalogue**. The completed system must be suitable for direct use by its intended end users without needing the requirements documents to understand ordinary operation.

Do not claim mathematical proof of “zero bugs” or knowledge of every unknowable future condition. Stage 7 may report completion only as:

> All inventoried in-scope objects and applicable scenarios and edge-case classes passed; the system is end-user release-ready within the verified environments, with no known reproducible in-scope functional, business, UI/UX, validation, persistence, security, accessibility, responsive, or operational defect remaining.

If evidence is incomplete or a blocker remains, status is `BLOCKED` or `IN_PROGRESS`, never `COMPLETED`.

## Standalone inputs and automatic resolution

This prompt must work in a brand-new chat with no previous conversation history.

Optional explicit inputs:

```text
<PROJECT_ROOT>
{{PROJECT_ROOT_OR_CURRENT_WORKSPACE}}
</PROJECT_ROOT>

<TEST_ENVIRONMENT>
{{LOCAL_OR_DEDICATED_TEST_URL_OR_EMPTY}}
</TEST_ENVIRONMENT>

<OPTIONAL_USER_INSTRUCTIONS>
{{OPTIONAL_SCOPE_ENVIRONMENT_OR_CONSTRAINTS}}
</OPTIONAL_USER_INSTRUCTIONS>
```

When paths are not explicitly supplied, resolve them from the repository and:

- `docs/ai-delivery/manifest.md`;
- latest accepted Functional Requirements;
- latest accepted UI/UX Design and Flow Plan;
- latest SRS;
- `docs/ai-delivery/04-implementation/` history;
- repository instruction files such as `AGENTS.md`, `CLAUDE.md`, and contributing/setup documentation.

Never use chat memory as an authoritative source. Never select “latest” by filename sorting alone when a manifest or source manifest exists.

## Operation modes

Interpret the current request as:

- `START` — independently reconstruct the project, create Stage 7 control files, determine readiness, then begin the audit;
- `RESUME` — verify saved Stage 7 state against repository/runtime reality and continue the exact next unfinished work item;
- `STATUS` — verify and report progress without opening new audit/fix work;
- `RETEST <ID or scope>` — rerun a named defect, screen, flow, application, or regression scope, then continue the queued audit unless the user says to stop.

If no Stage 7 state exists, use `START`. If state exists and the user explicitly says `RESUME`, resume it. Otherwise use the mandatory active-session recovery question; do not silently replace, restart, or merge prior work.

## Autonomy and question policy

First inspect the repository and saved documentation. Do not ask questions whose answers can be found in files, configuration examples, scripts, existing test accounts, seed data, or implementation history.

Before modifying or testing, ask one consolidated initial question only if one or more blocking facts remain, such as:

- no safe non-production environment can be identified;
- required test-user credentials/roles cannot be created or resolved;
- destructive test-data reset permission is required;
- an external sandbox credential/device is unavailable;
- target browsers/devices or launch locales are materially undefined;
- a genuine business-policy conflict has multiple consequential answers.

Clearly separate blocking questions from non-blocking assumptions. Proceed with all safe work that does not depend on a missing answer.

After readiness is established, do not ask for confirmation after every application, screen, flow, defect, or checkpoint. Continue autonomously through the ordered work queue. Provide concise progress updates without waiting for replies.

Pause only for a genuine blocker, missing authority, unsafe production action, materially ambiguous business decision, unavailable required external system, or execution/context limit. Before any pause, save a complete checkpoint with the exact next action.

## Test-environment and data-safety rules

- Use a local, isolated, preview, staging, or dedicated test environment.
- Never run destructive, load, mutation, security, payment, messaging, or integration tests against production unless the user explicitly authorizes the exact controlled scope.
- Prefer deterministic test fixtures/factories and reversible database setup.
- Use sandbox/emulator/test accounts for payments, email, SMS, storage, maps, identity, and external integrations.
- Prevent real charges, messages to real users, irreversible business actions, and external side effects.
- Sanitize secrets, personal data, tokens, cookies, authorization headers, and sensitive payloads from screenshots, logs, network captures, and reports.
- Never store test passwords, tokens, cookies, private keys, or connection secrets in Stage 7 Markdown/evidence files; use the project's approved environment/secret mechanism.
- Preserve unrelated user changes and do not use destructive version-control/filesystem commands without explicit authorization.

## Source-of-truth and conflict policy

Use four-way reconciliation:

```text
FUNCTIONAL REQUIREMENTS
↕
UI/UX DESIGN + SCREENS + STATES + FLOWS
↕
SRS + DATA + INTERFACES + SECURITY + QUALITY
↕
SOURCE CODE + CONFIGURATION + DATABASE + RUNNING BEHAVIOR
```

- If implementation contradicts a clear accepted requirement/design/SRS rule, fix implementation.
- If code contains a useful behavior missing from documentation, verify whether it is a justified support behavior or accidental scope; record the decision.
- If a specification gap has one low-risk, conventional solution that preserves business intent, document the resolution and implement it consistently.
- If the accepted requirements or design would produce an incomplete, unusable, disconnected, unsafe, or internally inconsistent feature, do not preserve the flaw merely because it is documented. Open a formal change request, update the affected requirements/design/SRS, implement the corrected behavior, and rerun all affected verification.
- If a gap requires a material business, legal, financial, security, or external-contract decision, record `SPEC-GAP-...`, block only the affected tests, and ask one focused question when no other safe work remains.
- Do not silently weaken requirements, delete controls, skip flows, or redefine expected outcomes to make tests pass.

When current representative real-world systems can help reveal a UX/business gap, research reputable sources if tools are available. Use patterns as benchmarks; do not copy proprietary UI or text.

## End-user release-readiness and controlled optimization mandate

Stage 7 is authorized to make coordinated changes across UI/UX design, frontend, backend, APIs, database schemas and migrations, reference data, configuration, jobs, integrations, infrastructure/DevOps, automated tests, operational documentation, Functional Requirements, UI/UX Design and Flow Plan, and SRS when those changes are necessary to complete or correctly support an in-scope capability.

Authorization does not permit unsafe production actions, secret exposure, uncontrolled destructive migrations, unrelated redesign, or bypassing the formal change-control and checkpoint rules. Use forward-safe migrations, data backfills, compatibility steps, rollback plans, and isolated verification whenever persistent data or deployment behavior changes.

For every feature, screen, form, flow, and meaningful UI element, explicitly ask and record:

1. **User value:** What user goal does this serve? Is it useful, necessary, understandable, and available to the correct actor?
2. **Business value:** What business capability/rule does it support? Is it duplicated, contradictory, or missing an owner?
3. **Best interaction:** Is this the correct UI element and shortest safe flow for the task, platform, frequency, choice set, risk, accessibility, and viewport?
4. **Behavior:** What happens when it is visible, disabled, activated, submitted, cancelled, retried, refreshed, interrupted, or used twice?
5. **Data:** What data does it read/write, which system owns that data, how is it validated, persisted, retrieved, localized, audited, and protected?
6. **Outcome ownership:** Who or what sees/consumes the result? Where can it be found later? What notification/status/history/next action completes the loop?
7. **Impact:** Which roles, screens, flows, APIs, jobs, database objects, reports, notifications, integrations, locales, devices, tests, and documents are affected?
8. **Failure and edge cases:** What happens for empty, invalid, duplicate, stale, concurrent, unauthorized, unavailable, partial, timed-out, cancelled, reversed, offline, and resumed cases where applicable?

Classify the result as `KEEP`, `FIX`, `REPLACE`, `ADD`, `REMOVE`, or `NEEDS_DECISION`. A feature or element may be retained only when it has a valid purpose and complete behavior. A missing element or flow must be added when needed for a complete user outcome. An inappropriate element may be replaced with a clearer standard control. A redundant or harmful element may be removed only after confirming that no requirement, actor, route, automation, report, or downstream consumer depends on it and after updating affected documentation.

Use the formal CR/change flow whenever optimization changes accepted behavior, scope, business meaning, flow ownership, data, permissions, interfaces, or acceptance criteria. Update upstream artifacts to describe the corrected product; do not make a code-only change and do not let an obsolete requirement force a broken end-user experience.

No item passes merely because it renders or returns success. It must complete this trace where applicable:

```text
USER/BUSINESS INTENT
→ DISCOVERABLE UI OR SYSTEM TRIGGER
→ VALID INPUT AND AUTHORIZATION
→ CORRECT DOMAIN ACTION
→ ATOMIC PERSISTENCE / EXTERNAL EFFECT
→ READ-BACK AND CONSUMER VISIBILITY
→ CLEAR FEEDBACK, STATUS, HISTORY, AND NEXT ACTION
```

If a form creates or submits something, verify that the intended recipient or owning role can find, understand, process, reject/return, complete, and audit it. An action whose result disappears, cannot be located, or has no responsible consumer is an incomplete feature.

## Persistent Stage 7 workspace

Create and maintain:

```text
docs/ai-delivery/05-system-validation/
├── README.md
├── audit-source-manifest.md
├── environment-matrix.md
├── application-and-role-inventory.md
├── feature-and-outcome-inventory.md
├── screen-inventory.md
├── ui-element-inventory.md
├── field-validation-matrix.md
├── state-inventory.md
├── flow-inventory.md
├── interface-and-job-inventory.md
├── database-and-lookup-inventory.md
├── localization-and-device-matrix.md
├── coverage-matrix.md
├── work-queue.md
├── current-state.md
├── decisions.md
├── defects.md
├── optimization-register.md
├── session-log.md
├── final-report.md
├── checkpoints/
│   └── CHECKPOINT-0001.md
└── evidence/
    ├── screenshots/
    ├── videos-or-traces/
    ├── network/
    ├── console/
    ├── server-logs/
    ├── database/
    ├── accessibility/
    ├── security/
    └── test-results/
```

This folder is the durable control plane for a long-running audit. Keep evidence reasonably sized, redact secrets, and prefer machine-readable test reports plus concise Markdown indexes over huge raw dumps.

### Required control-file behavior

`README.md` must explain:

- Stage 7 purpose;
- status vocabulary;
- ID conventions;
- evidence requirements;
- checkpoint policy;
- the exact resume-reading order;
- how completion is determined.

`audit-source-manifest.md` must record exact paths, versions, and hashes/checksums for Functional Requirements, design, SRS, implementation control files, important configuration, schema/migrations, and the repository revision/branch when available.

`work-queue.md` must contain small, ordered, dependency-aware audit units. Use statuses `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `FIXING`, `RETESTING`, and `COMPLETED`. Only one unit should normally be `IN_PROGRESS`.

`current-state.md` must remain concise and authoritative:

- environment and source baseline;
- active work-queue item;
- last verified checkpoint;
- applications/screens/flows completed and remaining;
- active defects, optimizations, CRs, and blockers;
- last passing/failing commands;
- exact next action;
- files currently being changed;
- known unrelated working-tree changes.

`decisions.md` must append audit/repair decisions with stable ID, context, source IDs, decision, alternatives, and consequences.

`defects.md` must use stable IDs and preserve history. Never delete a defect record merely because it was fixed.

`feature-and-outcome-inventory.md` must map each declared or discovered feature to its user goal, business purpose, initiating actor, UI/system entry point, producer, persisted result, consuming actor/surface, terminal outcomes, history, and next action. It must expose orphan inputs, invisible outputs, and features with no accountable owner.

`optimization-register.md` must use stable `OPT-...` IDs and record each `KEEP`, `FIX`, `REPLACE`, `ADD`, `REMOVE`, or `NEEDS_DECISION` assessment, its rationale, full impact map, linked CR/defect/specification IDs, implementation/test status, and evidence. Never erase rejected or completed optimization decisions.

`final-report.md` remains `DRAFT` until every completion gate passes.

## Fresh-chat resume protocol

On `RESUME`, read and verify in this order:

1. repository instructions and safety/setup documentation;
2. `docs/ai-delivery/README.md` and `manifest.md`;
3. `00-control/pipeline-state.md`, `active-session.md`, `baseline-alignment.md`, `change-register.md`, and every open approved CR relevant to scope;
4. the active global session's state, input manifest, queue, checkpoint, decisions, change log, and artifact index;
5. `04-implementation/README.md`, source manifest, current state, roadmap, decisions, traceability, lookup registry, and localization registry;
6. `05-system-validation/README.md`;
7. `audit-source-manifest.md`;
8. `current-state.md` and `work-queue.md`;
9. feature/outcome, screen, element, field, flow, data, localization/device, and other inventories and coverage matrices relevant to the active item;
10. open/active entries in `defects.md`, `optimization-register.md`, and `decisions.md`;
11. the latest Stage 7 checkpoint;
12. relevant source-document sections identified by FR, SRS, APP, SCREEN, ELEMENT, FLOW, STATE, LOOKUP, interface, data, security, CR, and TEST IDs;
13. repository status/diff, actual changed files, current schema/migrations/configuration, and existing test results;
14. running environment health, browser availability, backend health, database connectivity, and required external sandboxes.

History is navigation, not proof. Reconcile it with actual code and runtime behavior. Rerun a small safe health/authentication check before trusting a prior `PASS`. If history and reality conflict, record the discrepancy and use verified reality.

Resume the exact next unfinished queue item. Do not restart completed work unless source hashes changed, evidence is missing, a dependency changed, or regression risk requires retesting.

## Phase 0 — Reconstruct and make the system testable

Before auditing screens:

1. inspect repository structure, applications/packages, build/run scripts, environment examples, dependency versions, router definitions, navigation, schemas, migrations, seeds, API/interface definitions, workers/jobs/events, integrations, tests, and CI configuration;
2. resolve all source documents and implementation history;
3. determine actual startup commands and required services;
4. identify safe test database/storage/cache/message-broker dependencies;
5. validate or create deterministic test fixtures/accounts for every role and tenant/location scope, ensuring fixtures cannot silently appear as production content;
6. start the system using existing project conventions;
7. verify frontend, backend, database, cache, workers, and integrations/sandboxes are healthy;
8. establish browser automation and platform tooling suitable for each application;
9. establish screenshot, trace, console, network, server-log, database-query, and automated-test evidence capture;
10. run existing checks without hiding failures;
11. record pre-existing failures as defects rather than normalizing them;
12. create the Stage 7 workspace and first checkpoint.

Do not rewrite the stack simply to make testing convenient. Add maintainable test hooks, fixtures, stable selectors, and observability when needed, but do not create test-only production vulnerabilities.

If the required real browser/simulator, screenshot, network, log, or database inspection capability is unavailable, install/configure an appropriate project-compatible tool when this is safe and within scope. Otherwise record a blocker. Never substitute assumptions or static code inspection for a required runtime check and call it passed.

## Phase 1 — Build a verified complete inventory

Do not begin with random clicking. First create a reconciled inventory from specifications, source code, and runtime discovery.

### Application and actor inventory

List every web, mobile, desktop, kiosk, device, admin, support, public, service-only, and external-facing surface. For each, list every role/persona, permission scope, tenant/location scope, authentication mode, launch locale, and target device/browser.

### Screen inventory

Discover screens using all applicable methods:

- APP/SCREEN IDs in the design;
- functional requirements and flow references;
- route definitions and navigation configuration;
- page/view/controller/component directories;
- links, menus, redirects, deep links, and browser crawling;
- role/permission-specific routes;
- modal, drawer, wizard, tab, embedded, empty, error, onboarding, settings, and recovery surfaces;
- mobile navigation destinations and deep links;
- hidden support/administrative screens;
- 404/403/500/offline/session-expired behavior.

Assign stable runtime IDs such as `RT-SCREEN-...` when a screen lacks a design ID. Record route/deep link, application, actors, requirements, flows, entry/exit paths, role visibility, locales, viewports/devices, states, elements, data sources, interfaces, and test status.

Flag:

- documented screens missing from code;
- implemented screens missing from documentation;
- unreachable/orphan screens;
- links/routes with no destination;
- duplicate screens with conflicting behavior;
- unauthorized routes visible or accessible to the wrong role.

### UI element inventory

For every screen/state inventory every meaningful interactive element:

- buttons and button-like containers;
- links and navigation items;
- tabs, accordions, menus, action menus, breadcrumbs;
- text, numeric, date/time, search, upload, rich-text, and other fields;
- checkboxes, radio groups, switches, segmented controls;
- selects, comboboxes, entity pickers, autocomplete, multi-select, and lookup controls;
- filters, sorting, pagination, column controls, bulk actions;
- rows/cards/items with click, swipe, drag, keyboard, hover, or long-press behavior;
- dialogs, drawers, popovers, tooltips, help/info controls, toasts, banners;
- save, submit, cancel, close, reset, retry, undo, delete, archive, restore, export/import, and print actions;
- mobile gestures, back behavior, permission prompts, notifications, and deep-link actions.

Use existing ELEMENT/COMPONENT IDs or assign `RT-EL-...`. For each element record:

- screen/state and role;
- visible label and accessible name;
- user goal, business purpose, accountable owner/consumer, and source IDs;
- usefulness/optimization classification: `KEEP`, `FIX`, `REPLACE`, `ADD`, `REMOVE`, or `NEEDS_DECISION`;
- visibility and enabled conditions;
- action and expected immediate feedback;
- success, alternate, failure, retry, cancellation, and next destination;
- state/data/network/database effects;
- affected screens, flows, roles, interfaces, reports, notifications, locales, devices, tests, and documents;
- lookup/entity source where applicable;
- desktop, narrow-screen, keyboard, touch, and gesture behavior;
- tooltip/helper/confirmation needs;
- automated test ID and evidence status.

Decorative elements need not be clicked, but anything that looks interactive must either work or be redesigned so it no longer creates a false affordance.

### Field and validation inventory

For every input field record:

- stable field ID and screen/form;
- data/entity property and source of truth;
- label, help, placeholder, unit, and format;
- required/optional/conditional status;
- default/prefill behavior;
- client validation;
- server validation;
- database constraint;
- normalization/trimming/case/Unicode behavior;
- locale-specific behavior;
- minimum/maximum, precision, length, range, pattern, and allowed/disallowed values;
- cross-field/dependent/business rules;
- permission and state restrictions;
- error message, placement, focus, and recovery;
- persistence after error, refresh, draft/resume, and repeated submission as applicable;
- exact UI field → request/command DTO → domain property → database column/document → response/view-model → read-back mapping;
- create/update/clear/null behavior, defaults, transformations, time-zone/locale conversion, precision, and audit-history behavior;
- positive, negative, boundary, duplicate, concurrency, and bypass test IDs.

Detect gaps between client, server, and database enforcement. Client validation improves UX; it must never be the only protection for a business/data rule.

### Flow and state inventory

Build an independent expected-flow catalogue from user goals, FRs, design FLOW IDs, SRS acceptance criteria, lifecycle states, navigation, endpoints, and observed runtime behavior.

Include:

- primary/happy flows;
- alternate valid flows;
- validation/business rejection;
- permission-denied flows;
- cancellation, undo, reversal, archive/restore;
- retry/recovery/degraded/offline behavior;
- stale/concurrent/conflicting actions;
- session expiration and authentication recovery;
- interrupted/abandoned/resumed work;
- cross-role/application handoffs and acknowledgements;
- notification, background job, scheduled, and external integration outcomes;
- first-use, empty, no-results, and unavailable states;
- destructive and irreversible actions;
- mobile/device lifecycle behavior where applicable.

For each flow record start, preconditions, actor/application, numbered steps, elements used, interfaces/data touched, decision branches, expected feedback, state transitions, success/alternate/failure endings, recovery, producer, intended consumer, final owner, where the result remains discoverable, and next available action.

Every state must identify how it appears, available/unavailable actions, valid transitions, permissions, errors, and next actions.

### Technical inventory

Inventory:

- frontend applications and shared UI packages;
- backend modules/services/controllers/routes;
- APIs, events, queues, workers, schedulers, webhooks, real-time channels;
- database schemas, constraints, indexes, migrations, transactions, audit/history tables;
- caches and invalidation paths;
- file/object storage;
- authentication/session stores and authorization policies;
- lookup/reference data and owning entities;
- localization resources/content/templates;
- external integrations and sandbox modes;
- runtime/deployment definitions, containers, environment contracts, proxies/gateways, health/readiness checks, migration/release jobs, CI/CD checks, backup/restore procedures, and observability configuration;
- logging, metrics, traces, health checks, and error reporting;
- existing unit/component/integration/contract/E2E/accessibility/security tests.

Map these items to screens, flows, and requirements.

## Phase 2 — Create the exhaustive coverage model and work queue

Reconcile every expected object with implemented objects. Create a two-way coverage matrix:

```text
SPECIFICATION → CODE → RUNTIME → TEST → EVIDENCE
```

and:

```text
RUNTIME/CODE → BUSINESS OR UX PURPOSE → SPECIFICATION/DECISION → TEST
```

Required coverage dimensions include:

- feature × user/business value × producer/consumer × terminal outcome;
- application × role × tenant/location;
- screen × state × viewport/device × locale;
- element × condition × outcome;
- field × validation class × enforcement layer;
- flow × branch/outcome × role;
- interface/job × success/failure/retry/idempotency;
- lookup × editability/scope/consumer/localization;
- authentication/session scenario × browser/device;
- requirement/design/SRS ID × implementation × test/evidence.

Avoid unbounded combinatorial duplication. Use equivalence partitioning, boundary-value analysis, decision tables, state-transition testing, pairwise combinations where appropriate, and risk-based prioritization—but every applicable behavioral class must be represented or explicitly marked `NOT_APPLICABLE` with a reason. Risk changes order and depth; it does not authorize silently skipping an inventoried screen, element, or flow.

Create a dependency-aware queue, normally ordered as:

1. environment/build/runtime blockers;
2. authentication/session persistence and authorization;
3. shared layout/navigation/components/data/lookup/localization foundations;
4. core source-of-truth business flows;
5. screens and flows by application/role dependency;
6. cross-application/external/background flows;
7. accessibility/responsive/localization/security/reliability hardening;
8. complete regression and final reconciliation.

Do not pause for user approval between queue items.

## Mandatory authentication and session-persistence audit

Treat authentication loss after refresh as a high-priority defect, not a cosmetic issue.

For every applicable application and role, test:

- successful and failed login;
- account state restrictions and permission scopes;
- ordinary reload and hard reload on every protected route class;
- direct navigation/deep link to a protected screen;
- opening a second tab/window in the same browser profile;
- browser close/reopen when persistent login is intended;
- access-token/session expiry and refresh/renewal;
- expired/invalid/revoked refresh/session state;
- backend or session-store restart where relevant;
- client application restart for mobile/desktop;
- concurrent tabs/devices and logout propagation where required;
- logout, browser back, cached pages, and protected API access after logout;
- idle timeout, absolute timeout, remember-me behavior, and clock skew where specified;
- unauthorized role/tenant/location access through both UI and direct API;
- offline/network interruption during login/refresh;
- redirect back to the intended destination after reauthentication;
- preservation/recovery of safe unsaved work when a session expires.

Inspect, as applicable:

- cookie `HttpOnly`, `Secure`, `SameSite`, `Domain`, `Path`, expiry, rotation, and credentials/CORS behavior;
- token storage and leakage risks;
- client hydration/initial-auth race and route guards;
- backend session/refresh persistence and revocation;
- CSRF protection and origin behavior;
- server/client clock and expiry handling;
- network requests, redirects, console errors, server logs, and session-store/database records.

Never expose actual token/cookie values in evidence. Write permanent regression tests for the refresh/session bug and every repaired root cause.

## Mandatory screen-by-screen browser/platform audit

For each inventory row and applicable role/state/locale/viewport:

1. navigate through the real supported entry path;
2. also test direct/deep-link access when supported;
3. verify the correct layout, navigation, title, status, data, permissions, and primary action at every supported responsive class;
4. confirm loading, populated, empty, no-results, validation, failure, success, restricted, stale/conflict, and offline/degraded states as applicable;
5. enumerate actual rendered interactive elements and reconcile them with the element inventory;
6. exercise each element under its meaningful enabled/disabled/visible conditions;
7. inspect immediate feedback, resulting state, destination, network, logs, and database effects;
8. reload at meaningful stable and in-progress points;
9. test browser/app back, forward, close/cancel, interruption, and resume behavior;
10. capture and visually inspect required screenshots at desktop, tablet/narrow, and mobile widths plus device orientation where applicable;
11. record PASS/FAIL/BLOCKED/NOT_APPLICABLE with test and evidence IDs;
12. fix and retest failures before marking the screen complete.

Use real browser automation for web surfaces. Use the appropriate simulator/emulator/device UI automation for native mobile/desktop/device applications. Unit tests or static code inspection alone cannot mark a user-facing screen complete.

Do not let an unguided crawler activate destructive or externally consequential controls. Execute them only as explicit test cases with isolated test data, expected outcomes, and rollback/cleanup.

## Mandatory UI-element and affordance audit

For every interactive element verify:

- it has a defensible user and business purpose, and its outcome has an accountable consumer;
- it is the right control for the task, choice count, frequency, risk, platform, and accessibility needs;
- visible label/icon/accessible name communicates the action;
- it appears and is enabled only in valid roles/states;
- hover/focus/pressed/selected/disabled/loading/error behavior is clear;
- click/tap/keyboard/gesture action works once and does not accidentally duplicate;
- success, failure, cancellation, and recovery are explicit;
- state, navigation, network, database, and cross-application effects match expectations;
- every affected upstream/downstream screen and role reflects the new state correctly;
- destructive actions have proportionate safeguards;
- high-frequency actions avoid unnecessary steps;
- no dead control or false affordance remains.

Do not add a tooltip to every control. Prefer a clear visible label. Use:

- tooltips for non-obvious icons, abbreviations, or concise supplemental meaning;
- inline helper text for formats, consequences, and complex fields;
- contextual notes/banners for cross-role/application ownership, delays, or limitations;
- confirmation dialogs for consequential actions, not routine harmless actions;
- onboarding/empty-state guidance only where first-time discovery genuinely needs it.

The interface must be understandable to a user who has not read the requirements document.

When an element is missing, misleading, inefficient, redundant, or uses the wrong control, do not merely report it. Perform the controlled optimization assessment, update requirements/design/SRS when behavior changes, implement the complete cross-layer correction, and rerun affected element, screen, flow, responsive, accessibility, localization, persistence, and regression tests.

## Mandatory validation audit

For every field/form/API mutation, test applicable classes:

- valid typical values;
- required/empty/null/missing values;
- whitespace-only and leading/trailing whitespace;
- minimum/maximum and just-inside/just-outside boundaries;
- invalid format/type/precision/length/range;
- Unicode and each approved writing system;
- duplicates and uniqueness races;
- conditional and cross-field rules;
- invalid lookup/entity references;
- inactive/deleted/stale referenced values;
- unauthorized/forbidden fields and over-posting;
- repeated/double submission and idempotency;
- concurrent update/version conflict;
- network timeout and partial failure;
- direct API bypass of client validation;
- persistence after validation failure and correction;
- localized error messages and focus/scroll to the first problem;
- file validation and safe handling where uploads exist.

Verify client UX, server enforcement, database integrity, error contract, logs, and final state. Error messages must explain what is wrong and how to fix it without leaking sensitive internals.

For every submitted field, prove the complete write/read round trip. Compare the UI input, outbound request, server-normalized value, committed database value, API read-back, refreshed UI value, downstream consumer view, and audit/history record where applicable. Detect silently dropped fields, ignored checkboxes, incorrect defaults, lossy conversions, incorrect null/clear behavior, stale cache responses, partial writes, and success messages shown before durable success.

A form may pass only when valid input is stored completely and exactly as intended, invalid input cannot bypass authoritative server/database rules, atomic failure leaves no corrupt partial state, and every committed value remains correct after refresh/relogin/restart as required.

## Mandatory end-to-end flow audit

Execute every inventoried flow from the real entry point through a terminal outcome:

```text
ENTRY
→ USER ACTION
→ SYSTEM FEEDBACK
→ DECISION/BRANCH
→ SUCCESS / ALTERNATE / FAILURE
→ PERSISTED FINAL STATE
→ NEXT AVAILABLE ACTION
```

For cross-application/role flows, verify every handoff:

- initiator action and waiting/status UX;
- receiver visibility, notification, and permitted action;
- accept/reject/fail/timeout/cancel behavior;
- synchronized state in every affected application;
- reconciliation after delay or temporary disagreement;
- final owner, acknowledgement, and next action.

No flow passes if it ends ambiguously, leaves an impossible state, requires undocumented manual repair, or works only without refresh/navigation.

## Business-quality and real-world behavior audit

For each subsystem/application and major flow:

- compare implementation with Functional Requirements, SRS business rules, lifecycle models, and accepted design;
- check that roles own the correct decisions and cannot perform invalid transitions;
- check source-of-truth ownership, status terminology, cancellation/reversal, history/audit, and downstream effects;
- identify missing behavior a mature real-world system normally needs to complete the declared capability;
- distinguish a clear conventional completion from an organization-specific policy decision;
- test realistic sequences, not isolated CRUD only;
- verify reports, notifications, dashboards, and cross-system statuses match actual persisted business outcomes.

Record every material business gap. Fix conventional, source-consistent defects. Ask only when a consequential policy cannot be responsibly inferred.

## Mandatory feature usefulness and end-to-end ownership audit

For every feature in `feature-and-outcome-inventory.md`:

1. verify the intended user can discover and start it;
2. verify it solves a real user goal and supports a declared or necessary business outcome;
3. verify every input has a defined source and every output has a destination and owner;
4. verify submitted or created data appears in the correct receiving dashboard, queue, detail view, report, notification, or downstream application;
5. verify the receiving actor can understand and take every required next action;
6. verify state/status changes synchronize across all producer and consumer surfaces;
7. verify success, alternate, rejection, failure, cancellation, reversal, retry, timeout, stale, concurrent, abandoned, and resumed paths where applicable;
8. verify history/audit and later retrieval make the outcome explainable;
9. evaluate whether the same result can be achieved with a shorter, clearer, safer interaction;
10. classify and complete any required defect, optimization, or formal requirement/design/SRS change.

Do not accept disconnected CRUD. Examples of failures include a public form whose record has no administrative destination, a dashboard action whose result never reaches the affected user, a status with no valid next action, a notification without a navigable target, or a setting that no consumer applies.

## UI/UX quality and shortest-safe-flow audit

For every screen and critical/high-frequency flow evaluate:

- clear purpose and one dominant primary action;
- plain, consistent terminology;
- correct UI-control selection;
- strong visual/information hierarchy;
- clean grouping, spacing, density, and readability;
- discoverable navigation and exits;
- visible status, ownership, dependencies, and next action;
- prevention of errors before submission;
- preservation of user context and input;
- useful empty/loading/error/success/recovery states;
- responsive/adaptive behavior;
- accessibility and keyboard/touch efficiency;
- minimum necessary user decisions and actions.

Count steps for critical flows. Remove redundant pages, clicks, confirmations, repeated data entry, modal detours, and choices the system can safely derive or remember. Do not remove necessary security, permissions, consent, destructive-action protection, or information needed for a confident decision.

If a behavior-preserving UX improvement is clear, document it, implement it, and rerun all affected tests/screenshots. If it changes business meaning or flow ownership, use the conflict policy.

## Dynamic database data and lookup audit

Inventory every business/domain dropdown, option set, category, reason, status catalogue, configurable setting, entity picker, public-page content record, navigation/content item, branding asset, contact/location value, operational value, and other end-user-visible data that the business is expected to maintain without a code change.

Verify:

- clients load values dynamically through the real authenticated backend;
- values originate from the authoritative database or approved external authority;
- no bundled UI arrays, local JSON, local-storage truth, fake runtime records, or duplicated entity lists are used as production truth;
- public and authenticated applications render real backend/database data rather than hard-coded cards, counters, tables, profiles, examples, contact details, hours, prices, content, or configuration;
- authorized users have a clear owning dashboard/settings/content-management surface for maintainable business data, with preview/publish or equivalent safety when appropriate;
- safe business lookups are editable by authorized users through the dashboard/owning area;
- unsafe system-fixed options are still represented as system-managed database rows, dynamically retrieved, visible read-only, and protected with a clear reason;
- code uses stable IDs/codes rather than localized display labels;
- migrations/startup checks prevent code-required codes and database catalogues from silently drifting;
- add/edit/translate/order/activate/deactivate/default behavior works where permitted;
- used values cannot be destructively removed in a way that breaks history;
- inactive historical values remain readable but are unavailable for new selection as specified;
- scope and isolation work by tenant/organization/location/application;
- cache invalidation/propagation updates every consumer without rebuild/redeployment;
- loading, empty, no-results, permission, failure, retry, stale, and pagination/search states work;
- localized labels and fallback work in every approved locale;
- audit history records authorized changes.

Static code constants are allowed only for genuine technical invariants that cannot validly vary at runtime. Record each exception with its reason and consumers. When the product requires such an invariant to be visible, represent it through the backend/database catalogue and show it read-only in the appropriate dashboard; do not duplicate its user-facing label across clients.

Prove editable lookup and maintained-content propagation with database, API/network, every consuming UI, cache invalidation, and refresh/restart evidence. Prove read-only mutation denial and catalogue visibility. Search production code and built assets for fixture/demo/fallback content and remove or isolate anything that could silently appear as real data.

## Multilingual and bidirectional audit

For every approved launch locale and application verify:

- language selection, persistence, and fallback;
- no mixed-language page caused by missing resources;
- navigation, fields, validation, statuses, lookup labels, notifications, templates, reports, exports, and generated documents are translated as required;
- stable internal codes remain language-neutral;
- dates, times, time zones, numbers, decimals, currency, units, names, addresses, and plural forms are locale-correct;
- Unicode input, storage, transport, retrieval, search, sorting, and export/import work;
- text expansion/contraction does not clip, overlap, hide, or break actions;
- RTL/LTR and mixed-direction layout, icons, navigation, tables, charts, forms, dialogs, gestures, focus order, and alignment work where applicable;
- fonts and accessibility semantics support the script;
- missing keys are detected, observable, and resolved through the specified fallback.

Capture final screenshots for every screen in each required locale/direction combination defined by the localization/device matrix. Use pseudo-localization/long strings as an additional stress test when supported, not as a replacement for actual approved translations.

## Technical runtime audit

### Browser/client

- no unexplained console errors, rejected promises, hydration failures, routing loops, memory leaks, or duplicate event handlers;
- requests are not unintentionally duplicated;
- loading/cancellation/race behavior is correct;
- caching and stale-data refresh are correct;
- refresh/deep-link/history behavior works;
- production build behaves consistently with development/test behavior.

### Network and interfaces

- expected method/path/status/payload and structured error contract;
- authentication/authorization and tenant/location context;
- validation and over-posting protection;
- timeout, retry, backoff, idempotency, duplicate delivery, and rate behavior;
- CORS/CSRF/cookie/header/cache behavior;
- pagination/filter/sort/search consistency;
- webhook/event signature, ordering, replay, and reconciliation where applicable;
- no sensitive data in URLs, errors, or unprotected responses.

### Server, jobs, and logs

- no unexplained exceptions, warnings, failed jobs, stuck queues, unhandled events, or repeated retries;
- request/job correlation and meaningful operational context;
- safe error messages and no secret/sensitive-data leakage;
- health/readiness and graceful dependency failure;
- scheduled/background behavior and retry/dead-letter/recovery where applicable.

### Database and persistence

For each tested mutation inspect before/after state where practical:

- expected rows/documents and relationships;
- constraints and transaction atomicity;
- lifecycle/status transition;
- tenant/location ownership;
- audit/history/outbox/event state;
- rollback after failure;
- duplicate/idempotent behavior;
- concurrency/versioning;
- soft-delete/archive/restore and historical references;
- migrations, indexes, defaults, nullability, and seed integrity;
- persistence across reload, application restart, and service restart as required.

Use isolated test data and save sanitized evidence queries/results.

### Infrastructure, deployment, and operational readiness

Verify and repair, where applicable:

- reproducible clean installation, build, startup, migration, seed/bootstrap, and test commands;
- environment-variable contracts, secret injection, safe defaults, and environment parity;
- frontend/backend/database/cache/queue/storage/proxy wiring and service startup order;
- production-mode builds, static assets, routing/deep links, HTTPS/cookie behavior, CORS/CSRF origins, and reverse-proxy headers;
- forward- and rollback-safe migrations, required backfills, compatibility during rollout, and restart behavior;
- health/readiness checks, graceful startup/shutdown, dependency degradation, retries, and recovery;
- backup/restore and data-retention procedures where required by the SRS;
- CI/CD gates for build, lint/type/static checks, tests, migrations, security checks, and artifact integrity;
- logs, metrics, traces, correlation IDs, alerts, and actionable diagnostics without sensitive-data leakage;
- runbooks and release documentation sufficient for another authorized operator to deploy, verify, recover, and resume safely.

Do not mark operational readiness passed based only on development mode. Exercise the closest safe production-like build and deployment path available, and save the commands, sanitized outputs, version identifiers, and health evidence.

## Security and privacy audit

Test safely within the authorized non-production environment:

- authentication, session management, logout, reset/recovery, and revocation;
- horizontal and vertical authorization;
- tenant/location/data isolation;
- direct API access independent of UI hiding;
- input, query, file, and output handling;
- CSRF/CORS/cookie/token/storage protections;
- rate/abuse protections where required;
- sensitive data exposure in UI, network, logs, errors, exports, and screenshots;
- secrets/configuration handling;
- dependency and static security scans;
- privacy/consent/retention/export/deletion behavior required by the SRS;
- auditability of sensitive actions.

Do not perform intrusive testing against third-party or production systems. A hidden button is never an authorization control.

## Accessibility, responsive, device, and resilience audit

Verify applicable:

- semantic names/roles/states and screen-reader announcements;
- keyboard-only flow, logical focus order, focus visibility, focus trapping/restoration, skip behavior, and no keyboard traps;
- contrast, zoom/reflow, text scaling, reduced motion, target size, and non-color status communication;
- required viewport breakpoints, orientation, safe areas, virtual keyboard, touch/gesture, and native back behavior;
- every supported screen and overlay at compact mobile, large mobile, tablet/narrow desktop, standard desktop, and wide desktop classes as applicable—not only representative home screens;
- no clipped, overlapping, off-canvas, unreachable, undersized, or unexpectedly horizontally scrolling content; tables/forms/navigation must adapt without hiding required actions or context;
- slow network, offline/intermittent network, unavailable dependency, retry, and recovery;
- large realistic datasets, pagination/virtualization, empty data, and degraded performance;
- concurrent users/tabs, stale state, background/resume, and interrupted workflows.

Use automated accessibility checks plus keyboard/manual/assistive-semantic inspection; automation alone is insufficient.

## Screenshot, trace, and evidence protocol

For every user-facing screen, capture at least:

- one final normal/populated state for each required role variant;
- every materially distinct empty, error, restricted, loading, conflict, success, offline/degraded, or responsive state;
- every required launch locale/direction and target viewport/device combination from the matrix;
- critical before/decision/after checkpoints for multi-step flows.

Name evidence with stable IDs, for example:

```text
APP-SCREEN__ROLE__STATE__LOCALE__VIEWPORT__TEST-ID.png
FLOW-ID__STEP-03__OUTCOME__TEST-ID.png
```

Visually inspect screenshots—do not merely capture them. Check hierarchy, correctness, clipping, overflow, overlap, spacing, density, alignment, readability, status, required actions, translations, RTL/LTR, data realism, and consistency with the accepted design.

Use browser traces/videos selectively for complex failures. Save sanitized network/console/log/database evidence linked to TEST and DEFECT IDs. Do not treat screenshots as proof of backend behavior.

## Defect and optimization lifecycle with mandatory fix loop

Before changing code for a discovered defect, add or update a defect record:

```text
DEFECT-ID
Title and severity
Applications/screens/flows/roles/locales affected
FR/SRS/design/runtime IDs
Environment and source revision
Reproduction steps
Expected versus actual behavior
Evidence
Root-cause hypothesis
Planned fix and affected files/layers
Regression risk and required tests
Status
```

For a non-defect optimization, create or update an `OPT-...` record before implementation. Include user value, business value, current problem, `KEEP/FIX/REPLACE/ADD/REMOVE/NEEDS_DECISION`, alternatives, affected layers and consumers, whether a CR is required, data migration/backfill implications, acceptance scenarios, regression scope, evidence, and status. Link an optimization to a formal CR whenever it changes accepted behavior or documentation.

Then execute:

```text
REPRODUCE
→ DOCUMENT PLANNED CHANGE
→ ADD/IMPROVE FAILING TEST WHEN PRACTICAL
→ IDENTIFY ROOT CAUSE ACROSS UI/API/DATABASE/CONFIGURATION
→ IMPLEMENT THE COMPLETE FIX
→ RUN TARGETED TESTS
→ VERIFY NETWORK/LOG/DATABASE EFFECTS
→ RECAPTURE AND INSPECT UI EVIDENCE
→ RUN AFFECTED FLOW AND REGRESSION TESTS
→ UPDATE TRACEABILITY, DEFECT/OPTIMIZATION/CR, QUEUE, AND CHECKPOINT
```

Fix root causes, not symptoms. Do not:

- disable validation or authorization;
- catch and hide errors without recovery;
- hard-code test values or business options;
- replace backend behavior with frontend-only state;
- loosen assertions;
- delete failing tests;
- update expected screenshots to accept a defect;
- mark an untested fix as resolved.

If one fix affects shared components, authentication, schemas, lookups, localization, or APIs, identify and retest every consumer.

## Checkpoint policy for long-running work

Create a checkpoint:

- after environment/inventory initialization;
- after each coherent screen or small screen cluster;
- after each major flow cluster;
- before and after shared/risky fixes;
- after every completed application/surface;
- before an expected context/session boundary;
- immediately when blocked;
- before final regression.

Each checkpoint must contain:

- checkpoint ID and timestamp/repository revision;
- source/environment hashes;
- active/just-completed queue item;
- screens/elements/fields/flows tested in this interval;
- defects opened/fixed/retested;
- optimizations and CRs opened/implemented/retested/aligned;
- files/migrations/configuration changed;
- exact commands and summarized results;
- screenshot/network/log/database evidence paths;
- coverage totals and remaining IDs;
- open blockers/risks;
- exact next safe action and required context.

Write checkpoint/control-file updates atomically when possible. Do not mark an item `COMPLETED` until its evidence is saved.

If execution must end because of a platform/context/time limit, checkpoint first and return a concise `IN_PROGRESS — RESUME REQUIRED` handoff. A new chat can run this same prompt with `RESUME`.

## Regression strategy

During repair:

- run targeted tests after each change;
- run all affected component/service/flow tests after shared changes;
- maintain a permanent browser E2E suite for critical and repaired flows;
- add regression tests for every reproducible defect where practical;
- rerun application-level suites after completing each application;
- run the full project quality/regression suite after all inventory items pass;
- rerun the full suite after any fix made during final regression.

A prior pass becomes stale when its source, shared dependency, schema, configuration, localization, lookup, role policy, or environment changes. Mark impacted coverage for retest.

## Stage 7 completion gates

Do not mark Stage 7 complete until all applicable gates pass:

### Inventory and traceability

- every application/surface and actor/role is inventoried;
- every declared and discovered feature is mapped to a valid user goal, business purpose, producer, consumer, persisted outcome, and terminal next action;
- every documented and code/runtime-discovered screen is reconciled;
- every meaningful interactive element and field is inventoried;
- every documented and independently derived flow/state is inventoried;
- every interface/job/database/lookup/localization responsibility is mapped;
- specification → code → runtime → test → evidence coverage is complete;
- code/runtime → purpose/source → test coverage is complete.
- every approved in-scope CR is `VERIFIED` or `CLOSED`, and every affected baseline-alignment row is `ALIGNED`.
- every optimization record is resolved, implemented and verified, rejected with evidence, or explicitly blocked by a documented decision; no material `NEEDS_DECISION` item remains hidden.

### Functional and business behavior

- all inventoried main/alternate/failure/recovery/permission/concurrency/interruption branches pass;
- no known dead, ambiguous, or impossible flow remains;
- no orphan submission, invisible result, ownerless queue/status, unconsumed output, or disconnected feature remains;
- cross-role/application states and handoffs reconcile;
- lifecycle and business rules match persisted results;
- refresh, navigation, restart, and resume do not lose committed state.

### Authentication

- login persists across every required refresh/restart scenario;
- expiry/refresh/revocation/logout and route/API protection pass;
- role and tenant/location isolation pass;
- no known session/token/cookie defect remains.

### UI/UX

- every screen is usable without reading the requirements;
- every interactive-looking element has valid behavior;
- every retained, added, replaced, or removed control has a verified user/business purpose and impact assessment;
- control choice is appropriate for task, risk, frequency, platform, accessibility, and responsive context;
- critical flows use the shortest safe clear path;
- statuses, ownership, consequences, errors, recovery, and next actions are clear;
- every supported screen/state is visually and functionally correct across its required viewport/device/orientation matrix;
- no known dead control, broken navigation, misleading affordance, clipped/overlapping/off-canvas layout, unreachable action, unexpected overflow, untranslated content, or unresolved material UX defect remains.

### Validation and data

- all field validation classes and server/database enforcement pass;
- every submitted field has a verified UI-to-request-to-domain-to-database-to-read-back mapping with no silent loss, unintended default, precision/locale conversion error, or premature success;
- business data and dropdown/option values are dynamically database-backed as required;
- maintainable public and authenticated content/configuration has an authorized backend owning surface and propagates to every consumer without code edits or redeployment where required;
- editable and read-only lookup behavior, propagation, history, localization, and permissions pass;
- refresh/restart persistence, transactions, integrity, and audit behavior pass;
- no production behavior depends on fake/static runtime data.

### Technical quality

- required builds, lint/type/static, unit, component, integration, contract, E2E, accessibility, and security checks pass;
- no unexplained browser console, network, server-log, worker/job, or database errors remain;
- no open known in-scope defect remains;
- no approved in-scope optimization or requirement/design correction remains partially implemented or untested across affected frontend, backend, database, DevOps/configuration, documentation, and consumers;
- no `BLOCKED`, `FAILED`, or unjustified `NOT_APPLICABLE` coverage row remains;
- no approved in-scope change remains only in code or missing from affected requirements/design/SRS/tests;
- final full regression passes after the last fix;
- run/test/setup documentation and resume history are accurate.

If a required external dependency prevents a gate, report `BLOCKED` with completed internal evidence. Do not downgrade or erase the gate.

## Final reconciliation and output

After the completion gates pass:

1. rerun inventory extraction/search to detect newly added or previously missed routes/elements/flows;
2. reconcile all matrices and ensure totals agree;
3. verify no open defects, unresolved material optimizations, incomplete CR propagation, or stale test results remain;
4. run final full regression and critical authentication/session flows;
5. inspect final representative screenshots and all required screen evidence;
6. update `final-report.md`, `current-state.md`, `work-queue.md`, `defects.md`, global recovery/alignment state, applicable CR records/`CHANGELOG.md`, `session-log.md`, and `latest_system_validation` in the project manifest with the final report path and verified source revision;
7. mark Stage 7 `COMPLETED` only after evidence is durable.

The final user handoff must be concise and include:

- verified applications, roles, features, screens, elements, fields, flows, locales, viewports/devices, and environments;
- final coverage counts and matrix path;
- tests and full-regression result;
- authentication/session result;
- defects found/fixed, optimizations completed, requirements/design/SRS changes propagated, and confirmation that no known reproducible in-scope defect remains;
- screenshot, network/log, database, accessibility, and security evidence paths;
- any explicitly excluded scope or external limitation;
- run and future-regression instructions.

The final status must state whether the system is `END-USER RELEASE-READY` for the verified scope. Do not use unsupported phrases such as “perfect,” “guaranteed zero bugs,” or “tested everything” without the exact inventory, matrices, environments, and evidence that define what was tested.
