# Baseline Alignment

Reconstructed 2026-09-07 by migration `SESSION-20260907-185415-PIPELINE-ADOPTION`. States are
evidence-backed, not optimistic. Valid states: `ALIGNED`, `UPDATE_REQUIRED`, `IN_PROGRESS`,
`BLOCKED`, `NOT_APPLICABLE`.

| Layer | Version/Revision | Included CR IDs | Alignment Status | Evidence |
|---|---|---|---|---|
| Functional Requirements | v1.0 (`sha256:02bf737d...`, per `manifest.md`) | none formally incorporated | `UPDATE_REQUIRED` | Does not describe theming/branding, multi-locale (en/ar/fr) UX, the Next.js public site, SEO capability, or the ops UX overhaul delivered in STAGE-009..013. See `CR-20260907-001` (draft). |
| UI/UX Design | v1.0 (`sha256:a0a8d184...`) | none formally incorporated | `UPDATE_REQUIRED` | Same gap as above — design plan predates the enhancement program; screens/flows for branding editor, languages admin, SEO settings, and the `apps/site` experience are undocumented in the design baseline. |
| SRS | v1.0 (`sha256:b8eb084f...`) | none formally incorporated | `UPDATE_REQUIRED` | SRS §18.2 roadmap only covers STAGE-000..007; the `apps/theme`/`apps/site` architecture, `configVersion` kinds `branding`/`seo`, and locale-admin API are implemented but not specified. |
| Code/Database/Configuration | current git revision, branch `implementation`, clean working tree (see `migrations/MIG-20260907-001/repository-snapshot.md`) | implements the intent of `CR-20260907-001` (undocumented) | `IN_PROGRESS` | Implementation is materially ahead of its own documented baseline. Internally consistent and extensively self-tested (see `04-implementation/current-state.md`), but cannot be called `ALIGNED` while the FR/Design/SRS it should trace to remain at v1.0. |
| Automated Tests | mixed | n/a | `IN_PROGRESS` | `verify:static/unit/api/migrate` green; `verify:e2e` **red** (legacy customer-flow specs target the pre-split `apps/web`, not yet ported to `apps/site`); `verify:seo`/`verify:perf` not yet run against `apps/site`. See `pipeline-state.md` note C. |
| Stage 7 Validation | none | n/a | `NOT_APPLICABLE` — reason: Stage 7 has not been started under this pipeline pack; no `05-system-validation/latest_system_validation` report exists yet. `STAGE-013-system-qa` is related supporting evidence, not a Stage 7 report. |

## Reading this table

Nothing here is called `ALIGNED` while an approved-but-unpropagated change exists in an affected
layer, per the mandatory change-control flow. `CR-20260907-001` is currently `DRAFT` (not yet
`APPROVED`) — it was authored during this migration to make the existing, real drift
traceable and resumable, not to itself perform the FR/Design/SRS rewrite (out of migration
scope). Closing it is Stage 7's job (Stage 7 is explicitly authorized to reconcile
code-ahead-of-documentation drift via the CR mechanism as part of its four-way audit) or a
dedicated Stage 1/3/5 pass, whichever the user prefers when prompted at the next stage gate.
