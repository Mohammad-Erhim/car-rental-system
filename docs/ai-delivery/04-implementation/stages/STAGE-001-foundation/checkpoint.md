# STAGE-001 — checkpoint

- **Status:** COMPLETED (2026-09-07).
- **Current subtask:** none — stage gate passed.
- **Objective met:** sign-in / recovery / rotated sessions; organizations & locations read; the
  lookup catalogue (types + values + dynamic selectors + cache invalidation); the translation
  catalogue; RBAC (role → permission-action, org/location scope); append-only audit + transactional
  outbox write paths; the shared UI component set with the 12 STATE-\* patterns wired to real data;
  locale + RTL. All planned screens delivered — no placeholders left in STAGE-001 scope.

## Completed work

### API (`apps/api/src`)

- **`common/auth`** — `jose` HS256 access JWT (sign/verify, short TTL, audience), opaque refresh
  sessions (sha-256 hashed, `family` + reuse-detection: replaying a rotated token revokes the
  family), `@node-rs/argon2` argon2id hash/verify + pepper + rehash-on-login, global `AuthGuard`
  (bearer + `@Public()`/`@OptionalAuth()`/`@RequireAudience()` opt-outs) loading an `Actor` via
  `ActorService`, `PermissionsGuard` + `@Permissions()` resolving role → permission-action, scope
  (`organizationId` + `locationScope`) helpers, `@CurrentActor()` param decorator, path-scoped
  `SameSite=Lax` HttpOnly refresh cookie.
- **`common/idempotency`** — `APP_INTERCEPTOR` dedupes consequential writes by
  `(actorKey, operation, Idempotency-Key)`; replay returns the stored result.
- **`common/audit`** — `AuditService.record()` writing masked before/after diff + reason + actor +
  trace to the append-only `audit_event` table.
- **`common/outbox`** — `OutboxService.emit()` inside the request tx; worker relay.
- **`common/cache`** — `CacheBus` (Redis version counter per key family; `invalidate()` bumps it and
  publishes) → drives lookup / i18n ETags.
- **`modules/iam`** — accounts (customer + staff), `verification.service` (challenges: 15-min TTL,
  60-s resend cooldown, 6 attempts, sha-256 codes, `devCode` outside production), register / verify
  / sign-in (lockout 8 fails / 15 min, neutral 401, staff-audience check) / refresh / sign-out /
  recovery (neutral, single-use, revoke-all + `security_alert`) / change-password, profile +
  preferences (optimistic `version`), saved drivers, account data-requests + closure blockers.
  `iam.public` surface (`accountSummary`, `customerIdForAccount`, `sendInviteChallenge`).
- **`modules/config`** — `lookup.service` (dynamic `getValues` with locale fallback + active-at +
  `includeInactive`; `resolveHistorical`; `createValue` / `updateValue` / `setActive` / `reorder`
  all `assertEditable` — `system_fixed` and `system_managed` rejected; `afterMutation` = audit +
  outbox `lookup.invalidated.v1` + `CacheBus.invalidate`; ETag `W/"lkp-<type>-<version>"`;
  `integrityIssues` feeds `/health/ready`). `translation.service` (completeness by locale ×
  namespace, per-key list with `outdated`, `upsert` draft/review/published, `publish` blocked while
  a `legal.*` key is untranslated). `config.public` (locations, organization, translations).
- **`modules/admin`** — `staff.service` (`listRoles`, `listStaff`, `invite` — validates roles,
  blocks a non-admin granting `administrator`, sends a recovery challenge via `IamPublic`;
  `changeAccess` — blocks self-removal of the last administrator). `AdminController` all
  `@Permissions('staff.manage')`.
- **`modules/notify`** — `notify.service.send` (renders a published `template` or a fallback, writes
  a `notification` row, outbox mail driver marks `sent`), `recent` dev viewer.
- **schema** — added `customer` (+ `driver`, `driverDocument`, `privacyRequest`,
  `customerRestriction`) and `notify` (`notification`, `template`); `lookupValue` gained
  `...actorColumns`. Migration `0001_flimsy_pete_wisdom` + snapshot.
- **seed** — `system.ts` adds permission actions, system roles, and published
  `account_verification` / `account_recovery` / `security_alert` templates (en/fr/ar).
  `development.ts` now seeds the demo customer's `customer` domain row and treats it as a
  resettable fixture (D-001-8).
- **contracts** — `auth.ts` (register/sign-in/session/verify/recovery/change-password/profile/
  session-summary), `account.ts` (driver + privacy request), `lookup.ts`, `translations.ts`.

### Web (`apps/web/src`)

- **`lib/api.ts`** — in-memory access token + `registerRefreshHandler`; `apiFetch` attaches the
  bearer, does one silent refresh on `401` (never for `/auth/*`), parses the Problem envelope →
  `ApiError` (`code` / `status` / `fieldErrors`).
- **`lib/auth.tsx`** — `AuthProvider` (`signIn` / `applySession` / `signOut` / `refresh` /
  `hasPermission`); restores a session on mount only when a `sessionStorage` hint exists (no
  expected `401` on a fresh visit); applies `actor.localeCode` to i18n on session apply
  (ref-tracked). `route-guards.tsx` — `RequireAuth` (stashes return-to) + `RequirePermission`.
  `use-form-errors.ts`, `return-to.ts`.
- **`packages/ui`** — added Input, Textarea, Label, Field (`(optional)` suffix), ErrorSummary,
  Checkbox, RadioGroup/Item/`RadioCardOption`, Dialog\*, Tabs\*, ToastProvider/`useToast`,
  ConfirmDialog — on top of the STAGE-000 primitives + `AppStateView` (12 STATE-\*).
- **Customer screens** — SCREEN-CUS-008 sign-in, 009 register + verify, 010 recovery (3-step,
  neutral), 011 account overview, 012 profile & preferences (409 → STALE + refetch; locale save
  re-renders chrome), **013 saved drivers** (add / remove via confirm), **024 data requests &
  closure** (access/correction/closure, blocker surfaced, cancel). FLOW-CUS-002 return-to.
- **Ops screens** — SCREEN-OPS-001 staff sign-in, 030+031 reference data (catalogue + inline
  label edit + deactivate/restore + read-only reason), 032 staff & roles (invite, access change),
  **034 translation catalogue** (coverage grid, per-key draft→review, publish-reviewed).
  Permission-filtered nav (`anyOf`); an unpermitted section is absent and direct nav →
  `permission-denied`.
- **layouts** — customer nav breakpoint `md`→`lg` (bottom tab bar on phone + tablet, header nav
  at `lg`; D-001-6); ops section nav = `overflow-x-auto` strip below `lg`, sidebar at `lg`.

### E2E (`e2e/tests`)

- `smoke.spec.ts` (updated), `auth-and-reference.spec.ts`, `account-and-i18n.spec.ts` (new),
  `responsive.spec.ts` (new — no-horizontal-overflow guard, names offending elements on failure),
  `rtl.spec.ts` (new). 14 tests × 3 viewports = 42.

## Commands run / verified

- `pnpm db:seed` (dev) — demo customer now has a `customer` row; baseline `localeCode='en'`.
- `pnpm verify:static` → PASS (lint + typecheck + `format:check` all files + openapi + drift).
- `pnpm verify:unit` → 27 PASS. `pnpm verify:api` → 24 PASS. `pnpm verify:migrate` → 4 PASS.
- `pnpm verify:e2e` → 42 PASS (phone/tablet/laptop), 45 screenshots, 0 console/network errors.

## Defects

D-001-1 … D-001-9 — all fixed within the stage (see `defects.md`). No open defects.

## Next exact action

Begin **STAGE-002 — Discovery & quote**: catalogue / locations / rate config; real-time
availability (fleet + demand + holds + hours + turnaround); itemised, versioned, expiring quote;
checkout hold. Source: `implementation-roadmap.md` STAGE-002; plan in
`stages/STAGE-002-discovery/plan.md`.

## Resume notes

- Carried STAGE-000 constraints still apply: API via `@swc-node/register` (clear
  `/tmp/swc-node-1000` on stale behaviour); `consistent-type-imports` OFF for `apps/api`;
  `apps/web` vite/vitest alias `@carrental/*` → package `src`.
- The E2E `webServer` runs against **`carrental_dev`**. The auth/i18n specs are self-contained
  and restore the demo customer's `localeCode` / cancel a closure request they create; `pnpm
--filter @carrental/api db:seed` fully re-baselines the demo customer fixture.
- fr/ar are `testOnly` locales (DEC-020); the sign-in **form copy** is still English-only
  (`isStaff ? 'Staff sign in' : …`) — full screen-copy translation is a STAGE-006/007 item, not
  a STAGE-001 gap.
