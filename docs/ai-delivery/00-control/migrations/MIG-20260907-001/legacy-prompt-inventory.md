# Legacy Prompt-Library Inventory (Phase 2) — MIG-20260907-001

All 6 files below live at `prompts/` (repository root). This directory predates the session/change-control protocol entirely — it is a strictly older, simpler pipeline (no Stage 07, no `docs/ai-delivery/00-control/`).

| Path | SHA-256 | Inferred stage/version | Referenced by project docs? | Differs from attached canonical? | Disposition |
|---|---|---|---|---|---|
| `prompts/00_README.md` | `ce7e577a1341f8d73470e30920471381e3b835adf83f7159d3710aa92dc2605d` | Legacy README, pre-Stage-07, pre-session-protocol | Not explicitly referenced by path from within the three product documents, but its 6-stage pipeline description matches how `functional-requirements-v1.0.md`/`ui-ux-design-plan-v1.0.md`/`srs-v1.0.md` describe their own provenance (Stage numbers, "Phase 2"/"Phase 4" skip language). | Yes — missing Stage 07 entirely; missing the full session/checkpoint/change-control/CR protocol; missing `00-control/` in its recommended structure. | `SUPERSEDED` |
| `prompts/01_CREATE_FUNCTIONAL_REQUIREMENTS.md` | `05715ebc575f0a557a8b8612d7c96b54fbd0a975360ea47f8cc3ee261cae0f47` | Legacy Stage 1 | Consistent with `functional-requirements-v1.0.md`'s structure/content | Yes (different hash/size than attached `01_CREATE_FUNCTIONAL_REQUIREMENTS.md`) | `SUPERSEDED` |
| `prompts/02_SCORE_AND_REFINE_FUNCTIONAL_REQUIREMENTS.md` | `7196c69161a226f33bde923a99fcbbb4a17ba2e0ea0e83a2cb2ff5ddd3ccb209` | Legacy Stage 2 | Not exercised on this project (skipped by user) | Yes | `SUPERSEDED` |
| `prompts/03_CREATE_UI_UX_DESIGN_PLAN.md` | `f6526baa9180c5edd2774d8f1ed357cad68e1b6f778a3cc35763ad7d582bce18` | Legacy Stage 3 | Consistent with `ui-ux-design-plan-v1.0.md`'s structure/content | Yes | `SUPERSEDED` |
| `prompts/04_SCORE_AND_REFINE_UI_UX_DESIGN_PLAN.md` | `ec939182ae020114fce89d8c975c2551381ae5070c2b40dd1e315de731c25452` | Legacy Stage 4 | Not exercised on this project (skipped by user) | Yes | `SUPERSEDED` |
| `prompts/05_CREATE_SRS.md` | `4e175fe4e39580d4392a5ee1b4c632b289631c4328756b4ec0d70a55d18404da` | Legacy Stage 5 | Consistent with `srs-v1.0.md`'s structure/content | Yes | `SUPERSEDED` |
| `prompts/06_IMPLEMENT_SYSTEM.md` | `ec1e8e17a0b5b54e73175fcbae7886a9f0f1ef9a0ce127de3efc103403b6a48d` | Legacy Stage 6 | Not yet exercised (implementation not started) | Yes | `SUPERSEDED` |

**No Stage 07 file exists anywhere in the legacy pack** — the legacy library only went up to Stage 6. This is itself evidence that Stage 7 (system audit) was never available to run on this project, consistent with the finding that no implementation exists yet.

## Disposition rationale

All 7 legacy files are `SUPERSEDED` by the newly installed `docs/ai-delivery/prompt-library/current/` pack, but per Phase 3 installation rule 2 ("leave old prompt copies outside the canonical prompt-library location in place unless the user explicitly requests organization"), **none were moved, renamed, or deleted**. `prompts/` remains exactly as it was at the start of this migration.
