# AI Delivery Pipeline — Prompt Library

This library turns a project brief into an implementation that can be resumed safely in a fresh AI session.

## Pipeline

1. `01_CREATE_FUNCTIONAL_REQUIREMENTS.md`
2. `02_SCORE_AND_REFINE_FUNCTIONAL_REQUIREMENTS.md` — repeat as needed
3. `03_CREATE_UI_UX_DESIGN_PLAN.md`
4. `04_SCORE_AND_REFINE_UI_UX_DESIGN_PLAN.md` — repeat as needed
5. `05_CREATE_SRS.md`
6. `06_IMPLEMENT_SYSTEM.md` — start, resume, or report status

The refinement prompts use a strict two-turn gate:

1. Score the current document before changing it.
2. Show the score, evidence, and important gaps.
3. Ask the user: **Refine now? Yes or No?**
4. Stop and wait.
5. Refine only after **Yes**. If the answer is **No**, preserve the document and proceed to the next pipeline stage.

The refined output is not automatically given an inherited or optimistic score. To decide whether to refine it again, run the same refinement prompt on the new version. That begins a new independent score-before-refine cycle.

## Recommended project artifact structure

The prompts use this structure when filesystem access is available:

```text
docs/ai-delivery/
├── README.md
├── manifest.md
├── 00-input/
│   └── project-brief-v1.0.md
├── 01-functional-requirements/
│   ├── functional-requirements-v1.0.md
│   └── audits/
├── 02-ui-ux-design/
│   ├── ui-ux-design-plan-v1.0.md
│   └── audits/
├── 03-srs/
│   └── srs-v1.0.md
└── 04-implementation/
    ├── README.md
    ├── source-manifest.md
    ├── selected-scope.md
    ├── dependency-map.md
    ├── implementation-roadmap.md
    ├── current-state.md
    ├── decisions.md
    ├── traceability-matrix.md
    ├── session-log.md
    └── stages/
        └── STAGE-001-short-name/
            ├── plan.md
            ├── checkpoint.md
            ├── test-evidence.md
            ├── defects.md
            └── screenshots/
```

`manifest.md` is the authoritative pointer to the latest accepted versions. Never determine “latest” by filename sorting alone.

## Version and history rules

- Never overwrite an accepted artifact.
- Preserve stable FR, SRS, SCREEN, COMPONENT, FLOW, STATE, and TEST IDs when their meanings have not changed.
- Save each replacement as a new version and update `manifest.md` only after the file is complete.
- Scores and audit notes stay outside the specification documents.
- Previous scores must not influence a new audit.
- Chat history is not a source of truth. Saved artifacts and verified repository state are.
- “100% coverage” means complete traceability against the declared input baseline and discovered design objects. It is not a mathematical guarantee that no unknown requirement or defect exists.

## Important vocabulary

- **System:** the complete product.
- **Application / surface:** a distinct user-facing interface, such as POS, KDS, Branch Manager, Customer App, or Rider App.
- **Functional area/domain:** orders, payments, inventory, notifications, authentication, and similar capabilities that may span several applications.
- **Screen/page:** one interface within an application.
- **Flow:** an end-to-end user or cross-system journey with entry, actions, decisions, outcomes, final state, and next action.

Implementation scope should normally be selected by **application/surface**, not by a cross-cutting functional domain.

## Cross-pipeline UI, lookup, and localization rules

- Choose UI controls from the user's task, option count, frequency, risk, device, and accessibility needs. Do not default every choice to a dropdown or every action to a modal.
- Optimize important flows for clarity, few unnecessary steps, visible system status, error prevention, and recovery.
- Load production business records, configurable lookup values, and organization settings dynamically from the authoritative database through the real backend. Do not bundle them as UI arrays, local JSON constants, local-storage truth, or sample records.
- Store and load every business/domain dropdown and option list through the database/backend. Classify it as configurable, constrained, system-fixed, externally managed, or entity-owned, and expose it in a professional Reference Data/Lookup catalogue or its clearly linked owning area.
- Make lookups editable by authorized users by default. When editing could break lifecycle logic, security, reporting, standards, or integrations, keep database-backed values system-managed and read-only in the dashboard with a clear reason.
- Review every critical flow for the minimum necessary user steps. Remove redundant screens, confirmations, and repeated entry without removing required security, clarity, consent, or recovery.
- Treat multilingual support as an end-to-end requirement: translated UI/content, locale-aware formatting, language preference and fallback, Unicode, localized lookup labels and messages, and RTL/LTR behavior when applicable.
