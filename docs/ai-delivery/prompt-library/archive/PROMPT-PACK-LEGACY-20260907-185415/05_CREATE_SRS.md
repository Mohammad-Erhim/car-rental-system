# Prompt — Create the Software Requirements Specification (SRS)

## Role

You are a senior Software Requirements Specification author, systems analyst, solution architect, security and quality specialist, and traceability auditor.

Create one implementation-ready Software Requirements Specification from three inputs:

1. the latest accepted Functional Requirements;
2. the latest accepted UI/UX Design and Flow Plan;
3. an optional user description containing additions, clarifications, constraints, or technology preferences.

The output is one standalone Markdown SRS file.

## Inputs

```text
<FUNCTIONAL_REQUIREMENTS>
{{LATEST_ACCEPTED_FUNCTIONAL_REQUIREMENTS_MD_OR_PATH}}
</FUNCTIONAL_REQUIREMENTS>

<UI_UX_DESIGN_PLAN>
{{LATEST_ACCEPTED_UI_UX_DESIGN_PLAN_MD_OR_PATH}}
</UI_UX_DESIGN_PLAN>

<OPTIONAL_USER_ADDITIONS>
{{OPTIONAL_DESCRIPTION_ADDITIONS_CONSTRAINTS_OR_EMPTY}}
</OPTIONAL_USER_ADDITIONS>
```

If explicit paths are absent and filesystem access exists, resolve `latest_functional_requirements` and `latest_ui_ux_design_plan` from `docs/ai-delivery/manifest.md`. Read the complete selected versions. Do not use older chat copies.

## Objective

Produce a coherent specification that tells an implementation team:

- what must be built;
- how the user-facing experience must behave;
- what applications/surfaces and system components are within scope;
- how frontend, backend, data, integrations, permissions, and operational behavior fit together;
- what qualities and constraints must be met;
- how each requirement, screen, state, and flow will be verified;
- how the system can be implemented in dependency-aware stages without losing end-to-end behavior.

This SRS must preserve full traceability to the supplied Functional Requirements and UI/UX Design Plan. Do not copy the documents mechanically; reconcile them into one consistent implementation baseline.

## Input authority and conflict resolution

Use this authority model:

1. Explicit, unambiguous user additions define the newest requested scope or constraint.
2. Functional Requirements define required business behavior.
3. The UI/UX Design Plan defines the intended user-facing interaction and presentation of that behavior.
4. Reasonable standards and domain inference may fill implementation-level gaps without changing business policy.

Before writing the SRS, build an internal conflict table and inspect every cross-reference.

When a conflict is safely resolvable:

- preserve the newest explicit user intent;
- preserve valid business behavior;
- correct or normalize the lower-authority interpretation;
- make the SRS internally consistent;
- record any important resolved assumption in the SRS's Assumptions and Constraints section, not in a separate report.

If a material conflict has multiple plausible resolutions that would change business behavior, security, compliance, cost, or system scope, ask the smallest necessary clarification and stop before generating the SRS. Do not silently choose an arbitrary policy.

If the optional description is empty, proceed without inventing missing user preferences.

## Latest-version validation

Before authoring:

- verify the exact version/path of both source documents;
- verify they are the current accepted versions in the manifest when a manifest exists;
- reject accidental mixing of superseded and latest documents;
- detect references to missing IDs or design objects;
- ensure the design covers the requirements baseline;
- resolve non-material terminology differences consistently.

Record the exact source versions in the SRS Document Control section.

## SRS scope

The SRS should be sufficiently detailed for full implementation, including frontend, backend, persistence, integrations, identity/access, operational behavior, quality controls, and verification as relevant to the project.

Do not turn the SRS into source code. Short interface examples, formulas, data constraints, or pseudocode may be used only when they remove ambiguity and remain technology-appropriate.

## Required specification areas

### 1. System context and scope

- purpose, goals, boundaries, in-scope/out-of-scope items;
- applications/surfaces and their actors;
- functional areas and cross-cutting capabilities;
- external systems/parties and responsibility boundaries;
- operating environments and device/form-factor constraints.

### 2. Functional behavior

- preserve every FR ID and its meaning;
- connect requirements to user-facing and background behavior;
- define triggers, preconditions, decisions, results, states, failures, recovery, cancellation, reversal, and cross-application effects;
- describe business rules and lifecycle transitions precisely.

### 3. UI/UX implementation requirements

- preserve and reference APP, SCREEN, COMPONENT, ELEMENT, FLOW, and STATE IDs;
- specify navigation and interaction behavior without duplicating the whole design document;
- define required states, validation, feedback, accessibility, responsive/adaptive behavior, and cross-application handoffs;
- retain the exact flow intent and closed outcomes from the accepted design.

### 4. System decomposition and responsibilities

Define logical system components and responsibility boundaries needed for implementation. Distinguish:

- user-facing clients/applications;
- backend/application services;
- persistence and file/object storage where relevant;
- background processing and scheduled work;
- real-time communication where relevant;
- identity, authentication, authorization, and tenant/location boundaries;
- notifications and messaging;
- third-party integrations;
- administrative and support capabilities;
- observability and operational controls.

Do not create artificial microservices. Choose boundaries that match scale, domain cohesion, team/project constraints, and the existing repository when one exists.

### 5. Data requirements

For important entities define:

- stable SRS data/entity IDs;
- purpose and ownership/source of truth;
- important attributes and constraints;
- relationships;
- lifecycle/state model;
- uniqueness, duplication, and idempotency rules;
- validation and integrity rules;
- history/audit needs;
- retention/deletion/export needs when relevant;
- privacy classification and access boundaries;
- concurrency and conflict behavior;
- migration/import requirements when relevant.

Use logical data definitions. Include physical schema detail only when a technology constraint or ambiguity makes it necessary.

### 5A. Reference/lookup and configurable-choice requirements

Create a complete inventory of business-facing option sources used by forms, filters, classifications, reasons, categories, statuses, routing, templates, and rules. Assign stable `LOOKUP-...` IDs and classify each source as:

- configurable business lookup;
- constrained lookup with only safe attributes editable;
- system-fixed invariant required by lifecycle logic, security, standards, or interface contracts, represented by system-managed database rows and read-only management behavior;
- externally managed/synchronized reference;
- entity-owned data selected from the owning domain.

“No static data” means no hard-coded production business options, organization-specific choices, lookup labels, configurable policies, or fake/sample records embedded in UI or business logic. Every business/domain dropdown and option list—including read-only system-fixed lists—must be represented in the authoritative database and retrieved dynamically through authenticated backend interfaces. Bundled UI arrays, local JSON files, and browser/device local storage must not become the production source of truth. Caches/read models may be used only as derived data with correct invalidation and reconciliation.

This does not prohibit true source-code constants such as protocol identifiers, route names, mathematical constants, or design tokens that are not business option lists. When application logic requires a closed set of stable domain/state codes, code may validate those codes, but the database must contain the system-managed catalogue rows and localized display metadata used by clients. The dashboard must show them read-only with a clear reason. Define startup/migration integrity checks so code contracts and database rows cannot drift silently.

For persisted/configurable reference data, specify:

- source of truth, stable non-localized code, localized labels/descriptions, scope, owner, and ordering;
- active/inactive and effective-date behavior where relevant;
- add/edit/translate/reorder/activate/deactivate/default operations;
- role/permission and tenant/location boundaries;
- uniqueness, validation, referential integrity, and concurrency controls;
- audit history and attribution;
- safe use/deactivation when referenced by historical records;
- cache/read-model invalidation and propagation to every consuming application;
- import/export/sync behavior where relevant;
- fallback behavior when a value or translation is unavailable;
- API/interface access and filtering for dynamic selectors.
- database schema/migration/seed behavior, with seed data limited to approved initial values and all later runtime changes persisted normally;
- authenticated backend retrieval rather than direct client ownership of business truth.

Specify a professional Reference Data/Lookup catalogue and management interface consistent with the accepted design. Authorized users must be able to discover all lookup types, view values and usage, understand owner/source/scope/editability, and manage every value that is safe to change. Read-only is permitted only with a documented integrity, security, standards, or integration reason. Entity-owned records must be managed in their owning module and referenced dynamically rather than duplicated.

### 5B. Multilingual and localization requirements

Define the system-wide internationalization/localization baseline:

- approved launch languages/locales, default locale, user preference, and fallback chain;
- no hard-coded user-facing text in production application code where localization applies;
- stable translation keys and resource ownership/workflow;
- translation of UI labels, validation, statuses, lookup labels, notifications, emails/messages, templates, reports, exports, and generated documents;
- localized domain content and per-language authoring/publishing rules where required;
- Unicode storage, transport, input, normalization, validation, indexing, search, and sorting requirements;
- locale-aware date, time, time-zone, number, decimal, currency, unit, name, address, and pluralization behavior;
- right-to-left/left-to-right rendering, mixed-direction content, mirroring rules/exceptions, fonts, icons, tables, charts, forms, navigation, and focus order;
- server/client responsibility: machine-stable codes and structured errors remain language-neutral, while presentation resolves localized messages;
- missing/invalid translation detection, fallback, monitoring, and release checks;
- localized reference-data model using stable internal codes independent of display labels.

If exact launch languages are not supplied, specify an extensible architecture and require confirmation of the initial locale list before completing user-facing release content. Do not invent translations or silently make the implementation English-only.

### 6. Interfaces and integrations

For each internal or external interface define:

- interface ID and purpose;
- producer/consumer;
- operations/events;
- input/output contract at a suitable level;
- authentication/authorization;
- validation;
- idempotency and duplicate handling;
- timeout, retry, backoff, and circuit/degraded behavior where relevant;
- error mapping and user-visible effects;
- rate/volume assumptions when known;
- observability and reconciliation;
- versioning/compatibility expectations.

Do not invent provider-specific details unless supplied or strongly justified.

### 7. Security, privacy, and compliance

Define verifiable requirements for:

- authentication and session behavior;
- role/permission enforcement on client and server boundaries;
- least privilege and separation of duties;
- tenant/location/data isolation where relevant;
- input validation and output handling;
- secrets and credential handling;
- encryption in transit/at rest where appropriate;
- auditability and sensitive-action history;
- privacy, consent, retention, export, and deletion where relevant;
- abuse prevention and rate limiting where relevant;
- secure failure behavior;
- dependency and vulnerability management;
- backup, recovery, and incident-relevant evidence.

Only state legal/compliance obligations that are supplied or confidently applicable. Mark jurisdiction-dependent policies as configurable/confirmable rather than inventing them.

### 8. Quality attributes

Turn vague goals into measurable or verifiable requirements where evidence permits:

- performance and responsiveness;
- availability and graceful degradation;
- scalability/volume assumptions;
- reliability, idempotency, and recovery;
- accessibility;
- browser/device/platform compatibility;
- maintainability and modularity;
- observability/logging/metrics/tracing;
- localization/time-zone/currency behavior;
- offline/intermittent-connectivity behavior where relevant;
- backup/restore and disaster recovery;
- data integrity and consistency.

Do not invent arbitrary numeric targets. If a target is necessary but not supplied, define the measurement and configuration/acceptance process instead of fabricating a number.

### 9. Error, recovery, and concurrency behavior

Specify how the system handles:

- validation and business-rule rejection;
- unavailable dependencies;
- partial writes or partial workflow completion;
- retries and duplicate requests;
- concurrent edits and stale state;
- interrupted sessions;
- eventual consistency and reconciliation;
- cancellation/reversal;
- failed notifications or handoffs;
- safe user feedback without leaking sensitive technical information.

### 10. Verification and acceptance

Assign stable verification IDs such as `AC-...` and `TEST-...` as appropriate. Define:

- acceptance criteria tied to FR/SRS/design IDs;
- unit/component expectations;
- service/API and integration expectations;
- persistence/data-integrity checks;
- end-to-end flow tests;
- permission and negative tests;
- security checks;
- accessibility checks;
- responsive/device/platform checks;
- screenshot/visual review requirements for UI states and critical flow checkpoints;
- network/console/log checks;
- database state verification using safe test data;
- recovery, concurrency, and external-failure tests.
- UI-control fitness and critical-flow usability reviews;
- dynamic lookup catalogue, permissions, CRUD/deactivation, propagation, localization, and historical-reference tests;
- static analysis/audit for hard-coded production business option lists and unlocalized user-facing text;
- language switching, preference, fallback, formatting, Unicode, search/sort, text expansion, and RTL/LTR screenshot/flow tests for every approved launch locale.

Acceptance criteria must be observable and unambiguous.

### 11. Dependency-aware implementation guidance

Provide constraints for later roadmap creation, not a rigid calendar. Identify:

- shared foundations;
- source-of-truth domains;
- dependency relationships;
- critical end-to-end vertical slices;
- applications/surfaces that depend on shared services;
- integrations or data migrations that gate later work;
- recommended implementation sequencing principles;
- stage-level verification expectations.

Favor a minimum shared foundation followed by testable vertical slices. Avoid building every technical layer in isolation before any end-to-end behavior works.

## ID and traceability rules

- Preserve all stable source IDs when meanings remain unchanged.
- Assign `SRS-...` IDs to technical/system requirements.
- Never reuse an ID for a different meaning.
- Every FR must map to one or more SRS requirements and verification items.
- Every user-facing FR must map to appropriate design IDs.
- Every major FLOW must map to SRS behavior and verification.
- Every significant SRS requirement must trace back to a source requirement/design need, explicit user addition, or justified quality/operational obligation.
- Every `LOOKUP-...` source must map to its data owner, management/view surface, consumers, localization behavior, and verification.

## Mandatory two-way audits

Before output, verify:

1. Functional Requirements → SRS: every FR is implemented by sufficient SRS content.
2. Design → SRS: every APP/SCREEN/FLOW/STATE and important interaction has implementation requirements.
3. SRS → source: every major SRS obligation has a valid source or clearly justified system-quality basis.
4. Flow consistency: SRS states, interfaces, persistence, and error behavior support each accepted flow.
5. No contradictions: terminology, permissions, status models, data ownership, and cross-application behavior agree.
6. Verification: every important obligation has an acceptance or test path.

Target 100% traceability against the declared source baseline. Do not claim this proves that no unknown future requirement or defect exists.

## Required document structure

Use a professional structure such as:

1. Document Control and Source Baseline
2. Purpose, Scope, and Definitions
3. System Context
4. Applications, Actors, and External Parties
5. Assumptions, Constraints, and Resolved Input Decisions
6. Functional Requirements Reference
7. UI/UX and Flow Implementation Requirements
8. Logical System Components and Responsibilities
9. Data Requirements and State Models
10. Reference/Lookup Data and Configuration Governance
11. Multilingual, Localization, and Bidirectional Requirements
12. Interfaces, Events, and Integrations
13. Authentication, Authorization, Security, Privacy, and Compliance
14. Error, Recovery, Concurrency, and Reconciliation
15. Quality Attributes
16. Observability and Operational Requirements
17. Verification and Acceptance Criteria
18. Dependency and Implementation-Sequence Constraints
19. Requirements Traceability Matrix
20. Design and Flow Traceability Matrix
21. Lookup and Localization Traceability Matrix
22. Verification Coverage Matrix

Required matrix examples:

| FR ID | SRS ID(s) | APP/SCREEN/FLOW/STATE IDs | Acceptance/Test IDs | Covered |
|---|---|---|---|---|

| Design/FLOW ID | Related FR IDs | SRS ID(s) | Acceptance/Test IDs | Covered |
|---|---|---|---|---|

| LOOKUP ID | Classification | Source/Owner | Scope/Editability | Consumers | Localization | Management/View Surface | Test IDs |
|---|---|---|---|---|---|---|---|

| Locale/Language | Applications/Outputs | Resource/Content Owner | Fallback | RTL/LTR | Formatting/Search Rules | Test/Screenshot IDs | Covered |
|---|---|---|---|---|---|---|---|

## File and version behavior

If filesystem access exists:

1. Save the SRS as `docs/ai-delivery/03-srs/srs-v1.0.md`, or the next unused logical version.
2. Record exact source paths and versions inside the SRS.
3. Update `latest_srs` in `docs/ai-delivery/manifest.md` only after validation and file completion.
4. Do not overwrite an accepted SRS.

If filesystem access does not exist, return the complete SRS and its intended path.

## Output rule

Output exactly one complete Markdown SRS and its saved path when applicable. Do not output a separate analysis report, score, changelog, or implementation code.
