# AI Delivery Manifest

Authoritative pointer to the latest accepted artifacts. Do not infer "latest" from filename sorting.

| Artifact                   | Latest accepted version                   | Path                                                         | SHA-256                                                            |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Functional Requirements    | 1.0 + **v1.1 amendment** (`CR-20260907-001`, accepted 2026-09-08) | `01-functional-requirements/functional-requirements-v1.0.md` · `…-v1.1.md` | v1.0 `02bf737d41d727db4de7b9e4d53c0ffdec094c8be5eba1c72238dbe94b725eb3` · v1.1 `09542fa817532fb9aea2d3feffc29c45f41e3f0fdd11291517e6c2e9de9215aa` |
| UI/UX Design and Flow Plan | 1.0 + **v1.1 amendment** (`CR-20260907-001`, accepted 2026-09-08) | `02-ui-ux-design/ui-ux-design-plan-v1.0.md` · `…-v1.1.md`                  | v1.0 `a0a8d184d025c4acad863152a51644fc4433b9241bdb633a95c9088068df7c67` · v1.1 `7185772139d34676d541d43cbd5e2a931ed641a7f4b50bd7b4410ccc41ade1a4` |
| SRS                        | 1.0 + **v1.1 amendment** (`CR-20260907-001`, accepted 2026-09-08) | `03-srs/srs-v1.0.md` · `…-v1.1.md`                                         | v1.0 `b8eb084f421d6b6a77c21832969981cbff59301a2e07e079ce6baf3d0de97bbd` · v1.1 `9ebed86c1de1cb08a749c379e1bde57f0502835f0fc41de9b89084e8d1b01803` |
| **latest_system_validation** | Stage 7 — `COMPLETED` 2026-09-08         | `05-system-validation/final-report.md`                       | verified revision: branch `implementation` at the Stage 7 close commit (see `git log`; base `56e3b64`) |

## Pipeline status

| Stage                      | Status                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| 01 Functional Requirements | Accepted (unscored; Phase 2 skipped by user) — v1.1 amendment accepted 2026-09-08 (`CR-20260907-001`) |
| 02 Score/Refine FR         | Skipped by user                                                                                       |
| 03 UI/UX Design Plan       | Accepted (unscored) — v1.1 amendment accepted 2026-09-08                                               |
| 04 Score/Refine UI/UX      | Skipped by user                                                                                       |
| 05 SRS                     | Accepted (implementation-ready baseline) — v1.1 amendment accepted 2026-09-08                          |
| 06 Implement System        | COMPLETED (roadmap STAGE-000..008 + Enhancement Program STAGE-009..013)                                |
| 07 Audit/Test/Fix/Harden   | **COMPLETED 2026-09-08** — `05-system-validation/final-report.md`; system `END-USER RELEASE-READY`     |

## Source copies

The three source documents are also kept at the repository root (`functional-requirements-v1.0.md`,
`ui-ux-design-plan-v1.0.md`, `srs-v1.0.md`) as delivered. The copies under `docs/ai-delivery/` are the
pipeline-structured references and are byte-identical (see hashes above).
