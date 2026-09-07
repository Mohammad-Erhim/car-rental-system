# Current State

_Concise, authoritative. Update after every meaningful verified unit._

- **Approved scope:** Full system minus APP-CMOB frontend (see `selected-scope.md`). Backend,
  APP-CWEB, APP-OPS all in scope. Autonomous multi-stage build (user: "never stop before 100%").
- **Source versions:** FR 1.0, UI/UX 1.0, SRS 1.0 (hashes in `source-manifest.md`).
- **Active stage:** STAGE-004 — Reservation operations (list/detail, modify, cancel, refund, workspaces).
- **Stage status:** IN_PROGRESS (starting).
- **Last completed:** STAGE-003 — Booking & payment. COMPLETED 2026-09-07. Gate: `verify:static`
  PASS, `verify:unit` 63, `verify:api` 38 (7 booking), `verify:migrate` 4, `verify:e2e` 60
  (phone/tablet/laptop, 72 screenshots, 0 console/network errors). Evidence in
  `stages/STAGE-003-booking/`.
- **Last verified tests:** as above.
- **Unresolved defects / blockers:** none. STAGE-001 D-001-1..9, STAGE-002 D-002-1..5, STAGE-003 D-003-1..5 all fixed.
- **Environment:** no Docker; PostgreSQL 16 + Redis 7 native (`scripts/dev-up.sh`). ~1.9 GB RAM ⇒
  single Vite SPA for both surfaces (DEC-004/018); API runs via `@swc-node/register` on source
  (tsc→dist build deferred to STAGE-007). Chromium-only E2E (Firefox/WebKit → STAGE-007).
- **Frontend stack:** React 18 + Vite 5 + TypeScript + shadcn/ui + React Router v6 + TanStack Query.
- **DB state (dev):** migrated to `0003`; seeded system + development. Discovery fixture: 5
  vehicle categories, 8 features, ~54 units across JFK/LHR/PAR, one published rate plan (+ tiers)
  per category. Demo customer (`customer@example.test`) has a `customer` domain row and is a
  resettable fixture. `pnpm --filter @carrental/api db:reset` re-baselines everything.
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
  - Discovery (STAGE-002): `POST /discovery/search` — real-time availability (units − blocks −
    holds, turnaround-padded, operating-hours-gated) per category with a live "from" price;
    `POST /discovery/quote` — itemised versioned expiring quote + `pg_advisory_xact_lock`
    checkout hold (last-unit race proven safe); rate plans (draft → publish, immutable once
    published, publish reflects on search with no redeploy); catalogue + fleet-inventory read.
  - Booking (STAGE-003): `POST /bookings/confirm` — deterministic `RES-` ref, quote+hold
    re-validation, idempotent authorize+capture (`PaymentPort` simulator), atomic reservation
    persist (verbatim quote snapshot + terms/consent), hold consume, non-fatal confirmation
    email; guest token + `claim`; recovery case on write-after-charge. `GET /bookings/{mine,:ref}`.
  - Web: auth context + guards + silent refresh + return-to; shared UI kit; customer
    SCREEN-CUS-001/002/003/004/005/007/008..013/014(list)/024 + real checkout + trips;
    ops SCREEN-OPS-001/013/025/026/030/031/032/034;
    responsive (phone/tablet bottom-nav, laptop header/sidebar; wide tables scroll in-box; no
    horizontal page overflow — `responsive.spec.ts` guard); RTL (Arabic) verified.
- **Exact next action:** STAGE-004 — reservation list/detail, modify (date/vehicle/driver),
  cancel + refund, no-show, pending/expiry, override with reason, history timeline; customer
  reservation & payment workspaces; provider reconciliation. SCREEN-CUS-014–019,
  SCREEN-OPS-004/005/021/022/023/024.
- **Files/areas to change (STAGE-004):** new `apps/api/src/modules/{reservation,case}` (or extend
  `booking`); `payment` refund/reconcile; extend schema (reservation_event/history, refund,
  reconciliation_exception); `apps/web/src/surfaces/{customer,ops}` (reservation detail/modify/
  cancel, ops reservation + payment workspaces).
- **Known pre-existing / unrelated working-tree changes:** none (greenfield; specs, `prompts/`,
  and this build only).
- **Lookup / localization status:** system-fixed state sets + configurable lookups are SERVED
  (dynamic API + selectors) and MANAGED (CRUD + audit + invalidation) as of STAGE-001; see
  `lookup-registry.md`. Locales `en`/`fr`/`ar` ACTIVE with fallback + RTL proven;
  `localization-registry.md` updated.
