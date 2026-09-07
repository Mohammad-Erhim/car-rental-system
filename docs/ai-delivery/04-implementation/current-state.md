# Current State

_Concise, authoritative. Update after every meaningful verified unit._

- **Approved scope:** Full system minus APP-CMOB frontend (see `selected-scope.md`). Backend,
  APP-CWEB, APP-OPS all in scope. Autonomous multi-stage build (user: "never stop before 100%").
- **Source versions:** FR 1.0, UI/UX 1.0, SRS 1.0 (hashes in `source-manifest.md`).
- **Active stage:** STAGE-001 — Shared identity, config, reference data, UI foundation.
- **Stage status:** IN_PROGRESS (starting).
- **Last completed:** STAGE-000 — Repository & local platform. COMPLETED 2026-09-07.
  Gate passed: `verify:static` (0/0), `verify:unit` (27), `verify:api` (10), `verify:migrate` (4),
  `verify:e2e` (12, 9 screenshots, 0 console/network errors). Evidence in
  `stages/STAGE-000-platform/`.
- **Last verified tests:** as above.
- **Unresolved defects / blockers:** none. STAGE-000 defects D-000-1..5 all fixed.
- **Environment:** no Docker; PostgreSQL 16 + Redis 7 native (`scripts/dev-up.sh`). ~1.9 GB RAM ⇒
  single Vite SPA for both surfaces (DEC-004/018); API runs via `@swc-node/register` on source
  (tsc→dist build deferred to STAGE-007). Chromium-only E2E (DEC/STAGE-007 for Firefox/WebKit).
- **Frontend stack:** React + Vite + TypeScript + shadcn/ui (DEC-004).
- **DB state (dev):** migrated to `0000`; seeded system+development (3 locales, 34 lookup types,
  238 values, 189 translations, 6 accounts, 3 locations, 7 roles, 25 permission actions).
- **Exact next action:** STAGE-001 — implement IAM (register/verify/sign-in/recovery/sessions,
  argon2id + JWT + rotated refresh, RBAC), config module (lookup CRUD API + dynamic selectors +
  translation catalogue + cache invalidation), audit + outbox write paths, and the shared UI
  component set (COMP-SH-001..020) with the 12 STATE-* patterns wired to real data. Screens:
  SCREEN-CUS-008..012, SCREEN-OPS-001/030/031/032/034. Flows: FLOW-CUS-002, FLOW-OPS-014/015/016.
- **Files/areas to change:** `apps/api/src/modules/{iam,config}`, `apps/api/src/common` (auth
  guards, idempotency, ETag), `apps/api/src/database/schema` (extend), `packages/ui` (more
  primitives + domain COMP-SH-*), `packages/contracts` (auth + lookup DTOs), `apps/web/src`
  (auth flows, reference-data screens, shared components).
- **Known pre-existing / unrelated working-tree changes:** none (greenfield; only specs +
  `prompts/` + this build).
- **Lookup / localization status:** system-fixed state sets + configurable lookups + external
  standards are SEEDED (STAGE-000). STAGE-001 adds the dynamic retrieval API, management screens,
  and cache invalidation → moves them to SERVED/MANAGED in `lookup-registry.md`.
