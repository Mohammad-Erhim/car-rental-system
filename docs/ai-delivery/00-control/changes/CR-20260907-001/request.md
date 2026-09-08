# CR-20260907-001 — request.md

**Title:** Propagate Enhancement Program (STAGE-008..013) scope into Functional Requirements,
UI/UX Design Plan, and SRS.

**Source/date:** Discovered 2026-09-07 during pipeline-pack adoption migration
`SESSION-20260907-185415-PIPELINE-ADOPTION`. Not a new user ask — it documents a change that was
already directly requested by the user and already implemented
(`04-implementation/enhancement-program.md`, §1 "Mandate (verbatim intent)"), but never formally
propagated to the accepted specification documents.

**Motivation:** The three accepted baselines (Functional Requirements v1.0, UI/UX Design Plan
v1.0, SRS v1.0) predate and do not describe capability that is implemented, committed, and
working on `implementation` HEAD:

1. System-wide light/dark mode and curated, versioned theming (`@carrental/theme`,
   `configVersion` kind `branding`, `GET /meta/branding`, `/ops/config/branding`).
2. A dashboard branding section (logo/favicon/OG asset refs, brand colors, radius/density/font).
3. Complete, dynamically-managed i18n across three production launch locales (en/ar/fr) with a
   dashboard Languages admin, replacing the FR's "launch languages TBD" posture (FR §multilingual
   requirements) with a concrete, already-decided answer (`DEC-024`).
4. A new customer-facing surface, `apps/site` (Next.js App Router), replacing the customer half
   of the original single-SPA architecture, with full technical SEO (metadata, sitemap, robots,
   JSON-LD, hreflang) and a dashboard SEO settings panel (`configVersion` kind `seo`).
5. An operations-dashboard UX overhaul (navigation grouping, per-page i18n, `PageHeader` pattern,
   density).

**Desired outcome:** Functional Requirements, UI/UX Design Plan, and SRS each gain a new version
(`v1.1`) that documents this capability with stable new FR/SCREEN/FLOW/SRS/LOOKUP IDs, without
renumbering or reinterpreting any existing stable ID. `baseline-alignment.md` rows for these
three layers move from `UPDATE_REQUIRED` to `ALIGNED` once each new version is accepted and the
implementation/tests are confirmed to already satisfy it (expected — the code already exists and
is the ground truth this documentation update transcribes).

**Acceptance intent:** Documentation reflects reality; no behavior change is intended or
authorized by this CR alone. If writing the new FR/Design/SRS sections surfaces a genuine
product gap (e.g. an inconsistent flow), that gap is a separate defect/CR, handled through the
normal Stage 7 or dedicated-stage process — not silently folded into this one.

**Status:** `DRAFT`. This migration created the record and evidence trail; it did not perform the
FR/Design/SRS rewrite itself (out of the pipeline-adoption migration's scope — see
`INTEGRATE_UPDATED_PROMPTS_INTO_EXISTING_PROJECT.md` §"Migration task boundary"). Approval and
execution are a decision for the user at the next stage gate (see `resume-handoff.md`).
