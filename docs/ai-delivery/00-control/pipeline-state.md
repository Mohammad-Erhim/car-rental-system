# Pipeline State

Authoritative, verified pipeline status. Reconstructed 2026-09-07 during pipeline-adoption
migration `SESSION-20260907-185415-PIPELINE-ADOPTION`
(`00-control/migrations/MIG-20260907-001/`). Never inferred from filename sorting alone —
statuses below are backed by `manifest.md`, `04-implementation/*`, and repository/git evidence.

| Stage                      | Status                                                                                                                                                                                             | Latest session (legacy convention)                                            | Latest artifact                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 01 Functional Requirements | `COMPLETED` (see note A)                                                                                                                                                                           | none (predates new session protocol)                                          | `01-functional-requirements/functional-requirements-v1.0.md`                                                                    |
| 02 Score/Refine FR         | `COMPLETED` — `SKIPPED_BY_USER` (per `manifest.md`: "Skipped by user")                                                                                                                             | none                                                                          | n/a — no audit file exists under `01-functional-requirements/audits/`                                                           |
| 03 UI/UX Design Plan       | `COMPLETED` (see note A)                                                                                                                                                                           | none                                                                          | `02-ui-ux-design/ui-ux-design-plan-v1.0.md`                                                                                     |
| 04 Score/Refine UI/UX      | `COMPLETED` — `SKIPPED_BY_USER` (per `manifest.md`: "Skipped by user")                                                                                                                             | none                                                                          | n/a — no audit file exists under `02-ui-ux-design/audits/`                                                                      |
| 05 SRS                     | `COMPLETED`                                                                                                                                                                                        | none                                                                          | `03-srs/srs-v1.0.md`                                                                                                            |
| 06 Implement System        | `COMPLETED` for the roadmap scope (STAGE-000..007) **plus** an unversioned scope extension (STAGE-008..013, "Enhancement Program") delivered under the same stage without a formal CR — see note B | none (predates new session protocol; legacy "Session 01" in `session-log.md`) | working tree at current git revision (branch `implementation`, clean; see `migrations/MIG-20260907-001/repository-snapshot.md`) |
| 07 Audit/Test/Fix/Harden   | `NOT_STARTED` under this protocol (see note C)                                                                                                                                                     | none                                                                          | none — `05-system-validation/` does not exist yet                                                                               |

## Note A — Stages 1 & 3 unscored by explicit user choice

`manifest.md` records Stage 1 and Stage 3 as "Accepted (unscored)" with Stage 2/4 "Skipped by
user." This migration treats that as a valid, evidenced `SKIPPED_BY_USER` decision, not a gap to
silently re-run. If the user wants Stage 2/4 scoring performed now, that is a separate, explicit
follow-up request — this migration does not perform it (out of the migration boundary).

## Note B — Enhancement Program scope extension

STAGE-008 through STAGE-013 (project-local numbering; see
`04-implementation/enhancement-program.md`) added material product scope beyond SRS v1.0:
system-wide theming/branding, a complete i18n architecture (en/ar/fr), a new Next.js public site
(`apps/site`) replacing the customer half of `apps/web`, full technical SEO, and an operations
dashboard UX overhaul. This was executed under direct user mandate but **without** the formal
CR → FR → Design → SRS propagation this new pipeline pack requires. It is registered as
`CR-20260907-001` (draft) in `00-control/changes/CR-20260907-001/` and reflected as
`UPDATE_REQUIRED` in `baseline-alignment.md`. See
`migrations/MIG-20260907-001/alignment-gap-register.md` for full evidence.

## Note C — Stage 7 status

No `docs/ai-delivery/05-system-validation/` workspace exists, and the legacy prompt pack
(archived at `prompt-library/archive/PROMPT-PACK-LEGACY-20260907-185415/`) never included a
Stage 7 file — it stopped at `06_IMPLEMENT_SYSTEM.md`. The project's own `STAGE-013-system-qa`
(under `04-implementation/stages/`) is a good-faith, self-scoped QA pass (30/30 matrix cells,
138 screenshots, 5 defects found+fixed) run as part of the implementation stage, not the
independent, full-inventory Stage 7 audit this pack requires (no `05-system-validation/`
inventories, coverage matrices, or completion gates were produced). It is valid supporting
evidence for Stage 7, not a substitute for it. Known open residuals carried into Stage 7 scope:
`verify:e2e` red (legacy customer-flow specs need porting to `apps/site`), `verify:seo` /
`verify:perf` not yet run for `apps/site`, authenticated customer flows on `apps/site` not yet
built (STAGE-011 increment 3), and `/ops` QA-matrix coverage at 3 of ~15 screens.
