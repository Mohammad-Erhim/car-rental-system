# CR-20260907-001 — impact-analysis.md

**Analysis depth:** draft/preliminary — a full impact analysis is the job of whichever stage
executes this CR (Stage 1 for FR, Stage 3 for design, Stage 5 for SRS, or Stage 7 acting under
its own CR-reconciliation authority). This record establishes evidence and scope, not a
line-by-line diff.

## Affected actors/applications

- `APP-CWEB` (former customer half of `apps/web`) → superseded by `apps/site` (Next.js).
- `APP-OPS` (`apps/web`, now `/ops`-only) — UX overhaul, new admin screens (branding, languages,
  SEO settings).
- New cross-cutting capability: theming/branding, layered on top of the existing
  `config_version` versioning workflow from STAGE-006 (already in SRS scope).
- New cross-cutting capability: multi-locale i18n resolved from "TBD" to en/ar/fr production
  launch locales (`DEC-024`), with a management UI.

## Affected FR/SCREEN/FLOW/SRS/LOOKUP/interface/data/security/test IDs

Not yet enumerated — this requires re-reading FR v1.0 and Design v1.0 in full against
`enhancement-program.md` §3-5, which is Stage 1/3 work. Known new implementation-side surface
that needs upstream IDs assigned: `configVersion` kinds `branding` and `seo`; API routes
`GET /api/v1/meta/branding`, `GET /api/v1/meta/seo`, `/ops/config/branding`,
`/ops/config/seo`, `/ops/config/languages`; locale CRUD endpoints; `apps/site` route tree
(`/[locale]/`, `/search`, `/vehicle/:categoryCode`, `/help`, `/legal/:slug`, plus deferred authed
routes).

## Dependencies and compatibility

- No database migration is anticipated to *document* the change (schema already exists:
  migrations through `0006`, see `docs/ai-delivery/04-implementation/source-manifest.md`).
- No breaking change to already-published FR/SCREEN/FLOW/SRS IDs is intended; this is additive
  documentation of already-shipped, already-tested behavior.
- Downstream: once FR/Design/SRS reach v1.1, `04-implementation/traceability-matrix.md` and
  `lookup-registry.md`/`localization-registry.md` should gain rows tracing the new IDs to the
  code that already implements them (a backfill, not new code).

## Risks

- Low technical risk (documentation-only). The risk this CR manages is **process risk**: without
  it, the project's own change-control gate ("Stages 6 and 7 cannot report final completion
  while an approved in-scope CR is open, blocked, unverified, or missing from an affected layer")
  would otherwise be silently bypassed, since the enhancement program was delivered without any
  CR at all under the old prompt pack (which had no change-control concept).

## Migration limitation

This migration is authorized to register and evidence this CR, and to mark affected
baseline-alignment rows `UPDATE_REQUIRED`. It is **not** authorized to write the FR v1.1 / Design
v1.1 / SRS v1.1 content itself (that is full Stage 1/3/5 work, explicitly out of the migration's
task boundary). See `resume-handoff.md` for the recommended next action.
