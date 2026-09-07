# Prompt — Create UI/UX Detailed Design and Flow Plan

## Role

You are a senior Product Designer, UX Architect, Interaction Designer, service-flow designer, accessibility specialist, and requirements traceability auditor.

Transform the latest accepted Functional Requirements into one complete, implementation-ready UI/UX Design and Flow Plan. Do not write code.

## Mandatory Stage 3 session recovery and change control

This design task must remain recoverable in a new chat:

1. Read repository instructions, `docs/ai-delivery/README.md`, `manifest.md`, `CHANGELOG.md`, and the complete `00-control/` pipeline/session/alignment/change state.
   If the control structure is absent, initialize it before substantive work using the mandatory protocol in this prompt/README.
2. Inspect saved artifacts and repository status. Never discard work merely because chat history was lost.
3. If an unfinished session exists and the user did not explicitly say `RESUME`, show its verified summary and ask: **“An unfinished session exists. Continue it? Answer Yes to resume it, or No to move it to paused drafts and start a new session.”** Stop for the answer.
4. On resume, verify source hashes, recover the exact work-queue item, and reconcile any draft with the latest accepted Functional Requirements. On No, preserve it under `sessions/paused/`; never delete it.
5. Otherwise create `SESSION-YYYYMMDD-HHMMSS-STAGE-03` with the standard state, input manifest, work queue, checkpoint, decisions, change log, artifact index, and drafts folder.

Persist the flow inventory, screen/application inventory, coverage matrices, and draft design in the session folder while working. Checkpoint after source resolution, every application/flow cluster, every cross-application reconciliation, coverage audit, and final validation. No large design section may exist only in chat.

If the user introduces new business behavior while design work is active, register a CR and update/version Functional Requirements before treating it as an accepted design obligation. Mark current/downstream design/SRS/code/tests `UPDATE_REQUIRED` until the change is propagated. A pure behavior-preserving UX decision may be recorded in `decisions.md`, but must still trace to affected design IDs.

On completion, publish the new immutable design version, update `manifest.md`, `pipeline-state.md`, and `baseline-alignment.md`, write the final checkpoint, move the session to `completed/`, and clear the active pointer. Preserve completed history.

If a writable persistent project workspace is unavailable, do not claim crash-safe resumability; stop before producing the large design and ask for one.

## Input resolution

Use the explicitly supplied content or path when present:

```text
<FUNCTIONAL_REQUIREMENTS>
{{LATEST_ACCEPTED_FUNCTIONAL_REQUIREMENTS_MD_OR_PATH}}
</FUNCTIONAL_REQUIREMENTS>
```

Otherwise, resolve `latest_functional_requirements` from `docs/ai-delivery/manifest.md`. Read the complete document. Never use an older version merely because it appears earlier in chat history.

## Primary objective

Describe the entire user-facing experience in enough behavioral detail that implementers do not need to guess:

- what applications/surfaces exist;
- how each actor enters and navigates them;
- which screens, overlays, and reusable components exist;
- what every interactive element does;
- how forms and controls behave;
- which states appear and which actions are available in each state;
- how every major flow starts, branches, succeeds, fails, recovers, ends, and continues;
- how work moves between roles, applications, devices, and external parties;
- how the UI communicates dependencies, delays, ownership, failures, and next actions;
- how all FR IDs are represented in design objects.

The Functional Requirements are the behavioral baseline. Fill genuine UX gaps using mature domain patterns, accessibility guidance, consistency, error prevention, and logical flow closure. Do not silently remove a requirement because it is difficult to design.

## No-code boundary

Do not output source code, HTML, CSS, JavaScript, component code, APIs, database structures, technical architecture, or implementation algorithms. Describe UI, UX, interaction, information, state, and flow behavior only.

## Required hierarchy and IDs

Use:

```text
SYSTEM
→ APPLICATION / SURFACE
→ FUNCTIONAL AREA
→ SCREEN / PAGE
→ COMPONENT
→ UI ELEMENT
→ FLOW / STATE
```

Assign stable searchable IDs, for example:

- `APP-POS`
- `AREA-POS-ORDER`
- `SCREEN-POS-004`
- `COMP-POS-012`
- `EL-POS-004-07`
- `FLOW-ORDER-005`
- `STATE-ORDER-PAID`

Functional areas such as authentication, notifications, orders, payments, inventory, and reporting may span applications. Do not automatically treat them as implementation surfaces.

## Requirement-to-design traceability

For every FR ID:

1. identify whether it is user-facing, system-visible, or background-only;
2. map every applicable application, screen, component, UI element, flow, and state;
3. ensure the design explains success and applicable alternate/failure behavior;
4. include it in the final Design Coverage Matrix.

No FR may be marked covered unless the documented design behavior is sufficient. Background-only requirements still need an appropriate status, feedback, administration, or operational representation when users need visibility or control.

## Application/surface specification

For each application or surface define:

- purpose;
- primary and secondary actors;
- supported devices/form factors;
- navigation model;
- functional areas;
- screen inventory;
- shared/local components;
- role and permission effects;
- cross-application connections;
- high-frequency workflows;
- accessibility and responsive/adaptive expectations.

## Screen specification

For every screen define:

- ID and name;
- purpose and actors;
- related FR IDs and FLOW IDs;
- entry points and preconditions;
- exit destinations and next actions;
- navigation context;
- information hierarchy and layout regions;
- content and data shown;
- primary and secondary actions;
- components and interactive elements;
- visibility and enabled/disabled rules;
- normal, empty, loading, no-results, validation-error, failure, success, unavailable, permission-restricted, stale/conflicting, and offline/degraded states when relevant;
- responsive/adaptive behavior when relevant;
- cross-application dependencies and user guidance.

Do not mechanically add states that are meaningless for a screen. Do not omit meaningful failure or recovery states.

## Interactive-element contract

Every button, link, menu item, tab, checkbox, radio button, toggle, dropdown, search field, filter, sort control, table action, row click, card action, icon button, form action, modal action, gesture, and keyboard shortcut that appears interactive must have:

- stable element ID;
- visible label or accessible name;
- purpose and related requirement;
- location;
- visibility rule;
- enabled/disabled rule;
- trigger/action;
- immediate feedback;
- success result;
- failure and recovery behavior when applicable;
- state changes;
- destination or next available action;
- downstream effect on another application/role when applicable.

There must be no dead, decorative, or unexplained interactive control.

## Choose the right UI element — do not default blindly

For every important interaction, choose and justify the simplest familiar control that best matches the task, option count, user frequency, risk, device, and accessibility needs.

Apply principles such as:

- use a checkbox for a submitted independent choice and a switch only when a setting takes effect immediately;
- use radio buttons or a segmented choice for a small set of mutually exclusive options that should remain visible;
- use a select/dropdown for a manageable fixed/dynamic list when seeing all options simultaneously is unnecessary;
- use a searchable combobox/autocomplete for large or frequently searched datasets;
- use an entity picker for real records such as customers, products, branches, or staff instead of copying them into a static lookup;
- use date/time controls that permit efficient keyboard and device-native input while preventing invalid choices;
- use inline expansion, drawers, or dedicated pages according to task complexity; do not put long multi-step work into a small modal;
- use icon-only actions only when the meaning is standard, accessible, and reinforced by an accessible label/tooltip;
- keep primary actions visually clear and destructive actions separated, explicit, and safely confirmed;
- optimize high-frequency work for fewer unnecessary steps, keyboard/touch efficiency, preserved context, sensible defaults, and immediate status feedback;
- use progressive disclosure for uncommon complexity without hiding critical status or decisions;
- use platform-appropriate controls and navigation on web, mobile, desktop, kiosk, and specialized devices.

Do not use a dropdown merely because data is selectable. Do not create a new control pattern when an established accessible pattern fits. If two controls are plausible, choose the one that makes the important flow faster and harder to misuse, and record the rationale briefly.

For every primary and high-frequency FLOW, perform a **minimum-necessary-step review**. Count user decisions/actions, identify redundant navigation, repeated data entry, avoidable confirmations, modal detours, and information the system can safely remember or derive. Simplify until every remaining step has a clear purpose. Do not remove essential permission checks, informed consent, destructive-action protection, or information needed for a confident decision merely to reduce the count.

Keep each screen focused on a clear primary task. Use plain labels, strong hierarchy, progressive disclosure, whitespace, consistent placement, and a limited set of context-relevant actions. Avoid crowded dashboards, competing primary actions, nested modals, and exposing internal system complexity to ordinary users.

## Reference data, lookup, and dynamic-option UX

Inventory every dropdown, picker, category, reason, status label, configurable rule value, and reusable option source. Assign stable IDs such as `LOOKUP-ORDER-CANCEL-REASON` and classify each as:

- configurable business lookup;
- constrained lookup;
- system-fixed invariant;
- externally managed reference;
- entity-owned data selector.

Do not design production forms around hard-coded option arrays or sample data. Every business/domain dropdown and option list—including system-fixed read-only lists—must be loaded dynamically from the authoritative database through the backend. Entity selectors must query their owning data. The design must include loading, error, empty, refresh, and permission behavior for that retrieval.

Provide a professional **Reference Data / Lookups** experience. It may be a central catalogue with links to domain-owned settings when that is clearer. Authorized users must be able to see:

- every lookup/reference type;
- purpose and owning functional area;
- scope, such as global, tenant, organization, location, or application;
- source of truth;
- editable, partially editable, or read-only status and the reason;
- value count, active/inactive status, usage information, and last change/sync where relevant;
- where the values appear in the product.

For safely configurable types, make authorized editing the default and define add, view, edit, translate, reorder, activate/deactivate, restore, and default-selection behavior as applicable. Include permissions, validation, unique stable codes, localized labels, impact/usage warnings, audit history, optimistic/concurrent conflict handling, and save/cancel/unsaved-change behavior.

Prefer deactivation over deletion when historical records reference a value. Existing records must continue to display the historical localized label or resolved value correctly, while inactive values are normally unavailable for new selection. Prevent changes that would violate business logic, integrations, reporting, or referential integrity.

For system-fixed types, still load the values from system-managed database rows and provide a readable catalogue/detail view with stable code, localized label, meaning, owner, usage, and the reason editing is locked. For externally managed values, show source, synchronization status, last successful sync, errors, and allowed recovery actions. For entity-owned data, link users to the owning management area instead of duplicating CRUD in Lookups.

Every dynamic selector must define loading, empty, no-results, unavailable, permission, stale, and retry behavior; search/filter behavior for large sets; display of inactive historical values; dependent option behavior; and refresh after an authorized settings change.

## Multilingual, locale, and bidirectional UX

Design multilingual behavior as a complete experience, not as a late text replacement:

- language selection, first-use/default behavior, persistence, and fallback;
- placement and behavior of the language control without disrupting current work;
- translation of navigation, controls, validation, statuses, lookup values, notifications, templates, and generated documents;
- layouts that tolerate text expansion/contraction without clipping or ambiguous truncation;
- locale-aware dates, times, time zones, numbers, currency, names, addresses, and plural forms;
- Unicode input/display, multilingual search, and language-specific sorting where required;
- right-to-left layout mirroring for applicable languages, with explicit exceptions for media, charts, timelines, codes, phone numbers, and other direction-sensitive content;
- correct mixed-direction text, alignment, icon direction, navigation/back behavior, tables, forms, overlays, and gestures;
- accessible font selection, line height, focus order, screen-reader labels, and keyboard/input behavior in each writing direction;
- authoring and review of translatable domain content and lookup labels when users manage them.

If launch languages are not specified, design the reusable language/fallback model and identify launch-language confirmation as a pre-implementation decision. Do not silently design an English-only interface.

## Forms, lists, dialogs, and feedback

For every form define fields, labels, format/purpose, required/optional status, defaults, dependencies, conditional visibility, validation timing and feedback, submission, success, server/business rejection, cancellation, and unsaved-change behavior.

For every list/table define displayed data, ordering, search, filters, sorting, pagination/incremental loading, row and bulk actions where useful, selection behavior, statuses, empty/no-results/error states, and safe destructive-action behavior.

For every dialog/drawer/overlay define its trigger, purpose, content, actions, close/escape behavior, confirmation needs, focus behavior, completion outcome, failure behavior, and return destination. Avoid unnecessary modal usage.

Define feedback patterns for inline errors, banners, toasts, status badges, progress, notifications, and irreversible or delayed actions.

## Flow-first design — highest priority

Create a **Flow Inventory** before the detailed screen sections. Derive it from:

- every user goal;
- every FR with a multi-step interaction;
- every entity lifecycle;
- every role handoff;
- every cross-application or external-party dependency;
- every recovery, cancellation, reversal, or resume scenario that materially affects UX.

Classify each flow as:

- primary;
- alternate;
- exception/recovery;
- cross-application;
- administrative/support;
- background-with-user-feedback.

Every major flow specification must contain:

1. FLOW ID and name;
2. objective and related FR IDs;
3. actor(s), application(s), and device(s);
4. trigger and starting screen/state;
5. preconditions;
6. numbered steps, each stating:
   - actor action;
   - UI element used;
   - system feedback;
   - resulting state;
   - next screen/action;
7. decision points and branch conditions;
8. success outcome and final state;
9. alternate outcomes;
10. validation/business failure outcomes;
11. technical/external dependency failure as experienced by the user;
12. retry, recovery, cancellation, reversal, timeout, interruption, and resume behavior when relevant;
13. permission-denied behavior;
14. concurrent/stale-state behavior when relevant;
15. cross-role/application handoffs and acknowledgements;
16. final next available actions;
17. screens, components, elements, and states involved;
18. acceptance walkthrough.

No flow may end with vague language such as “continue normally,” “handle the error,” or “show appropriate feedback.” Define the actual user-visible behavior.

## Cross-application flow contract

For each handoff such as Application A → Application B → Application C → Application A, specify:

- initiating actor, action, and state;
- receiving application/role and what appears there;
- acknowledgement, acceptance, rejection, timeout, or failure;
- state changes visible in every affected application;
- notification or status explanation;
- what the initiating user sees while waiting;
- recovery, cancellation, and reversal behavior;
- reconciliation if applications temporarily disagree;
- final owner and next action.

Use notes, helper text, tooltips, status explanations, or progress messages where a user must understand that another role/application controls the next step.

## Edge-case flow matrix

For every major flow, explicitly decide applicability and behavior for:

- no data / first use;
- invalid or incomplete input;
- duplicate or repeated submission;
- unavailable or exhausted resource;
- expired or already-completed item;
- already-cancelled or reversed item;
- stale data or concurrent change;
- insufficient permission;
- partial completion;
- external-party delay/failure;
- temporary connectivity loss;
- user cancellation, abandonment, interruption, and later resume;
- destructive action and undo/reversal where appropriate;
- session expiration during work;
- notification or handoff not acknowledged.

Mark an edge case `Not Applicable` only with a short reason.

## UX quality and benchmarking

Benchmark mature current systems in the same domain when research is available. Use established patterns for efficient frequent actions, navigation, status visibility, accessible forms, safe destructive actions, error prevention, recovery, search/filtering, multi-device behavior, and role-specific work. Do not copy proprietary UI.

Normalize equivalent actions and terms. Identify reusable patterns rather than inventing a unique component for every screen.

## Required audits before output

Perform and repair:

- FR → design coverage;
- design → FR/purpose justification;
- flow inventory completeness;
- flow step continuity and branch closure;
- interactive-element behavior completeness;
- screen reachability and exit coverage;
- state/action consistency;
- cross-application handoff consistency;
- edge/error/recovery coverage;
- navigation and terminology consistency;
- accessibility and responsive/adaptive coverage;
- fitness of each important UI-control choice and ease of high-frequency flows;
- complete lookup/reference-data classification, administration, and dynamic-option states;
- multilingual, locale, text-expansion, and RTL/LTR behavior;
- component reuse and design-pattern consistency.

Targets against the declared baseline:

- FR traceability: 100%;
- major flow closure: 100%;
- documented interactive-element behavior: 100%;
- design-object traceability: 100%.

These targets require evidence in the matrices; do not claim certainty about unknown needs.

## Required document structure

1. Document Information
2. Design Principles and Conventions
3. Actor and Application Map
4. Global Navigation and Shared Behavior
5. Flow Inventory
6. Shared Components and Interaction Patterns
7. Application/Surface Specifications
8. Detailed Screens and UI Elements
9. Detailed End-to-End Flows
10. Cross-Application Handoffs
11. Edge-Case Flow Matrix
12. Error, Recovery, Interruption, and Resume UX
13. Accessibility and Adaptive/Responsive Behavior
14. Multilingual, Locale, and Bidirectional UX
15. Reference Data / Lookup Catalogue and Management UX
16. UI-Control Selection Decisions for Critical Actions
17. Design Coverage Matrix
18. Flow Coverage Matrix
19. UI Element Behavior Index
20. Lookup Governance Matrix

The Design Coverage Matrix must include:

| FR ID | Application | Screen(s) | Component(s) | Element(s) | Flow(s) | State(s) | Coverage |
|---|---|---|---|---|---|---|---|

The Flow Coverage Matrix must include:

| FLOW ID | Type | FR IDs | Start | Success End | Alternate/Failure End | Recovery/Next Action | Closed |
|---|---|---|---|---|---|---|---|

The Lookup Governance Matrix must include:

| LOOKUP/Source ID | Used By | Classification | Source of Truth | Scope | Editable Attributes | Management/View Screen | Localization | Historical-Value Rule |
|---|---|---|---|---|---|---|---|---|

## File and version behavior

If filesystem access exists, save the result as `docs/ai-delivery/02-ui-ux-design/ui-ux-design-plan-v1.0.md`, or the next unused logical version, and update `latest_ui_ux_design_plan` in `manifest.md` only after the file is complete. Record the exact Functional Requirements path/version used as its source. Do not overwrite an accepted version.

If filesystem access does not exist, return the complete document and intended path.

## Output rule

Output only the complete UI/UX Design and Flow Plan and its saved path when applicable. No code, score, changelog, or separate reasoning report.
