# Current State

_Concise, authoritative. Update after every meaningful verified unit._

- **Approved scope:** Full system minus APP-CMOB frontend (see `selected-scope.md`). Backend,
  APP-CWEB, APP-OPS all in scope. Autonomous multi-stage build (user: "never stop before 100%").
- **Source versions:** FR 1.0, UI/UX 1.0, SRS 1.0 (hashes in `source-manifest.md`).
- **Active stage:** STAGE-003 — Booking & payment (checkout, drivers, products, terms, confirm, notify).
- **Stage status:** IN_PROGRESS (starting).
- **Last completed:** STAGE-002 — Discovery & quote. COMPLETED 2026-09-07. Gate: `verify:static`
  PASS, `verify:unit` 63 (36 new pure-engine tests), `verify:api` 31 (7 discovery), `verify:migrate` 4,
  `verify:e2e` 54 (phone/tablet/laptop, 63 screenshots, 0 console/network errors). Evidence in
  `stages/STAGE-002-discovery/`.
- **Last verified tests:** as above.
- **Unresolved defects / blockers:** none. STAGE-001 D-001-1..9 and STAGE-002 D-002-1..5 all fixed.
- **Environment:** no Docker; PostgreSQL 16 + Redis 7 native (`scripts/dev-up.sh`). ~1.9 GB RAM ⇒
  single Vite SPA for both surfaces (DEC-004/018); API runs via `@swc-node/register` on source
  (tsc→dist build deferred to STAGE-007). Chromium-only E2E (Firefox/WebKit → STAGE-007).
- **Frontend stack:** React 18 + Vite 5 + TypeScript + shadcn/ui + React Router v6 + TanStack Query.
- **DB state (dev):** migrated to `0002`; seeded system + development. Discovery fixture: 5
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
  - Web: auth context + guards + silent refresh + return-to; shared UI kit; customer
    SCREEN-CUS-001/002/003/008..013/024 + checkout hand-off; ops SCREEN-OPS-001/013/025/026/030/031/032/034;
    responsive (phone/tablet bottom-nav, laptop header/sidebar; wide tables scroll in-box; no
    horizontal page overflow — `responsive.spec.ts` guard); RTL (Arabic) verified.
- **Exact next action:** STAGE-003 — checkout (SCREEN-CUS-004–007), drivers/payer roles,
  extras/protection, terms/consent snapshot, atomic confirmation + duplicate prevention,
  confirmation + notification, guest access, staff-assisted booking (SCREEN-OPS-006). Consume
  the held quote from STAGE-002.
- **Files/areas to change (STAGE-003):** new `apps/api/src/modules/{booking,payment}`;
  extend `database/schema` (reservation, reservation_driver, reservation_line, payment,
  payment_intent, consent_snapshot); a `PaymentPort` simulator; `apps/web/src/surfaces/customer`
  (checkout wizard) + `surfaces/ops` (assisted booking).
- **Known pre-existing / unrelated working-tree changes:** none (greenfield; specs, `prompts/`,
  and this build only).
- **Lookup / localization status:** system-fixed state sets + configurable lookups are SERVED
  (dynamic API + selectors) and MANAGED (CRUD + audit + invalidation) as of STAGE-001; see
  `lookup-registry.md`. Locales `en`/`fr`/`ar` ACTIVE with fallback + RTL proven;
  `localization-registry.md` updated.
