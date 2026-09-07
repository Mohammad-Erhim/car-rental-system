# Legacy Prompt Inventory — MIG-20260907-001

| Path (as found) | Inferred stage/version | Referenced by project docs? | Differs from attached canonical? | Disposition |
|---|---|---|---|---|
| `prompts/00_README.md` | legacy README, 6-stage pipeline (no Stage 7, no session/change-control protocol) | Yes — `04-implementation/current-state.md` ("Known pre-existing / unrelated working-tree changes: none (greenfield; specs, `prompts/`, and this build only)"); `session-log.md` session 01 opens with "START (prompt 06)" | Yes — 5,082 bytes vs. 20,023 bytes attached; structurally different (no session-continuity, no CR flow, no Stage 7) | `SUPERSEDED` — indexed copy archived, original removed from the working tree per explicit user instruction ("remove old prompts or unused") |
| `prompts/01_CREATE_FUNCTIONAL_REQUIREMENTS.md` | legacy Stage 1 | Yes (same as above) | Yes — 8,716 vs 11,307 bytes | `SUPERSEDED` (removed, archived) |
| `prompts/02_SCORE_AND_REFINE_FUNCTIONAL_REQUIREMENTS.md` | legacy Stage 2 | Yes | Yes — 7,135 vs 9,700 bytes | `SUPERSEDED` (removed, archived) |
| `prompts/03_CREATE_UI_UX_DESIGN_PLAN.md` | legacy Stage 3 | Yes | Yes — 19,481 vs 21,788 bytes | `SUPERSEDED` (removed, archived) |
| `prompts/04_SCORE_AND_REFINE_UI_UX_DESIGN_PLAN.md` | legacy Stage 4 | Yes | Yes — 12,375 vs 14,657 bytes | `SUPERSEDED` (removed, archived) |
| `prompts/05_CREATE_SRS.md` | legacy Stage 5 | Yes | Yes — 19,546 vs 21,911 bytes | `SUPERSEDED` (removed, archived) |
| `prompts/06_IMPLEMENT_SYSTEM.md` | legacy Stage 6 | Yes | Yes — 37,356 vs 41,494 bytes | `SUPERSEDED` (removed, archived) |
| *(no file)* | legacy Stage 7 | — | The legacy pack had **no** Stage 7 file at all — the old pipeline stopped at implementation. This is the single biggest structural gap the new pack closes. | n/a |

## Archive

All 7 legacy files were copied byte-for-byte (hash-verified) to
`docs/ai-delivery/prompt-library/archive/PROMPT-PACK-LEGACY-20260907-185415/` **before** removal.
SHA-256 of each archived copy:

| File | SHA-256 |
|---|---|
| `00_README.md` | `ce7e577a1341f8d73470e30920471381e3b835adf83f7159d3710aa92dc2605d` |
| `01_CREATE_FUNCTIONAL_REQUIREMENTS.md` | `05715ebc575f0a557a8b8612d7c96b54fbd0a975360ea47f8cc3ee261cae0f47` |
| `02_SCORE_AND_REFINE_FUNCTIONAL_REQUIREMENTS.md` | `7196c69161a226f33bde923a99fcbbb4a17ba2e0ea0e83a2cb2ff5ddd3ccb209` |
| `03_CREATE_UI_UX_DESIGN_PLAN.md` | `f6526baa9180c5edd2774d8f1ed357cad68e1b6f778a3cc35763ad7d582bce18` |
| `04_SCORE_AND_REFINE_UI_UX_DESIGN_PLAN.md` | `ec939182ae020114fce89d8c975c2551381ae5070c2b40dd1e315de731c25452` |
| `05_CREATE_SRS.md` | `4e175fe4e39580d4392a5ee1b4c632b289631c4328756b4ec0d70a55d18404da` |
| `06_IMPLEMENT_SYSTEM.md` | `ec1e8e17a0b5b54e73175fcbae7886a9f0f1ef9a0ce127de3efc103403b6a48d` |

## Removal authorization

The migration prompt's default rule is to leave superseded prompt copies in place unless the
user explicitly requests organization/removal. Mid-migration, the user explicitly said
**"remove old prompts or unused"**. Before acting, this migration checked for any functional
dependency on `prompts/` (docker/prettier ignore-list entries only — both updated; no CI
workflow, script, or `package.json` reference found) and confirmed the archive copy above exists
and is hash-verified. On that basis, `prompts/` was removed via `git rm -r prompts/` (staged, not
committed — see `repository-snapshot.md`). The root-level specification-document duplicates
(`functional-requirements-v1.0.md`, `srs-v1.0.md`, `ui-ux-design-plan-v1.0.md`) were **not**
removed: `manifest.md` documents them as an intentional, accepted-artifact convention ("kept at
the repository root ... as delivered"), not stray/unused files, so removing them was judged to
be outside what "remove old prompts or unused" was reasonably asking for. Flagged to the user in
the final handoff in case they want those removed too.
