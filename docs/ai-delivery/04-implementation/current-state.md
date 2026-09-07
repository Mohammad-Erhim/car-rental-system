# Current State

_Concise, authoritative. Update after every meaningful verified unit._

- **Approved scope:** Full system minus APP-CMOB frontend (see `selected-scope.md`). Backend,
  APP-CWEB, APP-OPS all in scope. Autonomous multi-stage build (user: "never stop before 100%").
- **Source versions:** FR 1.0, UI/UX 1.0, SRS 1.0 (hashes in `source-manifest.md`).
- **Active stage:** STAGE-002 — Discovery & quote (catalogue, locations, availability, pricing, holds).
- **Stage status:** IN_PROGRESS (starting).
- **Last completed:** STAGE-001 — Shared identity, config, reference data, UI foundation.
  COMPLETED 2026-09-07. Gate: `verify:static` PASS, `verify:unit` 27, `verify:api` 24,
  `verify:migrate` 4, `verify:e2e` 42 (phone/tablet/laptop, 45 screenshots incl. 1 RTL set,
  0 console/network errors). Evidence in `stages/STAGE-001-foundation/`.
- **Last verified tests:** as above.
- **Unresolved defects / blockers:** none. STAGE-001 defects D-001-1..9 all fixed.
- **Environment:** no Docker; PostgreSQL 16 + Redis 7 native (`scripts/dev-up.sh`). ~1.9 GB RAM ⇒
  single Vite SPA for both surfaces (DEC-004/018); API runs via `@swc-node/register` on source
  (tsc→dist build deferred to STAGE-007). Chromium-only E2E (Firefox/WebKit → STAGE-007).
- **Frontend stack:** React 18 + Vite 5 + TypeScript + shadcn/ui + React Router v6 + TanStack Query.
- **DB state (dev):** migrated to `0001`; seeded system + development. Demo customer
  (`customer@example.test`) now has a `customer` domain row and is a resettable fixture
  (`db:seed` restores `fullName='Demo Customer'`, `localeCode='en'`, prefs cleared).
- **What works now (STAGE-000 + 001):**
  - IAM: register→verify→sign-in→refresh(rotate/reuse-detect)→sign-out; recovery (neutral,
    single-use, revoke-all + security_alert); change-password; profile & preferences (optimistic
    `version`); saved drivers; account data-requests + closure blockers. argon2id + pepper,
    HS256 access JWT, opaque hashed rotated refresh sessions, RBAC (role→permission-action,
    org/location scope), global AuthGuard + PermissionsGuard.
  - Config: lookup catalogue — dynamic value API (locale fallback, active-at, ETag from Redis
    version counter), management (create/edit/reorder/deactivate/restore) with audit + outbox
    `lookup.invalidated` + cache-bust; `system_fixed`/`system_managed` read-only; translation
    catalogue (completeness, draft→review→publish, `legal.*` publish block); organization +
    locations read.
  - Admin: staff & roles (invite, access change, last-admin / privilege-escalation guards).
  - Notify: template render + outbox mail driver + dev viewer; verification / recovery /
    security_alert templates (en/fr/ar).
  - Cross-cutting: append-only audit, transactional outbox, idempotency interceptor, CacheBus.
  - Web: auth context + route/permission guards + silent refresh + return-to; shared UI kit
    (form primitives, Dialog/Tabs/Toast/ConfirmDialog, AppStateView 12 states); customer
    screens SCREEN-CUS-008..013/024; ops screens SCREEN-OPS-001/030/031/032/034; responsive
    (phone/tablet bottom-nav, laptop header/sidebar; wide tables scroll in-box; no horizontal
    page overflow — `responsive.spec.ts` guard); RTL (Arabic) verified.
- **Exact next action:** STAGE-002 — catalogue (vehicle categories, features, rate plans),
  location config + hours/one-way, real-time availability (fleet inventory + demand + holds +
  operating hours + turnaround), itemised versioned expiring quote, checkout hold. Screens
  SCREEN-CUS-001/002/003 + SCREEN-OPS-015/025/026/028. See `stages/STAGE-002-discovery/plan.md`.
- **Files/areas to change (STAGE-002):** new `apps/api/src/modules/{catalogue,fleet,availability,pricing}`;
  extend `database/schema` (vehicle-category/feature/unit, rate-plan, quote, hold);
  `packages/contracts` (catalogue/availability/quote DTOs); `apps/web/src/surfaces/{customer,ops}`
  (search / results / vehicle detail / rate config).
- **Known pre-existing / unrelated working-tree changes:** none (greenfield; specs, `prompts/`,
  and this build only).
- **Lookup / localization status:** system-fixed state sets + configurable lookups are SERVED
  (dynamic API + selectors) and MANAGED (CRUD + audit + invalidation) as of STAGE-001; see
  `lookup-registry.md`. Locales `en`/`fr`/`ar` ACTIVE with fallback + RTL proven;
  `localization-registry.md` updated.
