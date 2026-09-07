# Current State

_Concise, authoritative. Update after every meaningful verified unit._

- **Approved scope:** Full system minus APP-CMOB frontend (see `selected-scope.md`). Backend,
  APP-CWEB, APP-OPS all in scope. Autonomous multi-stage build (user: "never stop before 100%").
- **Source versions:** FR 1.0, UI/UX 1.0, SRS 1.0 (hashes in `source-manifest.md`).
- **Active stage:** STAGE-005 — Pickup, active rental, return & closeout.
- **Stage status:** IN_PROGRESS (starting).
- **Last completed:** STAGE-004 — Reservation operations. COMPLETED 2026-09-07. Gate:
  `verify:static` PASS, `verify:unit` 63, `verify:api` 44 (6 reservation-ops), `verify:migrate` 4,
  `verify:e2e` 69 (phone/tablet/laptop, 81 screenshots, 0 console/network errors). Evidence in
  `stages/STAGE-004-reservation-ops/`.
- **Last verified tests:** as above.
- **Unresolved defects / blockers:** none. STAGE-001..004 defects (D-001..D-004) all fixed.
- **Environment:** no Docker; PostgreSQL 16 + Redis 7 native (`scripts/dev-up.sh`). ~1.9 GB RAM ⇒
  single Vite SPA for both surfaces (DEC-004/018); API runs via `@swc-node/register` on source
  (tsc→dist build deferred to STAGE-007). Chromium-only E2E (Firefox/WebKit → STAGE-007).
- **Frontend stack:** React 18 + Vite 5 + TypeScript + shadcn/ui + React Router v6 + TanStack Query.
- **DB state (dev):** migrated to `0004`; seeded system + development. Discovery fixture: 5
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
    persist, hold consume, non-fatal email; guest token + `claim`; recovery case on
    write-after-charge.
  - Reservation ops (STAGE-004): `POST /reservations/:ref/{cancel,modify}` (cancel — idempotent
    - policy refund; modify — hold-new-before-old, re-price + delta settle, capacity-safe),
      `GET .../history`; staff queue + `no-show`; `reconcile` → owned `reconciliation_exception`;
      `recovery_case` list/resolve. Availability now subtracts confirmed reservations.
  - Web: auth context + guards + silent refresh + return-to; shared UI kit; customer
    SCREEN-CUS-001..019 slices + real checkout + trips + reservation detail/modify/cancel/history;
    ops SCREEN-OPS-001/004/013/025/026/030/031/032/034;
    responsive (phone/tablet bottom-nav, laptop header/sidebar; wide tables scroll in-box; no
    horizontal page overflow — `responsive.spec.ts` guard); RTL (Arabic) verified.
- **Exact next action:** STAGE-005 — fleet readiness + unit assignment, pickup verification +
  rental agreement, active rental + extension, incident/roadside + replacement, return +
  inspection + adjustments + settlement + vehicle next-state, after-hours, post-rental
  tolls/fines, fleet transfers/maintenance/blocks/import-export. SCREEN-CUS-020–023,
  SCREEN-OPS-007–020.
- **Files/areas to change (STAGE-005):** new `apps/api/src/modules/{rental,fleet-ops,inspection}`
  (or extend `booking`/`fleet`); extend schema (rental, rental_event, inspection, incident,
  agreement, vehicle transfers/maintenance); `apps/web/src/surfaces/{customer,ops}` (pickup,
  active rental, return, ops fleet lifecycle).
- **Known pre-existing / unrelated working-tree changes:** none (greenfield; specs, `prompts/`,
  and this build only).
- **Lookup / localization status:** system-fixed state sets + configurable lookups are SERVED
  (dynamic API + selectors) and MANAGED (CRUD + audit + invalidation) as of STAGE-001; see
  `lookup-registry.md`. Locales `en`/`fr`/`ar` ACTIVE with fallback + RTL proven;
  `localization-registry.md` updated.
