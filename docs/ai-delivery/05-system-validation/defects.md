# Stage 7 — Defect Register

Stable IDs, full history. A fixed defect is never deleted — its record stays with `FIXED` /
`VERIFIED` and the fixing commit/evidence. Implementation-stage defects use `D-0NN-*`; Stage 7
uses `S7-DEF-*`.

Severity: `BLOCKER` (release-stopping), `HIGH`, `MEDIUM`, `LOW`.

---

## S7-DEF-001 — Committed `openapi.json` is stale (missing `GET /api/v1/ops/dashboard`)

- **Severity:** LOW (API-contract hygiene; no runtime impact)
- **Applications/layers:** `apps/api` (OpenAPI document), downstream `packages/contracts` consumers, `apps/site`/`apps/web` API typing
- **Source IDs:** SCREEN-OPS-002 (operational dashboard); commit `1efea67`
- **Environment:** branch `implementation` @ `1efea67`
- **Reproduction:**
  1. `git checkout apps/api/openapi.json` (ensure committed copy)
  2. `pnpm openapi:generate`
  3. `git diff --stat apps/api/openapi.json` → 14 insertions: a new `/api/v1/ops/dashboard` path block
- **Expected:** committed `openapi.json` matches `openapi:generate` output (the repo treats it as a
  checked-in generated artifact; `verify:static` runs `openapi:generate` but only `check:drift`,
  which validates referenced error codes, not the whole document).
- **Actual:** committed copy has 103 paths; generator emits 104. The `1efea67` commit added the
  controller route + KPI service but did not regenerate the committed document.
- **Secondary:** the generated `/api/v1/ops/dashboard` operation has `responses.200.description: ""`
  and no response schema / `@ApiOkResponse` typing — under-documented vs. the other `ops` routes.
- **Evidence:** `evidence/network/S7-DEF-001-openapi-diff.txt` (to capture on fix)
- **Root-cause hypothesis:** missing `pnpm openapi:generate` + commit in `1efea67`; `verify:static`
  does not fail on full-document drift so CI did not catch it.
- **Planned fix:** (a) add `@ApiOkResponse` / DTO annotation to `ReportController.dashboard` so the
  generated operation is typed; (b) regenerate + commit `openapi.json`; (c) consider tightening
  `check:drift` (or adding an `openapi:check`) to fail on full-document drift so this cannot recur.
  Affected files: `apps/api/src/modules/report/*controller*`, `apps/api/openapi.json`,
  possibly `packages/contracts/scripts/check-openapi-drift.mjs` + `package.json`.
- **Regression risk:** low. Re-run `verify:static` + `verify:api` + `verify:contracts` drift.
- **Fix applied (2026-09-08):**
  - Regenerated + kept `apps/api/openapi.json` (adds the `/api/v1/ops/dashboard` path block).
  - Added `openapi:check` script (`git diff --exit-code -- apps/api/openapi.json`) and wired it
    into `verify:static` right after `openapi:generate`, so a stale committed document now fails
    the gate.
  - The "endpoint under-typed" sub-point is **withdrawn**: 0/113 operations in this API carry a
    response schema (only `meta.controller` uses `@ApiOkResponse`) — the thin OpenAPI is the
    codebase convention; typing only the dashboard op would be inconsistent. Not a defect.
- **Status:** VERIFIED (committed in `56e3b64`; `pnpm verify:static` EXIT 0 with the
  `openapi:check` gate active).

---

## S7-DEF-002 — Transactional outbox is never relayed (write side only; no dispatcher/drainer)

- **Severity:** MEDIUM (SRS contradiction + unbounded table growth; no user-visible break in the
  current single-node deployment because the one critical propagation path uses in-process `CacheBus`)
- **Applications/layers:** `apps/api` — `common/outbox/outbox.service.ts`, `apps/api/src/worker.ts`, every
  `OutboxService.emit()` caller (booking, reservation-ops, rental, pricing, config-version, lookup, catalogue)
- **Source IDs:** SRS-FLOW-002, IF-EVT-OUTBOX ("Domains → workers/read models ... Transactional
  outbox"), SRS §"Workers periodically inspect ... outbox messages not delivered ... creates
  actionable evidence", SRS-OBS-006 (outbox backlog metric), SRS-LKP-010 (transactional outbox
  invalidation), SRS-NFR-020
- **Environment:** branch `implementation` @ `1efea67`
- **Reproduction:**
  1. Start API + worker. Perform any event-emitting action (e.g. `POST /api/v1/discovery/quote`
     then confirm a booking, or publish a rate plan).
  2. `select count(*) filter (where delivered_at is null) from outbox_message;` → grows monotonically.
  3. Grep the codebase: the only reads of `outbox_message` outside `emit()` are
     `worker.ts:64-65`, which **count** undelivered rows for a log line. Nothing sets
     `delivered_at`; nothing publishes rows onward; there is no `@OnEvent`/EventEmitter2 consumer.
- **Expected (per SRS):** a worker relays committed outbox rows to their consumers (read models /
  notifications / cache invalidation / integration events), marks them delivered, retries with
  backoff, and dead-letters poison rows; the housekeeping sweep acts on "not delivered" beyond
  logging; `outbox_message` does not grow without bound.
- **Actual:** `emit()` inserts rows inside the aggregate transaction (correct). No relay exists.
  `worker.ts` housekeeping only logs `outboxBacklog: <n>`. Rows are never marked delivered and are
  never pruned. In-process `CacheBus` (`common/cache/cache-bus.ts`) independently handles the
  lookup/translation/catalogue cache-bust, so that one user-visible propagation still works; every
  other emitted event (`reservation.confirmed.v1`, `payment.captured.v1`, `rental.started/closed.v1`,
  `case.opened.v1`, `report.delivery.v1`, `pricing.rate_plan.published`, …) has no consumer.
- **Evidence:** `evidence/database/S7-DEF-002-outbox-backlog.txt` (to capture)
- **Root-cause hypothesis:** the relay worker was scoped (see the `emit()` docstring: "A worker
  relays committed rows…") but never implemented; STAGE-000 shipped only the housekeeping reaper.
- **Planned fix (root cause):**
  1. Implement an outbox relay in `worker.ts` (or a dedicated `OutboxRelay`): claim undelivered
     rows in aggregate-version order with `for update skip locked`, dispatch each to an in-process
     handler registry (start with: cache invalidation via `CacheBus`, notification enqueue), set
     `delivered_at`, bounded retry + attempts counter + dead-letter to `housekeeping-dlq` / a
     `outbox_message.failed_at`.
  2. Add a retention prune (delete delivered rows older than N days) to the housekeeping tick.
  3. Add/confirm the `outbox_backlog` gauge in `observability/metrics.ts` (SRS-OBS-006).
  4. Tests: an emitted event is delivered exactly once; a handler throw retries then dead-letters;
     replay is idempotent (unique event id); backlog gauge reflects reality.
  - Affected files: `apps/api/src/worker.ts`, `apps/api/src/common/outbox/*`,
    `apps/api/src/observability/metrics.ts`, new `test/outbox.spec.ts`, possibly a migration for
    `outbox_message.attempts` / `failed_at` if not present.
- **Regression risk:** MEDIUM — touches a shared primitive. Full `verify:api` + `verify:migrate`
  - a soak of the housekeeping tick. Must not change the transactional write path of `emit()`.
- **Decision needed?** Whether a full relay is in Stage 7 scope or the minimal correct fix is
  (a) drain+mark-delivered+prune with the in-process handlers that actually have consumers today,
  plus (b) a documented `NOT_APPLICABLE` for external integration fan-out (no external consumers
  in scope — APP-CMOB deferred, no third-party integrations live). Leaning (a)+(b): implement the
  drain/prune/metric now, record the external fan-out as explicitly deferred with an owner.
- **Runtime-verified (before fix):** fresh `db:reset`, then one customer booking →
  `evidence/database/S7-DEF-002-outbox-backlog.txt`: `booking.hold.placed.v1`,
  `payment.captured.v1`, `reservation.confirmed.v1` rows, **all `delivered_at IS NULL`**, growing.
- **Fix applied (2026-09-08 — option (a), per `decision-list.md` D-5; user: "continue with best
  practices"):**
  - **`apps/api/src/common/outbox/outbox-relay.ts` (new)** — `runOutboxRelay(db, redis, log, opts)`:
    claims undelivered rows (`for update skip locked`, `seq` order, batched), dispatches each to a
    `registerOutboxHandler(eventType, fn)` registry, sets `delivered_at` on success; on failure
    increments `attempts` + `last_error` and pushes `available_at` out by exponential backoff;
    at `maxAttempts` it dead-letters (calls `onDeadLetter`, marks `delivered_at` with a
    `[dead-letter]` `last_error` so it stops counting as backlog but stays auditable); then prunes
    delivered rows older than `retentionMs` (default 7d) and returns
    `{claimed,delivered,failed,deadLettered,pruned,backlog}`. Ships one real handler
    (`cache-invalidation` for `lookup.invalidated.v1` / `catalogue.changed.v1` /
    `config.translation.published` → durable `INCR cachever:<ns>` + `PUBLISH cache:invalidate`,
    a backstop for the already-synchronous in-process `CacheBus`). External / read-model fan-out
    is the documented extension point — deferred (no such consumer in scope).
  - **`apps/api/src/worker.ts`** — new `outbox-relay` repeatable job every 15 s; dead-letters to
    the existing `housekeeping-dlq`. The `reap` job's outbox line stays as a coarse backstop.
  - **`apps/api/src/observability/metrics.ts`** — `outbox_backlog` gauge now instantiated
    (`Gauge`, no longer `| undefined`) + `setOutboxBacklog(n)`.
  - **`apps/api/src/observability/health.service.ts`** — `readiness()` refreshes the gauge from
    `count(*) where delivered_at is null` (best-effort, never fails readiness). SRS-OBS-006.
  - **`apps/api/test/outbox.spec.ts` (new)** — 4 tests: delivers committed events + backlog→0;
    backoff-then-dead-letter + `onDeadLetter`; retry-not-dead-letter while attempts remain
    (`available_at` pushed forward, next pass claims nothing); retention prune. **4/4 pass.**
  - **Runtime:** `node -r @swc-node/register src/worker.ts` → `worker started` then
    `outbox relay tick claimed:6 delivered:6 … backlog:0` — cleared the leftover rows live.
  - No migration: the `outbox_message` schema already had `attempts`, `last_error`, `available_at`,
    `delivered_at` + the `outbox_pending_idx` — designed for a relay that was never built.
- **Regression risk:** contained. `verify:api` (full) re-run + worker boot smoke — both green.
  `emit()` (the transactional write path) is unchanged.
- **Status:** VERIFIED (committed in `56e3b64`; `verify:api` 146/146 on one clean run + worker
  boot smoke green). External fan-out handlers remain an explicit deferral (owner: whoever adds
  the first external consumer / APP-CMOB).

---

## S7-DEF-003 — `verify:e2e` is RED: `smoke.spec.ts:59` stale after the SCREEN-OPS-002 dashboard landed

- **Severity:** HIGH (a required gate the implementation stage reported green is actually failing
  on a clean run; blocks Stage 7 "technical quality" completion gate)
- **Applications/layers:** `e2e/tests/smoke.spec.ts`; caused by `apps/web` `ops-dashboard.tsx` change in `1efea67`
- **Source IDs:** SCREEN-OPS-002, FR-RPT-001; commit `1efea67`; STAGE-013 close-out claim
  "`verify:e2e` 91 green"
- **Environment:** branch `implementation` @ `1efea67`, native stack, Playwright Chromium,
  `--project=laptop` (phone + tablet pass; laptop 31 pass / 1 fail)
- **Reproduction:** `pnpm verify:e2e` (or `E2E_PROJECTS=laptop E2E_ONLY=smoke pnpm verify:e2e`).
  `smoke.spec.ts:59` "after staff sign-in the dashboard shows the health drill and labelled
  unavailable metrics" fails at line 74:
  `expect(page.getByTestId('metric-unavailable').first()).toContainText('Not available yet')`
  → `<element(s) not found>` (retried once, same).
- **Expected vs actual:** the test dates from when `/ops` was a _foundation slice_ — no
  `GET /api/v1/ops/dashboard`, so every stat card rendered the `metric-unavailable` placeholder
  ("Not available yet"). `1efea67` shipped the real endpoint + `useOpsDashboard()`; on the
  seeded dev DB the call succeeds, so `err` is false and the four `StatCard`s render real numbers.
  `metric-unavailable` now renders **only on a read error** and its text is `t('ops.dash.unavailable')`
  = "Unavailable" (not "Not available yet" — that string moved to the now-unused
  `ops.dash.metricPending` key). The test was not updated with the feature.
- **Evidence:** `e2e/test-results/smoke-operations-dashboard-fc52d-*-laptop*/` (failure screenshot
  - trace from the run); to be re-captured green on fix.
- **Root cause:** `1efea67` completed SCREEN-OPS-002 (controller route, `report.service.opsDashboard`,
  `report.spec` api test, i18n 779) but did not update `e2e/tests/smoke.spec.ts` or remove the
  now-dead `ops.dash.metricPending` i18n key. The STAGE-013 "verify:e2e 91 green" evidence
  predates this commit.
- **Planned fix (root cause, not the symptom):**
  1. Rewrite `smoke.spec.ts:59` to assert the **real** dashboard: heading `Operational dashboard`;
     `getByTestId('ops-dash-stats')` visible with four cards; a numeric value visible (e.g.
     `ops-dash-stats` contains a `tabular-nums` figure); `getByTestId('ops-dash-fleet')` list
     renders; health drill `health-components` db+lookups `data-status="ok"` (keep). Rename the
     test ("…shows real KPI cards and the health drill").
  2. Add a focused assertion for the **error** path (`ops.dash.loadError` + `metric-unavailable`)
     only if cheaply forced; otherwise leave it to the `report.spec` api-level coverage.
  3. Remove the unused `ops.dash.metricPending` key from all 3 locales (or wire it if intended) —
     confirm with `grep -rn metricPending` first; keep `verify:i18n` green.
  4. Re-run `E2E_PROJECTS=laptop E2E_ONLY=smoke`, then the full `verify:e2e` (all 3 viewports).
- **Regression risk:** low — test-only + one dead i18n key. Full `verify:e2e` + `verify:i18n`.
- **Fix applied (2026-09-08):**
  - `e2e/tests/smoke.spec.ts:59` rewritten — now asserts `ops-dash-stats` visible with the
    "Awaiting assignment" / "Today's pickups" card labels, `metric-unavailable` count 0,
    `ops-dash-fleet` visible, and keeps the `health-components` db+lookups `ok` checks. Test
    renamed "…shows real KPI cards and the health drill".
  - Removed the now-dead `ops.dash.metricPending` key from `packages/i18n/src/locales/{en,ar,fr}/common.json`
    (778 keys now, parity kept). `packages/i18n` rebuilt.
  - Verified: `E2E_PROJECTS=laptop E2E_ONLY=smoke pnpm verify:e2e` → 4/4 pass. `pnpm verify:i18n`
    → 778, en/ar/fr complete.
  - **Full `verify:e2e` re-run (2026-09-08) — GREEN all viewports:** phone ✓, tablet 29 pass /
    3 skip, laptop 32 pass. `smoke.spec.ts:59` "…shows real KPI cards and the health drill" passes
    on every project.
- **Status:** VERIFIED (committed in `56e3b64`).

---

## S7-DEF-004 — `POST /bookings/confirm` trusts client-supplied extra prices & labels (no catalogue)

- **Severity:** HIGH (money/agreement integrity; reachable by direct API even though the current
  `apps/site` checkout does not send the field)
- **Applications/layers:** `apps/api` — `modules/booking/booking.controller.ts:38`,
  `modules/booking/booking.service.ts:43,136-145,225-233`; `packages/contracts/src/booking.ts:20-29`
- **Source IDs:** FR-ADM-006 ("Public choices, fleet preparation, agreement content, and final
  charges use the same configured product version"), FR-BKG-_, FR-PAY-_ (charge the authoritative
  amount), FR-PRC-005/006 (extras/protection pricing), SRS §"snapshots the accepted quote/terms",
  SRS §1904 (over-posting tests), STAGE-002 acceptance ("sum of quote lines == total ==
  reservation snapshot"). SCREEN-CUS-005.
- **Environment:** branch `implementation` @ `1efea67`
- **Reproduction (direct API):**
  1. `POST /api/v1/discovery/search` → `POST /api/v1/discovery/quote` → get `quoteReference`.
  2. `POST /api/v1/bookings/confirm` with
     `{ quoteReference, drivers:[…], acceptTerms:true, paymentToken:"sim-ok",
extras:[{ code:"protection_full", label:"Full protection & zero excess", amountMinor:0 }] }`.
  3. Reservation is confirmed; a reservation **line** `kind:'extra'` is persisted with
     `label:"Full protection & zero excess"`, `unitMinor:0`, `amountMinor:0`; the captured amount
     is `quote.total + 0`. The customer now holds an agreement/receipt line for a paid protection
     product at `$0`. Equivalently, any `code`/`label` and any non-negative price can be attached.
- **Expected:** extras must resolve against an authoritative, active, applicable product/version
  (FR-ADM-006); the **server** sets `label` and `amountMinor` from that source; unknown/inactive/
  inapplicable codes are rejected; the priced result is part of the quote snapshot, not a
  request-body addend.
- **Actual:** `zConfirmBookingRequest.extras` = `array({code:str≤60, label:str≤120,
amountMinor:int≥0}).max(20).optional()`. `booking.service` does
  `extrasMinor = extras.reduce((a,e)=>a+e.amountMinor,0)`, `subtotal = quote.subtotal + extrasMinor`,
  charges `subtotal + tax`, and persists each extra verbatim as a reservation line. The only guard
  is `nonnegative()` (so "pay a negative total" is blocked; "pay $0 / any price for any labelled
  product" is not). There is **no product/extra catalogue table** in the schema and **no test**
  in `booking.spec.ts` touches `extras`.
- **Why it's latent today:** `apps/site` checkout renders no extras UI (SCREEN-CUS-005 unbuilt on
  the Next.js surface — see `S7-GAP-S7`), so the happy path sends `extras:[]` or omits it. The
  hole is direct-API only right now, but Stage 7 explicitly audits "direct API bypass of client
  validation" and this is a pre-production money defect.
- **Evidence:** `evidence/network/S7-DEF-004-extras-tamper.*` (to capture with a scripted call)
- **Root cause:** the extras/protection feature was scoped across FR-BKG + FR-ADM-006 + FR-PRC-005/6
  but only a thin request→line pass-through was built; no catalogue, no admin surface, no checkout
  UI, no server-side price authority.
- **Planned fix — two parts:**
  1. **Immediate (Stage 7, security):** stop trusting the field. Until a catalogue exists, the
     booking service must ignore any client-supplied price/label: either reject the request with
     `422` when `extras` is non-empty, or accept only a `code` and resolve it server-side — and
     since nothing can resolve it yet, reject. Add `booking.spec.ts` cases: `extras` with a price
     is rejected; `extras:[]`/omitted still works; the confirmed total still equals the quote.
  2. **Full (needs a decision — likely a CR):** a `product`/`extra` catalogue (table + versioned
     via `config_version` per FR-ADM-006), an `/ops` admin surface (SCREEN-OPS-027), quote-time
     pricing of selected extras, and the `apps/site` checkout step (SCREEN-CUS-005). This is
     material net-new scope, not a repair — flag for the user.
- **Regression risk:** part 1 is low and safe (tightens an input). `verify:api` + the booking e2e.
- **Fix applied — part 1 (2026-09-08):**
  - `packages/contracts/src/booking.ts` — `zConfirmBookingRequest.extras` (client `{code,label,
amountMinor}` objects) **removed**; replaced with `extraCodes: z.array(z.string().min(1).max(60))
.max(20).optional()` — codes only, no client price/label.
  - `apps/api/src/modules/booking/booking.service.ts` — deleted the `extrasMinor`/`extrasTax`
    math and the client-priced `extra` line persist. `subtotal`/`tax`/`total` are now exactly the
    authoritative quote. A non-empty `extraCodes` → `AppError.businessRule('Extras are not
available yet', { reason: 'extras_unavailable' })` (HTTP 422) with a comment pointing at the
    future catalogue.
  - `apps/api/src/modules/booking/booking.controller.ts` — passes `body.extraCodes`.
  - `apps/api/test/booking.spec.ts` — new `S7-DEF-004` test: a legacy `extras:[{…amountMinor:900000}]`
    body is stripped → charged total == quote total, no `extra` line; `extraCodes:['protection_full']`
    → 422 and the customer's booking count is unchanged. **`test/booking.spec.ts` 8/8 pass.**
- **Runtime-verified (2026-09-08)** → `evidence/network/S7-DEF-004-extras-tamper.txt`:
  `extraCodes:["protection_full"]` → **HTTP 422** (`reason=extras_unavailable`), no reservation;
  legacy `extras:[{…amountMinor:500000}]` → HTTP 201 but **confirmed total 12114 == quote total
  12114**, **0 `extra` lines** — the injected amount had no effect. Normal `confirm` (no extras)
  still works. No unexplained server-log errors during the run.
- **Fix applied — part 2 (2026-09-08, Stage 7 D-1 under `CR-20260908-001`):**
  - `apps/api/src/database/schema/catalogue.ts` — `product` table (migration `0007_zippy_crystal`):
    org-scoped `code`, `kind` (extra|protection), `unitPriceMinor`, `currency`, `taxable`,
    `maxQuantity`, `categoryScope`/`locationScope` (empty = everywhere), `sortOrder`, `active`.
    5 seeded products in `seed/discovery.ts`.
  - `apps/api/src/modules/catalogue/product.service.ts` — `ProductService.resolveForBooking()` is
    the one authoritative pricing path: server sets `label` + `amountMinor` from the row; unknown
    / inactive / out-of-scope / currency-mismatch / qty-over-`maxQuantity` → `AppError.businessRule`
    (HTTP 422); repeated codes fold into a capped quantity.
  - `booking.service.ts` — `confirm()` calls `resolveForBooking({ extraCodes, categoryCode,
pickupLocationCode, currency })`, persists each priced result as a snapshotted `extra`
    reservation line, and taxes extras at the quote's effective rate. `subtotal`/`tax`/`total`
    recomputed; the capture matches; the lines still sum to the total.
  - Routes: `GET /catalogue/products?category=&location=` (customer); `GET|POST
/ops/catalogue/products` + `:code/{deactivate,restore}` (`catalogue.manage`). `/ops/catalogue/products`
    screen (SCREEN-OPS-027) + `apps/site` checkout extras step (SCREEN-CUS-005).
  - `booking.spec.ts` `S7-DEF-004` rewritten: legacy client-priced `extras` still stripped
    (this defect's guard holds); `extraCodes:['gps']` → 201 with a catalogue-priced line;
    unknown code → 422. `product.spec.ts` (6) covers the catalogue + pricing + rejection paths.
    e2e: `report.spec.ts` SCREEN-OPS-027 + `booking.spec.ts` SCREEN-CUS-005.
- **Status:** **FULLY RESOLVED (2026-09-08).** Part 1 (server-price guard) + part 2 (real
  catalogue via Stage 7 D-1). Deferred to a follow-up CR (documented): `config_version`
  governance for `product`, localized copy, stock limits, agreement/receipt template lines.

---

## S7-DEF-005 — Persistent refresh cookie is defeated by a `sessionStorage` restore hint (both apps)

- **Severity:** MEDIUM (auth-persistence UX; the Stage 7 auth checklist explicitly lists these cases)
- **Applications/layers:** `apps/site/src/lib/auth-context.tsx:36,60,75,100`;
  `apps/web/src/lib/auth.tsx:34,58,73,100` (identical pattern)
- **Source IDs:** SRS-SEC (session persistence), DEC-021 (shared-origin `SameSite=Lax` refresh
  cookie), governing prompt "Mandatory authentication and session-persistence audit" —
  "browser close/reopen when persistent login is intended", "opening a second tab/window in the
  same browser profile", "redirect back to the intended destination after reauthentication".
- **Environment:** branch `implementation` @ `1efea67`
- **Facts:** the API sets `carrental_rt` as a **persistent** cookie —
  `iam.cookies.ts` `refreshCookieOptions` uses `maxAge = session.expiresAt - now` (not a session
  cookie), `HttpOnly`, `SameSite=Lax`, `Secure` in prod, `Path=/api/v1/auth`. So the design
  intent is "stay signed in for the life of the refresh session, across browser restarts."
- **Reproduction:**
  1. Sign in on `apps/site` (or `/ops`). `carrental_rt` is set with a future `Max-Age`.
  2. Close the browser (or just the tab) and reopen; navigate to `/en/account` (or `/ops`).
  3. Observed: the app shows **anonymous** / redirects to sign-in, although `carrental_rt` is
     still present and valid — because `AuthProvider` only calls `/auth/refresh` when
     `sessionStorage['carrental.session.hint'] === '1'`, and `sessionStorage` is cleared on tab
     close and is **not shared between tabs**. A second tab opened while tab 1 is authed shows the
     same anonymous state.
- **Expected:** on load, if the refresh cookie is valid the session is restored (silent refresh),
  across browser restart and in every tab of the profile, until the refresh session actually
  expires or is revoked.
- **Root cause:** the "skip an expected 401 for never-authenticated visitors" optimization is
  keyed on `sessionStorage` (per-tab, non-persistent) instead of `localStorage` (per-origin,
  persistent, cross-tab).
- **Planned fix (root cause):** move the hint to `localStorage` in both `AuthProvider`s (guarded
  try/catch, same as today); write on `applySession`, remove on `clearSession` and on a failed
  `/auth/refresh`. Keep `return-to` in `sessionStorage` (correct there — it's a one-redirect
  hop). Add an e2e regression: sign in → new `browser.newContext()` seeded with only the
  `carrental_rt` cookie → load a protected route → session restores; and a sign-out →
  cookie cleared → protected route redirects.
- **Regression risk:** low, client-only. `verify:e2e` (auth specs) + manual 2-tab check.
- **Fix applied (2026-09-08):**
  - `apps/web/src/lib/auth.tsx` + `apps/site/src/lib/auth-context.tsx` — the restore hint
    (`carrental.session.hint`) moved from `sessionStorage` to `localStorage` in all three spots
    (write on `applySession`, remove on `clearSession`, read on mount). Comment explains why.
    `return-to` stays in `sessionStorage` (correct — single-hop). Both apps typecheck clean.
  - `e2e/tests/auth-and-reference.spec.ts` — new `S7-DEF-005` test: sign in on `apps/site`, take
    `context.storageState()` (cookies + localStorage, **no** sessionStorage — the "browser
    reopened / new tab" shape), open a fresh `browser.newContext({ storageState })`, load
    `/account`, assert it stays on `/account` (silent refresh) and never bounces to `/sign-in`.
    This test fails on the pre-fix code (no sessionStorage hint → no refresh attempt → redirect).
- **Not done (noted as `S7-OPT-002`):** cross-tab **logout** propagation (a `storage` event
  listener so tab B reacts when tab A signs out) — a separate enhancement, no SRS requirement
  cited; kept out of this surgical fix.
- **Verified (2026-09-08):** `E2E_PROJECTS=laptop E2E_ONLY="auth-and-reference smoke"` → **9/9
  pass**, including `auth-and-reference.spec.ts` "S7-DEF-005: a persisted refresh cookie restores
  the session after the browser is reopened / in a new tab". The test fails on the pre-fix code
  (Playwright `storageState` restores cookies + localStorage but not sessionStorage → old
  `sessionStorage` hint absent → redirect to sign-in).
- **Status:** VERIFIED (committed in `56e3b64`).

---

## S7-DEF-006 — Reference-data "usage count" is a hardcoded `0` stub (FR-ADM-008)

- **Severity:** LOW (misleading, not unsafe — no hard-delete path exists to be dangerous)
- **Applications/layers:** `apps/api/src/modules/config/lookup.service.ts:427-439` (`usage()`);
  surfaced by `GET /api/v1/reference-data/types/{code}/values/{valueCode}/usage` →
  `/ops/config/reference-data` (SCREEN-OPS-030/031)
- **Source IDs:** FR-ADM-008 ("List every business option set with … usage count"; "Destructive
  deletion is blocked when used")
- **Facts:** `usage()` returns `consumers: [...surfaces].map(s => ({ surface: s, count: 0 }))`,
  `totalReferences: 0` — always. The code comment says "minimal usage placeholder — real consumer
  counts land as modules reference lookups". No module ever contributes a real count.
- **Mitigating:** there is **no hard-delete** endpoint for lookup values — only
  `POST …/deactivate` (reversible) + `…/restore`, and system-managed values reject deactivation
  (`lookup.service.ts:323`). So "destructive deletion blocked when used" is satisfied structurally;
  the gap is only the informational count.
- **Impact (revised after checking the UI):** the ops reference-data page
  (`apps/web/src/surfaces/ops/reference-data-page.tsx`) **never calls `…/usage` and never shows a
  count** — the endpoint + its `zLookupUsageResponse` contract are effectively dead. So FR-ADM-008's
  "usage count" requirement is **unimplemented end-to-end** (stub API + no UI), not "a misleading
  number shown to a steward". Nothing user-visible is wrong today; the requirement is just unmet.
- **Fix applied (2026-09-08, `CR-20260908-001` build):**
  - `apps/api/src/modules/config/lookup.service.ts` — `LOOKUP_CONSUMERS`, an explicit, narrow map
    of lookup type → real consumer column(s), each verified against the schema:
    `cancel_reason` → `reservation.cancel_reason_code`; `block_reason` /
    `transfer_reason` → `vehicle_block.reason_code` (split on `kind`); `document_type` →
    `driver_document.doc_type`; `licence_type` → `driver.licence_type`; `country` →
    `driver.licence_country`; `vehicle_feature` → `vehicle_feature.code` +
    `vehicle_category_feature.feature_code`. Generic `*_event.reason_code` columns are
    **deliberately excluded** — their code space spans several types by `type`, so a naive count
    would over-report (a wrong map is worse than an honest zero, per the analysis above).
  - `usage()` now runs a real `count(*)` per mapped reference and returns
    `{ consumers:[{surface,count}], totalReferences, tracked }`. `tracked:false` for a type with
    no mapped consumer, so a `0` is not read as "safe to delete".
  - `setActive(…, active:false)` refuses to deactivate an **in-use** value
    (`AppError.businessRule` / 422, `reason: lookup_value_in_use`) unless `?force=true`;
    `lookup.controller.ts` threads that query flag. System-managed values are already blocked
    entirely (unchanged). No hard-delete path exists.
  - `packages/contracts/src/lookup.ts` — `zLookupUsage.tracked` (optional).
  - `apps/web`: `useLookupUsage` hook; `reference-data-page.tsx` deactivate confirm now fetches
    "where used", shows the count, and sends `force` when the value is in use.
- **Tests:** `apps/api/test/config-lookup.spec.ts` `TEST-LKP-014` — untracked type → `tracked:false`;
  mapped-but-idle → `tracked:true, total 0`; create a `vehicle_block` with `reason_code=maintenance`
  → count ≥ 1; deactivate without `force` → 422 `lookup_value_in_use`; with `?force=true` → 201.
  e2e `auth-and-reference.spec.ts` SCREEN-OPS-031 — the deactivate confirm renders the usage line.
- **Regression risk:** low — read-only count + a new guard on a path that had none. `verify:api`
  - `verify:static` green.
- **Status:** **FIXED (2026-09-08).** LOW; FR-ADM-008 "usage count" + "destructive change blocked
  when used" now implemented end-to-end for the mapped types.

---

## S7-DEF-007 — `traceability-matrix.md` over-claims COMPLETED and has stale (pre-STAGE-011) paths

- **Severity:** MEDIUM (a false "100% traceable / 117 COMPLETED" is exactly what an independent
  Stage 7 audit exists to catch; misleads any reader assessing release readiness)
- **Applications/layers:** `docs/ai-delivery/04-implementation/traceability-matrix.md`
- **Source IDs:** FR-ADM-001, FR-ADM-002, FR-ADM-006, FR-ADM-007, FR-ADM-003; DEC-023 (STAGE-011
  customer-surface split)
- **Findings:**
  1. **FR-ADM-001** ("Search and manage customer records") → mapped to "staff reservation queue
     (`GET /ops/reservations`)" and marked `COMPLETED`. The reservation queue is not a customer-
     record surface. FR-ADM-001 is effectively **not implemented** (no `/ops/customers`, no
     customer controller). See `decision-list.md` D-2.
  2. **FR-ADM-002** ("Customer eligibility restriction and review") — **not present in the
     matrix at all**. `customer_restriction` table exists; no API, no UI, no test.
  3. **FR-ADM-006** ("Extras and protection administration") → mapped to "author cannot approve
     own draft" (the `config_version` approval guard) and marked `COMPLETED`. That is FR-ADM-006's
     _"approval where required"_ clause at best; the extras/protection product catalogue it is
     actually about is **not built** (no `product` table/kind). See `decision-list.md` D-1.
  4. **FR-ADM-007** ("Location and operating-policy administration") → mapped to the
     `config_version` supersede tx + `policy()` reader, marked `COMPLETED`. Only the _operating-
     policy_ half (cancellation fee, fuel rate) exists; locations/hours/instructions/one-way-
     routes/after-hours have **no editor** (`GET /config/locations` is read-only). See D-3.
  5. Several rows carry an honest parenthetical ("policy kind; pricing/product/location kinds
     → 007") but keep `COMPLETED` in the status column, and the "→ 007" work never happened
     (STAGE-007 was release hardening).
  6. **Stale code paths** throughout the customer rows: `surfaces/customer/checkout-page.tsx`,
     `surfaces/customer/home-page.tsx`, `components/search-form.tsx`, route `/vehicle/:categoryCode`.
     The customer surface moved to `apps/site` (Next.js, `/[locale]/vehicles/[categoryCode]`, …)
     in STAGE-011 (DEC-023); the matrix was not updated.
- **Evidence:** `traceability-matrix.md` lines 13, 39, 59, 67-69, 113, 125, 143-156 (this run).
- **Planned fix (part of `S7-Q-014` CR reconciliation):**
  - Re-status the over-claimed rows: FR-ADM-001 `NOT_BUILT` (or `PARTIAL` with a precise note),
    FR-ADM-002 add as `NOT_BUILT`, FR-ADM-006 `PARTIAL`, FR-ADM-007 `PARTIAL` — each linked to
    the `decision-list.md` item and the eventual disposition.
  - Refresh every customer-row code path to the `apps/site` reality.
  - Add a Stage-7 "delivery status" appendix distinguishing v1.0 FR that is implemented,
    partial, or not built, so "COMPLETED" is never asserted for a partial.
- **Regression risk:** none (documentation).
- **Fix progress (2026-09-08):**
  - `traceability-matrix.md` header warning rewritten; the Stage-7 **delivery-status appendix**
    added; **every over-claimed FR-ADM row re-stated** to describe what now exists after the
    `CR-20260908-001` builds (FR-ADM-001 records + reversible merge; FR-ADM-002 restriction
    workflow + enforcement; FR-ADM-003 unified search; FR-ADM-006 extras/protection slice;
    FR-ADM-007 locations editor; FR-ADM-008 usage counts; FR-ADM-011 templates + event rules) —
    each carries a `PARTIAL` note naming its deferred depth + the follow-up CR.
  - `CR-20260907-001/verification.md` "e2e green" line corrected.
- **`SCREEN-CUS-*` code paths — corrected (2026-09-08):** the Stage 7 delivery-status appendix
  now carries an old→new path map (`apps/web/src/surfaces/customer/*` + pre-split routes →
  `apps/site/src/app/[locale]/**`), verified against the `apps/site` tree; the header warning
  points readers at it. The per-row cells above are left as-is (historically accurate for
  `apps/web`) and read through the map — the Status / test / screenshot columns are unchanged
  and correct.
- **Status:** ADDRESSED — matrix header + every over-claimed FR-ADM row re-stated to what exists
  - delivery appendix + `SCREEN-CUS-*` path map. Documentation-only; no code impact. The final
    numeric roll-up ("N COMPLETED") is refreshed in the Phase-4 close pass.
