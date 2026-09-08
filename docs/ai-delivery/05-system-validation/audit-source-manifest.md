# Audit Source Manifest — Stage 7

Exact paths, versions, and hashes of every input Stage 7 audits against. Captured at Stage 7
`START`. Re-verify on every `RESUME`.

## Repository

| Fact                              | Value                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch                            | `implementation`                                                                                                                                                   |
| HEAD at Stage 7 start             | `1efea67ffbb192c3747e5775610e253acaa0508a`                                                                                                                         |
| HEAD commit                       | `feat(SCREEN-OPS-002): operational dashboard — real KPI cards + GET /ops/dashboard` (2026-09-08)                                                                   |
| Working tree at start             | clean (verified `git status --porcelain` empty)                                                                                                                    |
| HEAD at hand-off (session import) | `065234b968a6d2878399855c44831e9f449b74e5` — superseded; 5 commits added by the user before Stage 7 start, all in-scope enhancement/QA work, no reconciliation gap |

## Accepted source documents (manifest.md authoritative)

| Artifact                 | Version        | Path                                                                          | SHA-256                                                            |
| ------------------------ | -------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Functional Requirements  | 1.0 (accepted) | `docs/ai-delivery/01-functional-requirements/functional-requirements-v1.0.md` | `02bf737d41d727db4de7b9e4d53c0ffdec094c8be5eba1c72238dbe94b725eb3` |
| UI/UX Design & Flow Plan | 1.0 (accepted) | `docs/ai-delivery/02-ui-ux-design/ui-ux-design-plan-v1.0.md`                  | `a0a8d184d025c4acad863152a51644fc4433b9241bdb633a95c9088068df7c67` |
| SRS                      | 1.0 (accepted) | `docs/ai-delivery/03-srs/srs-v1.0.md`                                         | `b8eb084f421d6b6a77c21832969981cbff59301a2e07e079ce6baf3d0de97bbd` |

## Drafted but NOT accepted (CR-20260907-001 propagation — Stage 7 reconciles these)

| Artifact             | Path                                                                          | SHA-256                                                            | State                                     |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| FR v1.1 amendment    | `docs/ai-delivery/01-functional-requirements/functional-requirements-v1.1.md` | (draft, ~10 KB)                                                    | `IN_PROGRESS` per `baseline-alignment.md` |
| UI/UX v1.1 amendment | `docs/ai-delivery/02-ui-ux-design/ui-ux-design-plan-v1.1.md`                  | `7185772139d34676d541d43cbd5e2a931ed641a7f4b50bd7b4410ccc41ade1a4` | `IN_PROGRESS`                             |
| SRS v1.1 amendment   | `docs/ai-delivery/03-srs/srs-v1.1.md`                                         | (draft, ~9.9 KB)                                                   | `IN_PROGRESS`                             |

## Implementation control files

| File                                                                                 | Role                                                                                |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `docs/ai-delivery/04-implementation/current-state.md`                                | Legacy authoritative implementation state (STAGE-000..013 COMPLETE)                 |
| `docs/ai-delivery/04-implementation/implementation-roadmap.md`                       | STAGE-000..007 roadmap, all COMPLETED                                               |
| `docs/ai-delivery/04-implementation/enhancement-program.md`                          | STAGE-009..013 master plan + progress table                                         |
| `docs/ai-delivery/04-implementation/traceability-matrix.md`                          | Present (contra the session import note that said missing) — re-verified in Phase 1 |
| `docs/ai-delivery/04-implementation/decisions.md`                                    | DEC-001..DEC-026                                                                    |
| `docs/ai-delivery/04-implementation/lookup-registry.md` / `localization-registry.md` | Lookup + locale status                                                              |
| `docs/ai-delivery/00-control/changes/CR-20260907-001/`                               | Open CR: enhancement-program doc drift                                              |

## Toolchain / environment

| Fact                  | Value                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                  | v24.20.0 (repo `engines` `>=20.11.0`; `.nvmrc` present)                                                                                                                                                       |
| pnpm                  | 9.15.0                                                                                                                                                                                                        |
| Package manager scope | 10 workspace projects: `apps/{api,web,site}`, `packages/{config,contracts,i18n,theme,ui}`, `e2e`                                                                                                              |
| Datastores            | PostgreSQL 16 + Redis 7, **native** (`DEV_UP_FORCE_NATIVE=1 pnpm dev:up`) — `.env` password `carrental_dev_pw` matches the native path, not the Docker compose default (`carrental`). See S7-DEF / decisions. |
| DB (dev)              | `carrental_dev` migrated to `0006`, seeded `system` + `development`                                                                                                                                           |
| DB (test)             | `carrental_test`, reset per suite (`db:reset`)                                                                                                                                                                |
| Browser automation    | Playwright Chromium 1129 + ffmpeg 1009 installed (`~/.cache/ms-playwright`). Firefox/WebKit NOT installed — environment-blocked, matches DEC/known residuals.                                                 |
| Host                  | ~1.9 GB RAM, 5.4 GB swap, 31 GB free disk. Next.js build verified to fit.                                                                                                                                     |
| Docker                | 29.1.3 available; not used for datastores (see above)                                                                                                                                                         |

## API surface

`apps/api/openapi.json` — committed copy has **103 paths**; live `openapi:generate` emits **104**
(adds `GET /api/v1/ops/dashboard`). Committed copy is stale → `S7-DEF-001`.
