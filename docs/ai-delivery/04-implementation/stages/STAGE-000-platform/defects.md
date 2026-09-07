# STAGE-000 — defects

| ID | Severity | Description | Status | Resolution |
| --- | --- | --- | --- | --- |
| D-000-1 | Low | Migration `0000` failed: `turnaround_minutes` generated as `jsonb DEFAULT 60` (invalid jsonb literal). | Fixed | Changed `org.ts` column to `integer('turnaround_minutes').default(60)`; regenerated migration. Retest: `pnpm db:migrate` + `verify:migrate` pass. |
| D-000-2 | Low | `/health/live` etc. returned 404 — URI versioning applied `/v1/` prefix to health routes. | Fixed | `OpsController` marked `@Controller({ version: VERSION_NEUTRAL })`. Retest: `curl /health/ready` → 200 with checks; E2E green. |
| D-000-3 | Medium | `eslint --fix` converted 3 NestJS DI constructor-param imports (`HealthService`, `MetricsService`, `MetaService`) to `import type`, eliding the runtime class ref → `Nest can't resolve dependencies … Object at index [1]`. Server + openapi:generate failed. | Fixed | Reverted the 3 imports to value imports; set `@typescript-eslint/consistent-type-imports: 'off'` for `apps/api`. Retest: server boots, `verify:api` + `openapi:generate` pass. |
| D-000-4 | Low | Vite CSS build failed (`postcss` parse error) — a `<html>` token in a JSDoc comment in `packages/ui/tailwind.preset.cjs` was parsed as JSX by `postcss-load-config`'s TS loader and by prettier/eslint. | Fixed | Removed angle-bracket tokens from the comment; `apps/web` inlines its own Tailwind config (no cross-package preset require); prettier/eslint ignore `*.cjs` config files. |
| D-000-5 | Low | Prettier `--write` reformatted the accepted source specs + `prompts/`. | Fixed | `git checkout` restored them (hashes re-match manifest); added them to `.prettierignore`. |

No open defects. No known critical/high defects.
