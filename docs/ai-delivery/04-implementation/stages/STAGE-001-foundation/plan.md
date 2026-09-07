# STAGE-001 — Shared identity, config, reference data, UI foundation · plan

## Source IDs

FR-GBL-001..008, FR-IAM-001..008, FR-ADM-008/009/012, FR-CAT-004;
SRS-SEC-001..017, SRS-LKP-001..015, SRS-I18N-001..010, SRS-DAT-002/005/007/008,
SRS-API-003/006/007/008, SRS-UI-001..015;
SCREEN-CUS-008/009/010/011/012/013/024, SCREEN-OPS-001/030/031/032/034;
FLOW-CUS-002/010, FLOW-OPS-014/015/016; COMP-SH-001..020.

## Backend

1. **`common/auth`** — access-JWT sign/verify (jose), refresh-session issue/rotate/revoke
   (sha-256 hashed, family, reuse detection), argon2id hash/verify + rehash, `AuthGuard`
   (bearer + cookie), `@CurrentActor()` param decorator, `@Permissions()` guard using RBAC,
   `AuthScope` (org/location) resolution, CSRF double-submit for cookie writes, step-up check.
2. **`common/idempotency`** — interceptor: dedupe consequential `POST`/`PATCH` by
   `(actorKey, operation, Idempotency-Key)`, replay returns stored result, fingerprint mismatch → 409.
3. **`common/versioning`** — `If-Match`/`version` helper + `ETag` on mutable aggregates;
   stale write → 409 with `currentVersion`.
4. **`iam` module** — accounts (customer + staff), contact verification challenges,
   sign-in/out/refresh, recovery + credential change, profile + preferences, drivers +
   documents metadata, account data requests + closure blockers, sessions list/revoke.
   `iam.public` surface for other modules (resolve actor, permissions, scope).
5. **`config` module** — lookup type/value read API (type/scope/active-at/locale/search/cursor,
   stable code separate from label) + management (create/edit/translate/reorder/activate/
   deactivate/restore) with optimistic concurrency, permission+scope, audit, and outbox
   `lookup.invalidated` events; Redis pub/sub cache-bust + version/ETag; translation catalogue
   (draft/review/publish, missing/outdated/fallback report); organization + location read/manage.
   `config.public` surface (get lookup values, translations, locales, org/location).
6. **`common/audit`** — `AuditService.record()` writing masked before/after + reason + actor +
   trace; append-only; query API for SCREEN-OPS-038 (read side lands in STAGE-006, write now).
7. **`common/outbox`** — `OutboxService.emit()` inside a tx; worker relay to Redis + read models.
8. **providers** — `MailPort` (outbox driver: persists rendered message, dev viewer route),
   `IdentityPort` (simulator), `ObjectStoragePort` (fs driver + signed links) — used by
   verification emails, driver documents.

## Web

- **`lib/auth`** — auth context (access token in memory, refresh via httpOnly cookie),
  `useAuth()`, `RequireAuth` route guard, `RequirePermission`, silent refresh on 401,
  return-to preservation (SRS-UI-006, FLOW-CUS-002).
- **Shared components** (`packages/ui` + `apps/web/src/components`): App shell nav with
  permission-filtered items, `LocaleSelector` (COMP-SH-002), `StatusBadge` (COMP-SH-003),
  `Banner` (COMP-SH-004), `ErrorSummary` + field errors (COMP-SH-005), `Combobox`
  (COMP-SH-006, dynamic lookup states), `EntityPicker` (COMP-SH-009), `FilterSortBar`
  (COMP-SH-010), `DataTable`/adaptive list (COMP-SH-011), `StepProgress` (COMP-SH-012),
  `ConfirmDialog` (COMP-SH-013), `UnsavedGuard` (COMP-SH-014), `PermissionGate` (COMP-SH-019),
  `ConnectivityBar` (COMP-SH-020), form primitives (Input, Label, Field, Checkbox, RadioGroup,
  Select, Textarea, Dialog, Tabs, Toast).
- **Customer screens:** SCREEN-CUS-008 Sign In, 009 Register + Verify, 010 Recovery,
  011 Account Overview, 012 Profile & Preferences, 013 Saved Drivers & Documents,
  024 Account Data Requests & Closure. FLOW-CUS-002 return-to; FLOW-CUS-010.
- **Ops screens:** SCREEN-OPS-001 Staff Sign In, 030 Reference Data Catalogue,
  031 Reference Type & Values (manage), 032 Staff & Roles, 034 Translation Catalogue.
  FLOW-OPS-014/015/016.

## Acceptance / tests

- API: register→verify→sign-in→refresh→sign-out; recovery single-use + session invalidation +
  security notification; wrong-scope staff denied; permission denial (horizontal + vertical);
  idempotent double-submit; stale-version 409; lookup edit → `lookup.invalidated` outbox +
  Redis publish + ETag bump → consuming selector sees new value with no redeploy; deactivated
  value hidden from new selection, resolvable on history; translation publish blocks on missing
  mandatory key; account with active-rental blocker cannot be closed (blocker modelled).
- Web E2E: FLOW-CUS-002 (start checkout-less task → sign in → returned to origin with form
  intact); locale switch mid-form keeps data; SCREEN-OPS-031 edit a cancel-reason label →
  reflected in a customer-facing selector; staff without `staff.manage` cannot open SCREEN-OPS-032.
- Screenshots: each screen at phone/tablet/laptop + 1 RTL set of the auth + reference-data flow.
- `verify:static|unit|api|migrate|e2e` all green.
