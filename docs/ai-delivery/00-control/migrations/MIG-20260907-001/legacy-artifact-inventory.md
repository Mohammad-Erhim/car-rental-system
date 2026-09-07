# Legacy Artifact Inventory — MIG-20260907-001

Generated delivery artifacts found under the existing `docs/ai-delivery/` tree (all created by
the legacy 6-stage pipeline run, session-log "Session 01", 2026-09-07).

| Path | Title/version | Hash (per `manifest.md`) | Status | Confidence |
|---|---|---|---|---|
| `01-functional-requirements/functional-requirements-v1.0.md` | Functional Requirements v1.0 | `02bf737d41d727db4de7b9e4d53c0ffdec094c8be5eba1c72238dbe94b725eb3` | `CURRENT_CANONICAL` — sole version, marked accepted (unscored) in `manifest.md` | High — manifest pointer + byte-identical root copy agree |
| `02-ui-ux-design/ui-ux-design-plan-v1.0.md` | UI/UX Design and Flow Plan v1.0 | `a0a8d184d025c4acad863152a51644fc4433b9241bdb633a95c9088068df7c67` | `CURRENT_CANONICAL` | High |
| `03-srs/srs-v1.0.md` | SRS v1.0 | `b8eb084f421d6b6a77c21832969981cbff59301a2e07e079ce6baf3d0de97bbd` | `CURRENT_CANONICAL` | High |
| `04-implementation/README.md`, `source-manifest.md`, `selected-scope.md`, `dependency-map.md`, `implementation-roadmap.md`, `current-state.md`, `decisions.md`, `localization-registry.md`, `lookup-registry.md`, `session-log.md` | Implementation control artifacts (legacy convention — same purpose as the new pack's `04-implementation/*`, different origin) | not individually hashed by the legacy pipeline | `CURRENT_CANONICAL` — actively maintained, internally consistent, matches git history | High |
| `04-implementation/enhancement-program.md` | Enhancement Program master plan (STAGE-009..013) | n/a | `CURRENT_CANONICAL` — but describes scope **not** reflected in the FR/Design/SRS above; see `alignment-gap-register.md` | High (content), but its relationship to the "accepted baseline" is exactly the gap `CR-20260907-001` tracks |
| `04-implementation/stages/STAGE-000-platform/` … `STAGE-013-system-qa/` (14 stage folders) | Per-stage `plan.md`/`checkpoint.md`/`test-evidence.md`/`defects.md`/`screenshots/` | not hashed | `CURRENT_CANONICAL` — sequential, no duplicate/orphan/draft artifacts found | High |
| root `functional-requirements-v1.0.md`, `srs-v1.0.md`, `ui-ux-design-plan-v1.0.md` | byte-identical duplicates of the three canonical documents above | identical (verified via `diff -q`, exit 0 for all three) | `CURRENT_CANONICAL` (duplicate location) — documented project convention, not drift | High |
| root `CHANGELOG.md` | Project pipeline changelog (STAGE-008 onward; entries predating STAGE-008 are plain project history) | n/a | `CURRENT_CANONICAL` | High |

## Findings

- **No draft, duplicate, orphan, or unknown documents found** under `docs/ai-delivery/`. Every
  file discovered traces to a named stage and is referenced by `current-state.md` or
  `session-log.md`.
- **No competing/ambiguous versions** of FR, Design, or SRS exist — each has exactly one version
  (`v1.0`), so no "choose the latest among candidates" ambiguity applies (Phase 5 of the
  migration prompt does not trigger here).
- **The one real gap** is the one already tracked in `pipeline-state.md` / `baseline-alignment.md`
  / `CR-20260907-001`: FR/Design/SRS v1.0 do not describe the STAGE-008..013 enhancement-program
  scope that is already implemented and committed.
- **Screenshots** (hundreds of `.png` files under `04-implementation/stages/*/screenshots/` and
  `STAGE-013-system-qa/screenshots/`) are evidence artifacts, not specification documents;
  inventoried by presence/count only, not individually reviewed by this migration (out of scope
  — Stage 7 will use them as a starting evidence base and refresh what's stale).
