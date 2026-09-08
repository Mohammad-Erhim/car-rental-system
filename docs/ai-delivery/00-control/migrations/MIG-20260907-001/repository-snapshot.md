# Repository Snapshot — MIG-20260907-001

**Captured:** 2026-09-07 18:54 UTC, before any migration writes.

- **Repo:** `Mohammad-Erhim/car-rental-system`
- **Branch:** `implementation` (tracking `origin/implementation`, up to date, working tree
  clean before this migration started)
- **HEAD at migration start:** `065234b968a6d2878399855c44831e9f449b74e5`
  ("docs(enhancement-program): progress — 009/010/011/012 advanced this session")
- **No repository instruction files found:** no `AGENTS.md` or `CLAUDE.md` anywhere in the
  repository (searched full tree, case-insensitive, excluding `node_modules`).
- **Pre-existing top-level layout:** `apps/{api,web,site}`, `packages/{contracts,ui,i18n,config,
theme}`, `e2e/`, `docs/ai-delivery/`, `deploy/`, `scripts/`, `prompts/` (legacy prompt pack,
  see `legacy-prompt-inventory.md`), root `functional-requirements-v1.0.md` / `srs-v1.0.md` /
  `ui-ux-design-plan-v1.0.md` (documented intentional duplicates of the `docs/ai-delivery/`
  copies — see `manifest.md`), root `CHANGELOG.md` (the project's actual pipeline changelog).
- **Existing `docs/ai-delivery/` structure found:** `manifest.md`,
  `01-functional-requirements/`, `02-ui-ux-design/`, `03-srs/`, `04-implementation/` (fully
  populated through `STAGE-013-system-qa`, including per-stage `plan.md`/`checkpoint.md`/
  `test-evidence.md`/`defects.md`/`screenshots/`). **No** `00-control/` and **no**
  `05-system-validation/` existed before this migration.

## Changes made by this migration (working tree, uncommitted — no commit/push performed)

```
 M .dockerignore                     (dropped stale `prompts/` ignore line)
 M .prettierignore                   (dropped stale `prompts/` ignore line; added prompt-pack
                                       immutability guard)
 D  prompts/*.md (7 files)           (removed — explicit user instruction; a hash-verified copy
                                       is archived first, see legacy-prompt-inventory.md)
 ?? docs/ai-delivery/00-control/     (new — this migration)
 ?? docs/ai-delivery/CHANGELOG.md    (new — thin pointer to root CHANGELOG.md)
 ?? docs/ai-delivery/README.md      (new — installed canonical pack README, hash-verified)
 ?? docs/ai-delivery/prompt-library/ (new — installed pack + legacy archive)
```

No file under `01-functional-requirements/`, `02-ui-ux-design/`, `03-srs/`, `04-implementation/`,
application source (`apps/`, `packages/`), database migrations, tests, or CI/deploy
configuration was modified, deleted, or reverted by this migration. Per the migration prompt's
non-destructive rules, no commit, branch, tag, push, or PR was created — the working tree is left
staged/modified for the user to review and commit.
