# Input Manifest — SESSION-20260907-185500-STAGE-07

- **Stage prompt:** `docs/ai-delivery/prompt-library/current/07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md`
  (`sha256:bb07c733024780ee9d46d7b8e40b42cb6d8a9ed2b88ceb6f6e6085607e7c00dc`).
- **Functional Requirements:** `01-functional-requirements/functional-requirements-v1.0.md`
  (`sha256:02bf737d41d727db4de7b9e4d53c0ffdec094c8be5eba1c72238dbe94b725eb3`).
- **UI/UX Design Plan:** `02-ui-ux-design/ui-ux-design-plan-v1.0.md`
  (`sha256:a0a8d184d025c4acad863152a51644fc4433b9241bdb633a95c9088068df7c67`).
- **SRS:** `03-srs/srs-v1.0.md`
  (`sha256:b8eb084f421d6b6a77c21832969981cbff59301a2e07e079ce6baf3d0de97bbd`).
- **Implementation history:** `04-implementation/` (source-manifest, current-state,
  implementation-roadmap, enhancement-program, decisions, session-log, per-stage folders
  STAGE-000..013).
- **Repository revision at hand-off:** branch `implementation`,
  HEAD `065234b968a6d2878399855c44831e9f449b74e5`, plus this migration's uncommitted
  documentation-only changes (see the pipeline-adoption session's `change-log.md`). Re-verify at
  Stage 7 start — the user may commit or add commits before then.
- **Environment assumptions:** native (`scripts/dev-up.sh`) or Docker
  (`docker compose up`) local run, PostgreSQL 16 + Redis 7, per `current-state.md`. Both verified
  working as of STAGE-008.
