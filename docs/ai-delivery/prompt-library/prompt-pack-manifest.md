# Prompt-Pack Installation Manifest

| Field | Value |
|---|---|
| Pack ID | PROMPT-PACK-20260907 |
| Installed by | Migration session `SESSION-20260907-183834-PIPELINE-ADOPTION` (see `docs/ai-delivery/00-control/migrations/MIG-20260907-001/`) |
| Installation time (UTC) | 2026-09-07T18:38:34Z |
| Previous canonical copy at `docs/ai-delivery/` | None — this is the first installation of the session-controlled prompt pack in this repository. Nothing was archived from this path because nothing previously existed there. |
| Archive location | `docs/ai-delivery/prompt-library/archive/` (empty; reserved for future superseded canonical packs) |
| Legacy pack outside canonical location | `prompts/` at repository root (Stages 00–06 only, no Stage 07, no session/change-control protocol). Left in place, not moved or deleted. See `legacy-prompt-inventory.md` in the migration record. |

## Installed files (`docs/ai-delivery/prompt-library/current/`)

Every row below was verified byte-identical to the attached source file (`diff -q` and SHA-256 both matched) before this manifest was written.

| # | Installed file | Source (uploaded) hash — SHA-256 | Installed hash — SHA-256 | Size (bytes) | Status |
|---|---|---|---|---|---|
| 00 | `docs/ai-delivery/README.md` | `c83d933c4743704f9d5cbcdef8e2bed1112370b67d6177fe96227ad98854835b` | `c83d933c4743704f9d5cbcdef8e2bed1112370b67d6177fe96227ad98854835b` | 20023 | VERIFIED |
| 01 | `prompt-library/current/01_CREATE_FUNCTIONAL_REQUIREMENTS.md` | `5ae730ae28a2564f77ee9bde579e218d35d65271f85f7f2fae4c23ddf98c1a18` | `5ae730ae28a2564f77ee9bde579e218d35d65271f85f7f2fae4c23ddf98c1a18` | 11307 | VERIFIED |
| 02 | `prompt-library/current/02_SCORE_AND_REFINE_FUNCTIONAL_REQUIREMENTS.md` | `c85482d2b92e2fb1176bf743cded258ef8d9fa9ba9a9fad76b9d49a5d7e68ef2` | `c85482d2b92e2fb1176bf743cded258ef8d9fa9ba9a9fad76b9d49a5d7e68ef2` | 9700 | VERIFIED |
| 03 | `prompt-library/current/03_CREATE_UI_UX_DESIGN_PLAN.md` | `11bff55f4d2c782542a6573aae6d230ab4db9229b83bd7d31d08214e84f9cbdc` | `11bff55f4d2c782542a6573aae6d230ab4db9229b83bd7d31d08214e84f9cbdc` | 21788 | VERIFIED |
| 04 | `prompt-library/current/04_SCORE_AND_REFINE_UI_UX_DESIGN_PLAN.md` | `0a30c8a93110552c059b6b868cde98172d88b67323e02d38df2462f6fed0b527` | `0a30c8a93110552c059b6b868cde98172d88b67323e02d38df2462f6fed0b527` | 14657 | VERIFIED |
| 05 | `prompt-library/current/05_CREATE_SRS.md` | `78a138416cb9075df8f7edf19a5beaa21be7fe3d2cd4ca8672e647128286e469` | `78a138416cb9075df8f7edf19a5beaa21be7fe3d2cd4ca8672e647128286e469` | 21911 | VERIFIED |
| 06 | `prompt-library/current/06_IMPLEMENT_SYSTEM.md` | `5f1d63e0fc2574b439e97385eb66a640000fe57ed2756f828019f5d64ce2020d` | `5f1d63e0fc2574b439e97385eb66a640000fe57ed2756f828019f5d64ce2020d` | 41494 | VERIFIED |
| 07 | `prompt-library/current/07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md` | `bb07c733024780ee9d46d7b8e40b42cb6d8a9ed2b88ceb6f6e6085607e7c00dc` | `bb07c733024780ee9d46d7b8e40b42cb6d8a9ed2b88ceb6f6e6085607e7c00dc` | 63718 | VERIFIED |

All 8 files installed. No product source code was touched during this installation (Phase 3 boundary observed).
