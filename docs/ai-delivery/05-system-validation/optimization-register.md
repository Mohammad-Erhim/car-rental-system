# Stage 7 — Optimization Register

Stable `S7-OPT-*` IDs. Records each `KEEP` / `FIX` / `REPLACE` / `ADD` / `REMOVE` /
`NEEDS_DECISION` assessment with rationale, full impact map, linked CR/defect/spec IDs,
implementation + test status, and evidence. Rejected and completed entries are never erased.

---

## S7-OPT-001 — First-run datastore papercut: `dev:up` picks Docker, `.env` assumes native

- **User value:** a developer following the README gets a working stack on the first try.
- **Business value:** lowers onboarding friction; fewer "auth failed" support pings.
- **Current problem:** `scripts/dev-up.sh` prefers Docker when the daemon is reachable and starts a
  `postgres` container with password `carrental`. The committed `.env` (and the message the script
  prints) assume the native password `carrental_dev_pw`. Result: `pnpm dev:up && pnpm db:migrate`
  fails with `password authentication failed for user "carrental"` on any host that has Docker.
- **Assessment:** `FIX` (small, source-consistent; no behaviour change to the product).
- **Options:**
  1. Align the compose `POSTGRES_PASSWORD` default to `carrental_dev_pw` (+ `.env.example`), so both
     paths share one dev password.
  2. Have `dev-up.sh` print the correct password for the path it actually chose and, when it chose
     Docker, offer to patch `DATABASE_URL` / write `.env` from `.env.example` with that password.
  3. Document the two-password reality prominently in `README.md` + `deploy/RUNBOOK.md`.
- **Recommended:** (1) + (3). One dev password across both local workflows is the least surprising.
- **Impact:** `compose.yaml`, `.env.example`, `README.md`, `deploy/RUNBOOK.md`,
  `scripts/dev-up.sh` (message text). No product code, no migration, no test change. `compose.prod.yaml`
  is unaffected (real secrets via env).
- **CR required?** No — developer-environment ergonomics, no accepted-baseline behaviour change.
  Record as a Stage 7 technical decision.
- **Applied (2026-09-08):** `compose.yaml` `POSTGRES_PASSWORD` + both `DATABASE_URL(_TEST)` →
  `carrental_dev_pw` (was `carrental`), matching the native `scripts/dev-up.sh` default and the
  committed `.env`. `.env.example` DB URLs → `carrental_dev_pw` (a well-known local dev value,
  not a secret — the real secrets keep `REPLACE_ME_*`). `dev-up.sh` Docker-branch message
  corrected. `pnpm check:secrets` still green.
- **Status:** IMPLEMENTED — verify with `pnpm dev:up` (Docker path) → `pnpm db:migrate` on a host
  with Docker, and the native path (already used for this Stage 7 run).

---

## S7-OPT-002 — No cross-tab logout propagation

- **Context:** with `S7-DEF-005` fixed (localStorage restore hint), a sign-out in tab A removes
  the hint + clears tab A's memory, but tab B keeps its in-memory access token + `actor` until
  that token expires and a silent refresh fails.
- **Assessment:** `ADD` (small) — a `window.addEventListener('storage', …)` in both `AuthProvider`s
  that calls `clearSession()` when `SESSION_HINT_KEY` is removed in another tab (and optionally
  attempts a refresh when it appears — "signed in elsewhere").
- **Impact:** `apps/web/src/lib/auth.tsx`, `apps/site/src/lib/auth-context.tsx`. Client only.
- **CR required?** No. No SRS clause mandates it ("logout propagation where required").
- **Implemented (2026-09-08, Phase-4):** both `AuthProvider` mount effects now add a
  `window.addEventListener('storage', …)` on `SESSION_HINT_KEY` — `newValue === '1'` (sign-in
  elsewhere) → silent `doRefresh()`; anything else (sign-out) → `clearSession()`; listener torn
  down on unmount. e2e `auth-and-reference.spec.ts` `S7-OPT-002` — sign in tab A, tab B
  authenticated, sign out tab A → tab B lands on `/sign-in`.
- **Status:** IMPLEMENTED.

## S7-OPT-003 — `shot()` e2e helper writes into a committed stage's screenshot dir

- **Context:** `e2e/tests/_helpers.ts` `shot()` writes every named screenshot into
  `docs/ai-delivery/04-implementation/stages/STAGE-000-platform/screenshots/`. Any `verify:e2e`
  run re-renders ~150 committed PNGs, dirtying the working tree with binary churn unrelated to
  the change under test (observed this session; reverted with `git checkout`).
- **Assessment:** `FIX` — point `shot()` at a gitignored `e2e/.screenshots/` (or the current
  stage's dir via an env var the runner sets), and keep the committed evidence bundle a
  deliberate, separate `pnpm` task.
- **Impact:** `e2e/tests/_helpers.ts`, `.gitignore`, maybe `scripts/verify-e2e.sh`.
- **Status:** PROPOSED — low priority; a papercut, not a defect.
