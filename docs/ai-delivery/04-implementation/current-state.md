# Current State

_Concise, authoritative. Update after every meaningful verified unit._

- **Approved scope:** Full system minus APP-CMOB frontend (see `selected-scope.md`). Backend,
  APP-CWEB, APP-OPS all in scope. Autonomous multi-stage build (user: "never stop before 100%").
- **Source versions:** FR 1.0, UI/UX 1.0, SRS 1.0 (hashes in `source-manifest.md`).
- **Active stage:** STAGE-007 — Release hardening.
- **Stage status:** IN_PROGRESS (starting).
- **Last completed:** STAGE-006 — Administration & reporting (core control plane). COMPLETED
  2026-09-07. Gate: `verify:static` PASS, `verify:unit` 63, `verify:api` 54 (7 report),
  `verify:migrate` 4, `verify:e2e` 81 (phone/tablet/laptop, 0 console/network). Evidence in
  `stages/STAGE-006-administration/` (D-006-1..4). Deferred within 006 (→ STAGE-007): `case`
  retry action, data-quality runner (SCREEN-OPS-039), fleet import wizard + maintenance form
  (SCREEN-OPS-017..020), `pricing`/`product`/`location` config kinds, send-time recipient
  re-authorization.
- **Last verified tests:** as above.
- **Unresolved defects / blockers:** none. STAGE-001..006 defects (D-001..D-006) all fixed.
- **Environment:** no Docker; PostgreSQL 16 + Redis 7 native (`scripts/dev-up.sh`). ~1.9 GB RAM ⇒
  single Vite SPA for both surfaces (DEC-004/018); API runs via `@swc-node/register` on source
  (tsc→dist build deferred to STAGE-007). Chromium-only E2E (Firefox/WebKit → STAGE-007).
- **Frontend stack:** React 18 + Vite 5 + TypeScript + shadcn/ui + React Router v6 + TanStack Query.
- **DB state (dev):** migrated to `0006`; seeded system + development. Discovery fixture: 5
  vehicle categories, 8 features, ~54 units across JFK/LHR/PAR, one published rate plan (+ tiers)
  per category. `system` seed also loads 5 `report_definition` rows. Demo customer
  (`customer@example.test`) has a `customer` domain row and is a resettable fixture.
  `pnpm --filter @carrental/api db:reset` re-baselines everything.
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
  - Rental lifecycle (STAGE-005): assign → pickup (agreement) → extend → return (inspection +
    fuel/damage settlement) → readiness; one open rental per unit (partial unique index).
  - Administration (STAGE-006): `config` versioning — append-only `config_version`, draft →
    submit → approve/reject, author-cannot-approve (FR-ADM-006), approve supersedes prior
    published + emits event; `policy` config (cancellation fee, fuel rate) drives the cancel +
    return flows via `ConfigVersionService.policy()`. `report` — 5 whitelisted aggregates,
    location-scoped rows, `report_run` history, CSV export, `report_schedule`. `GET /ops/audit`
    (masked before/after, read-only).
  - Web: auth context + guards + silent refresh + return-to; shared UI kit; customer
    SCREEN-CUS-001..019 slices + real checkout + trips + reservation detail/modify/cancel/history;
    ops SCREEN-OPS-001/004(+assign)/009/012/013/016/025/026/030/031/032/033/034/035/038 + rental
    board + config versioning + reports hub + audit viewer;
    responsive (phone/tablet bottom-nav, laptop header/sidebar; wide tables scroll in-box; no
    horizontal page overflow — `responsive.spec.ts` guard, now incl. `/ops/config|insights|audit`);
    RTL (Arabic) verified incl. the config editor.
- **Exact next action:** STAGE-007 — release hardening: perf budgets + k6; axe-core + keyboard/SR
  pass; security scans + SRS-SEC tests; full responsive + locale + RTL screenshot sweep of every
  screen; backup/restore rehearsal; deploy artifacts (Dockerfiles, compose, runbook); final
  three-way traceability audit. Fold in STAGE-005/006 deferred items.
- **Files/areas to change (STAGE-007):** perf/k6 harness; `e2e` (axe-core, full sweep);
  security test suite; `deploy/` (Dockerfiles, compose, runbook); `apps/api` tsc→dist build;
  traceability-matrix final pass.
- **Known pre-existing / unrelated working-tree changes:** none (greenfield; specs, `prompts/`,
  and this build only).
- **Lookup / localization status:** system-fixed state sets + configurable lookups are SERVED
  (dynamic API + selectors) and MANAGED (CRUD + audit + invalidation) as of STAGE-001; see
  `lookup-registry.md`. Locales `en`/`fr`/`ar` ACTIVE with fallback + RTL proven;
  `localization-registry.md` updated.
