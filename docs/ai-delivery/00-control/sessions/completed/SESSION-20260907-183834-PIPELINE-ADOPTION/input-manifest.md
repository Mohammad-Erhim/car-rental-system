# Input Manifest — SESSION-20260907-183834-PIPELINE-ADOPTION

## Attached updated prompt-pack files (authoritative, read-only inputs)

| # | Detected title | Uploaded filename | Bytes | SHA-256 |
|---|---|---|---|---|
| 00 | AI Delivery Pipeline — Prompt Library | `00_README.md` | 20023 | `c83d933c4743704f9d5cbcdef8e2bed1112370b67d6177fe96227ad98854835b` |
| 01 | Prompt — Create Functional Requirements | `01_CREATE_FUNCTIONAL_REQUIREMENTS.md` | 11307 | `5ae730ae28a2564f77ee9bde579e218d35d65271f85f7f2fae4c23ddf98c1a18` |
| 02 | Prompt — Score, Then Optionally Refine Functional Requirements | `02_SCORE_AND_REFINE_FUNCTIONAL_REQUIREMENTS.md` | 9700 | `c85482d2b92e2fb1176bf743cded258ef8d9fa9ba9a9fad76b9d49a5d7e68ef2` |
| 03 | Prompt — Create UI/UX Detailed Design and Flow Plan | `03_CREATE_UI_UX_DESIGN_PLAN.md` | 21788 | `11bff55f4d2c782542a6573aae6d230ab4db9229b83bd7d31d08214e84f9cbdc` |
| 04 | Prompt — Score, Then Optionally Refine the UI/UX Design and Flow Plan | `04_SCORE_AND_REFINE_UI_UX_DESIGN_PLAN.md` | 14657 | `0a30c8a93110552c059b6b868cde98172d88b67323e02d38df2462f6fed0b527` |
| 05 | Prompt — Create the Software Requirements Specification (SRS) | `05_CREATE_SRS.md` | 21911 | `78a138416cb9075df8f7edf19a5beaa21be7fe3d2cd4ca8672e647128286e469` |
| 06 | Prompt — Implement the Complete System in Verified Stages | `06_IMPLEMENT_SYSTEM.md` | 41494 | `5f1d63e0fc2574b439e97385eb66a640000fe57ed2756f828019f5d64ce2020d` |
| 07 | Prompt — Stage 7: Audit, Test, Fix, and Harden the Complete System | `07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md` | 63718 | `bb07c733024780ee9d46d7b8e40b42cb6d8a9ed2b88ceb6f6e6085607e7c00dc` |

Source: `Archive.zip` upload, containing exactly these 8 files (plus macOS `__MACOSX/` resource-fork artifacts, which were ignored as not part of the content).

Also attached: `INTEGRATE_UPDATED_PROMPTS_INTO_EXISTING_PROJECT.md` — the migration-task instructions this session followed (not a pipeline prompt; not installed as one).

## Repository inputs consulted

| Path | Bytes | SHA-256 | Role |
|---|---|---|---|
| `functional-requirements-v1.0.md` | 138641 | `02bf737d41d727db4de7b9e4d53c0ffdec094c8be5eba1c72238dbe94b725eb3` | Accepted Stage 1 output |
| `ui-ux-design-plan-v1.0.md` | 250649 | `a0a8d184d025c4acad863152a51644fc4433b9241bdb633a95c9088068df7c67` | Accepted Stage 3 output |
| `srs-v1.0.md` | 311402 | `b8eb084f421d6b6a77c21832969981cbff59301a2e07e079ce6baf3d0de97bbd` | Accepted Stage 5 output |
| `prompts/00_README.md` | 5082 | `ce7e577a1341f8d73470e30920471381e3b835adf83f7159d3710aa92dc2605d` | Legacy pipeline README |
| `prompts/01_CREATE_FUNCTIONAL_REQUIREMENTS.md` | 8716 | `05715ebc575f0a557a8b8612d7c96b54fbd0a975360ea47f8cc3ee261cae0f47` | Legacy Stage 1 prompt |
| `prompts/02_SCORE_AND_REFINE_FUNCTIONAL_REQUIREMENTS.md` | 7135 | `7196c69161a226f33bde923a99fcbbb4a17ba2e0ea0e83a2cb2ff5ddd3ccb209` | Legacy Stage 2 prompt |
| `prompts/03_CREATE_UI_UX_DESIGN_PLAN.md` | 19481 | `f6526baa9180c5edd2774d8f1ed357cad68e1b6f778a3cc35763ad7d582bce18` | Legacy Stage 3 prompt |
| `prompts/04_SCORE_AND_REFINE_UI_UX_DESIGN_PLAN.md` | 12375 | `ec939182ae020114fce89d8c975c2551381ae5070c2b40dd1e315de731c25452` | Legacy Stage 4 prompt |
| `prompts/05_CREATE_SRS.md` | 19546 | `4e175fe4e39580d4392a5ee1b4c632b289631c4328756b4ec0d70a55d18404da` | Legacy Stage 5 prompt |
| `prompts/06_IMPLEMENT_SYSTEM.md` | 37356 | `ec1e8e17a0b5b54e73175fcbae7886a9f0f1ef9a0ce127de3efc103403b6a48d` | Legacy Stage 6 prompt |

## Repository revision

- Branch: `claude/new-session-kocd6k`
- HEAD at session start: `514ae21ad3e18b44427a91ea3a008100fdde0882`
- Working tree: clean, no untracked files (`git status --porcelain -uall` empty)
- Full tracked file list at start (`git ls-files`): `functional-requirements-v1.0.md`, `prompts/00_README.md` … `prompts/06_IMPLEMENT_SYSTEM.md`, `srs-v1.0.md`, `ui-ux-design-plan-v1.0.md` — 9 files total, no application code.

## Environment assumptions

- No build/runtime health checks were applicable or run: there is no application to build (`Stage 6 = NOT_STARTED`, no package manifest of any kind exists).
- No secrets, tokens, or credentials were encountered or need to be excluded from any migration document.
