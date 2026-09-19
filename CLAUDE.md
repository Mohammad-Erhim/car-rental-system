# Working in this repo

Orientation for anyone (human or agent) changing this codebase. `README.md` covers how to run
it; this file covers how it is organised and the rules for keeping it that way.

## The one rule that matters most

**Never solve the same problem twice in two apps.** If `apps/web` and `apps/site` both need
it — an API client, auth/session handling, form-error mapping, a query-client, a formatter, a
React hook, a type — it goes in a `packages/*` library and both import it. A file header that
says "adapted from" or "ported from" another app is a bug report, not a comment.

`apps/mobile` (React Native/Expo) is the fourth app and the same rule applies, with one caveat:
`packages/client` is documented as a *browser* runtime (`apiFetch` reads `document.cookie`,
`token-store`/`return-to` use `localStorage`/`sessionStorage`) and has no injection seam, so
`apps/mobile` cannot literally import its `apiFetch`/token-store/React hooks the way `apps/web`
and `apps/site` do. What it *does* reuse: `packages/contracts` and `packages/theme` (already
framework-agnostic), `packages/i18n` including its React bindings (DOM-touches are all guarded
no-ops), and `packages/client`'s root-level `ApiError`/`createQueryClient` (genuinely DOM-free).
Its own `src/lib/api/*` reimplements only the browser-specific glue (fetch orchestration, session
state, refresh/step-up), deliberately kept in lockstep with `packages/client`'s browser version —
see that directory's doc comments before assuming something there is duplicated by accident.

Precedence when they conflict: an explicit spec/DEC decision > an existing project convention >
personal preference.

## Monorepo shape

```
apps/api    NestJS modular monolith + worker + Drizzle (schema / migrations / seed)
apps/web    Vite React SPA — operations & admin dashboard (APP-OPS), served under /ops
apps/site   Next.js 14 App Router — customer surface (APP-CWEB): SSG/ISR, /[locale]/, SEO
apps/mobile Expo/React Native — customer surface as a native app: expo-router, same contracts
            and (mostly) the same session model as apps/site, see apps/mobile/README.md
packages/config     shared tsconfig + ESLint presets (incl. the module-boundary rule)
packages/contracts  zod schemas + types — the API boundary, shared by all three apps
packages/client     framework-agnostic browser runtime: apiFetch, ApiError, token store,
                    refresh orchestration, query-client factory, useFormErrors, return-to
packages/i18n       locale config, ICU translator, formatters, React bindings
packages/theme      brand tokens -> CSS variables (light/dark), ops-managed
packages/ui         shadcn/ui-derived primitives + AppStateView
```

Build order is dependency order: `pnpm build:packages` builds `theme, contracts, i18n, client,
ui` before any app. Apps never import another app; packages never import an app or another
package's internals (only its published entry point).

## API module anatomy (`apps/api/src/modules/<domain>/`)

One domain per folder. Within a folder:

| File                     | Role                                                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<domain>.module.ts`     | the NestJS module — imports, controllers, providers, exports. **Every domain folder that wires routes or is imported elsewhere has exactly one.**                                                                    |
| `<domain>.controller.ts` | HTTP surface. Always its own file — never declare a controller inline in the `.module.ts`. Split by audience with `<domain>.ops.controller.ts` (staff, `path: 'ops'`) vs `<domain>.controller.ts` (public/customer). |
| `<domain>.service.ts`    | business logic. Additional services get a descriptive name (`reservation-ops.service.ts`).                                                                                                                           |
| `<domain>.public.ts`     | **the only thing other modules may import from this one** (SRS-ARC-001). A thin `@Injectable()` facade. Enforced by `apiModuleBoundaries` in the ESLint preset.                                                      |
| `<domain>.repo.ts`       | data access for the hot/shared queries of this aggregate (see below). Optional; introduce when a query is built in more than ~2 places or needs shared scoping.                                                      |
| `*.test.ts`              | unit tests (pure logic — calculators, engines). Integration tests live in `apps/api/test/`.                                                                                                                          |

A folder with only services and no `.module.ts` (`availability`, `pricing`, …) is a
**sub-domain** deliberately folded into a parent module. That's allowed; it must still expose
its cross-module surface through the parent's `.public.ts`.

When you add a module: register it in `apps/api/src/app.module.ts` **and** in `API_MODULES` in
`apps/api/eslint.config.mjs` (or the boundary rule silently won't cover it).

### Routes

- Every controller sets an explicit `path` — `@Controller({ path: 'ops/foo', version: '1' })`,
  never a bare `@Controller({ version: '1' })` where the path hides in method decorators.
- Staff endpoints declare `@Permissions(...)` on **every** method. Public endpoints use
  `@Public()`; customer-authed endpoints just require a valid actor. Sign-in enforces that a
  session's audience always equals the account kind (one email = one account = one kind), so a
  customer session can only ever belong to a customer account and vice versa — and
  `@RequireAudience('staff' | 'customer')` is available to assert it per controller.
- A branch-aware list resolves its `locationCode` query (comma-separated, multi-select) through
  `effectiveLocationCodes(actor, raw)` and guards a single record with `assertRecordInScope(...)` — a
  rental/reservation belongs to its pickup AND return branch. An endpoint that covers the whole
  organisation (settings, audit, payments config…) is marked `@OrgWide()`, which refuses accounts
  limited to specific locations. See DEC-029.
- `apps/api/test/route-manifest.spec.ts` snapshots the full method + path + guard table. If your
  change moves a route or drops a guard, that test fails — update the snapshot deliberately.

### Data access

Services may use Drizzle directly for one-off queries. But a query that is (a) built in more
than two places, (b) needs a soft-delete / status filter, or (c) is a natural place to later
add caching or a read replica goes in `<domain>.repo.ts` (see `iam/account.repo.ts` for the
shape). Org/location scoping is threaded explicitly as an `orgId` argument through service
inputs — keep that convention rather than reading it from the actor deep in a query.

## Frontend anatomy

- **All API traffic** goes through `@carrental/client` (`apiFetch` + `ApiError`). Apps never
  hand-roll `fetch` against `/api/v1`, never re-implement the 401-refresh dance, never define a
  second `ApiError`. (`apps/mobile` is the one exception to "goes through `@carrental/client`"
  for `apiFetch` itself — see the "one rule" section above — but still reuses its `ApiError`.)
- **Query keys + shared response hooks** live in `@carrental/client` too. App-local
  `lib/*-hooks.ts` files hold only genuinely surface-specific composition.
- The React provider tree (`QueryClientProvider` config, `AuthProvider`) uses the shared
  factories; only the outer shell differs per app. `apps/mobile` mirrors the shape of
  `@carrental/client/react`'s `AuthProvider` (same session model) rather than importing it, for
  the same browser-only reason.
- UI primitives come from `@carrental/ui` on the web apps; don't import `@radix-ui/*` directly in
  `apps/web`/`apps/site` unless the primitive genuinely doesn't exist yet (then add it to `ui`).
  `apps/mobile` has its own `src/components/ui` — `@carrental/ui`'s components are DOM/Radix-based
  and not portable to RN — styled from the same `@carrental/theme` tokens instead of a parallel
  palette.

## Contracts-first workflow

1. Change or add the zod schema/types in `packages/contracts`.
2. `pnpm build:packages` then implement the API against the new type.
3. `pnpm openapi:generate` and commit `apps/api/openapi.json`.
4. `pnpm --filter @carrental/contracts check:drift` must pass (types ↔ OpenAPI ↔ implementation).

## Verification map

| Command                                          | What it guards                                                 | When                                         |
| ------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------- |
| `pnpm verify:static`                             | prettier, eslint (incl. module boundaries), tsc, openapi drift | before every commit                          |
| `pnpm verify:unit`                               | Vitest unit/component across api + packages                    | before every commit                          |
| `pnpm verify:api`                                | integration vs real Postgres/Redis                             | before pushing API changes                   |
| `pnpm verify:migrate`                            | empty → current migration proof                                | when touching schema/migrations              |
| `pnpm verify:i18n` / `:theme` / `:seo` / `:a11y` | those subsystems                                               | when touching them                           |
| `pnpm verify:e2e`                                | Playwright flows across 3 viewports                            | **locally before pushing** UI / flow changes |
| `pnpm verify:all`                                | everything                                                     | before opening a PR                          |

CI (`.github/workflows/ci.yml`) runs the fast tier (static, unit, api, i18n-theme) on every PR
and gates merge on the `CI passed` check; `security` also runs on merge to `main` and nightly.
The Playwright **end-to-end suite is not in CI** — it is slow, needs a browser download and the
full stack, and its failures are noisy. Run `pnpm verify:e2e` locally before pushing changes
that touch the UI or a user flow.

## Housekeeping

- Money is integer minor units, always. `parseFloat` on money is an ESLint error.
- No literal colours in components — theme tokens only (`verify:theme` enforces).
- Evidence screenshots are **not** committed — they're CI artifacts. `**/screenshots/*.png` is
  gitignored.
- Design decisions are recorded as `DEC-0xx` in `docs/ai-delivery/04-implementation/decisions.md`;
  reference the id in code comments rather than re-explaining.
