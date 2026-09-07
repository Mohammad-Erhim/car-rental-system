# Prompt Pack Manifest

**Pack ID:** PROMPT-PACK-2026-09-07
**Installed:** 2026-09-07 18:54:15 UTC
**Installed by:** migration session `SESSION-20260907-185415-PIPELINE-ADOPTION` (see
`../00-control/migrations/MIG-20260907-001/`).
**Source:** eight files attached to the chat (`Archive.zip`), identified by title/content per the
migration prompt's immutability rule. Filenames carried harmless upload-tool suffixes
(e.g. `033c81e5-Archive.zip`), ignored for identification.

## Files

| # | Canonical role | Uploaded/extracted filename | Detected title | Bytes | SHA-256 | Status | Installed path |
|---|---|---|---|---|---|---|---|
| 0 | README | `00_README.md` | AI Delivery Pipeline — Prompt Library | 20023 | `c83d933c4743704f9d5cbcdef8e2bed1112370b67d6177fe96227ad98854835b` | VALID | `docs/ai-delivery/README.md` |
| 1 | Stage 1 | `01_CREATE_FUNCTIONAL_REQUIREMENTS.md` | Prompt — Create Functional Requirements | 11307 | `5ae730ae28a2564f77ee9bde579e218d35d65271f85f7f2fae4c23ddf98c1a18` | VALID | `prompt-library/current/01_CREATE_FUNCTIONAL_REQUIREMENTS.md` |
| 2 | Stage 2 | `02_SCORE_AND_REFINE_FUNCTIONAL_REQUIREMENTS.md` | Prompt — Score, Then Optionally Refine Functional Requirements | 9700 | `c85482d2b92e2fb1176bf743cded258ef8d9fa9ba9a9fad76b9d49a5d7e68ef2` | VALID | `prompt-library/current/02_SCORE_AND_REFINE_FUNCTIONAL_REQUIREMENTS.md` |
| 3 | Stage 3 | `03_CREATE_UI_UX_DESIGN_PLAN.md` | Prompt — Create UI/UX Detailed Design and Flow Plan | 21788 | `11bff55f4d2c782542a6573aae6d230ab4db9229b83bd7d31d08214e84f9cbdc` | VALID | `prompt-library/current/03_CREATE_UI_UX_DESIGN_PLAN.md` |
| 4 | Stage 4 | `04_SCORE_AND_REFINE_UI_UX_DESIGN_PLAN.md` | Prompt — Score, Then Optionally Refine the UI/UX Design and Flow Plan | 14657 | `0a30c8a93110552c059b6b868cde98172d88b67323e02d38df2462f6fed0b527` | VALID | `prompt-library/current/04_SCORE_AND_REFINE_UI_UX_DESIGN_PLAN.md` |
| 5 | Stage 5 | `05_CREATE_SRS.md` | Prompt — Create the Software Requirements Specification (SRS) | 21911 | `78a138416cb9075df8f7edf19a5beaa21be7fe3d2cd4ca8672e647128286e469` | VALID | `prompt-library/current/05_CREATE_SRS.md` |
| 6 | Stage 6 | `06_IMPLEMENT_SYSTEM.md` | Prompt — Implement the Complete System in Verified Stages | 41494 | `5f1d63e0fc2574b439e97385eb66a640000fe57ed2756f828019f5d64ce2020d` | VALID | `prompt-library/current/06_IMPLEMENT_SYSTEM.md` |
| 7 | Stage 7 | `07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md` | Prompt — Stage 7: Audit, Test, Fix, and Harden the Complete System | 63718 | `bb07c733024780ee9d46d7b8e40b42cb6d8a9ed2b88ceb6f6e6085607e7c00dc` | VALID | `prompt-library/current/07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md` |

All 8 files present exactly once. Internal-consistency checks (per the migration prompt Phase 1):

- Stages 1–7 present exactly once: **PASS**.
- README describes the same seven-stage pipeline: **PASS**.
- Stage 2 and Stage 4 score before asking the user whether to refine: **PASS** (two-turn gate,
  Phase A/Phase B).
- Stage 5 creates the SRS: **PASS**.
- Stage 6 performs full implementation, not an HTML/CSS/JS-only mockup: **PASS** (explicit
  "Non-negotiable definition of implementation" section).
- Stage 7 performs whole-system audit, repair, optimization, release-readiness validation:
  **PASS**.
- Session/checkpoint/change-control/baseline-alignment rules are internally compatible across
  all 8 files: **PASS** (same session ID format, same `00-control/` structure, same CR
  vocabulary and propagation order referenced consistently).

**No internal conflict found.** Installation proceeded.

## Verification

Every installed file's SHA-256 was recompared byte-for-byte against the attached source
immediately after copy (see migration checkpoint 2 in
`../00-control/migrations/MIG-20260907-001/migration-state.md`). All 8 matched exactly.

## Legacy pack

The project already contained an older, structurally different 6-file prompt pack (no Stage 7,
no session-continuity/change-control protocol) at repository-root `prompts/`. It is left in place
unmodified (see non-destructive rules) and an indexed copy is archived at
`prompt-library/archive/PROMPT-PACK-LEGACY-20260907-185415/`. See
`../00-control/migrations/MIG-20260907-001/legacy-prompt-inventory.md` for full detail.
