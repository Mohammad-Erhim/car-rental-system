# AI Delivery Manifest

Authoritative pointer to the latest accepted artifacts. Do not infer "latest" from filename sorting.

| Artifact                   | Latest accepted version | Path                                                         | SHA-256                                                            |
| -------------------------- | ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Functional Requirements    | 1.0                     | `01-functional-requirements/functional-requirements-v1.0.md` | `02bf737d41d727db4de7b9e4d53c0ffdec094c8be5eba1c72238dbe94b725eb3` |
| UI/UX Design and Flow Plan | 1.0                     | `02-ui-ux-design/ui-ux-design-plan-v1.0.md`                  | `a0a8d184d025c4acad863152a51644fc4433b9241bdb633a95c9088068df7c67` |
| SRS                        | 1.0                     | `03-srs/srs-v1.0.md`                                         | `b8eb084f421d6b6a77c21832969981cbff59301a2e07e079ce6baf3d0de97bbd` |

## Pipeline status

| Stage                      | Status                                                 |
| -------------------------- | ------------------------------------------------------ |
| 01 Functional Requirements | Accepted (unscored; Phase 2 skipped by user)           |
| 02 Score/Refine FR         | Skipped by user                                        |
| 03 UI/UX Design Plan       | Accepted (unscored)                                    |
| 04 Score/Refine UI/UX      | Skipped by user                                        |
| 05 SRS                     | Accepted (implementation-ready baseline)               |
| 06 Implement System        | IN PROGRESS — see `04-implementation/current-state.md` |

## Source copies

The three source documents are also kept at the repository root (`functional-requirements-v1.0.md`,
`ui-ux-design-plan-v1.0.md`, `srs-v1.0.md`) as delivered. The copies under `docs/ai-delivery/` are the
pipeline-structured references and are byte-identical (see hashes above).
