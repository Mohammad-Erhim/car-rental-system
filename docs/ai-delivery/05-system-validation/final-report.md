# Stage 7 — Final Report

**Status: `IN_PROGRESS` (not `COMPLETED`).** The audit + repair pass is done and verified;
**every `CR-20260908-001` build item was built, tested, and doc-propagated** and committed
(`56e3b64`). **Update 2026-09-08:** the owner delegated the acceptance calls ("you decide … based
on best professional practices"); **`CR-20260907-001` and `CR-20260908-001` are both `ACCEPTED`**
(caveat recorded for `-908`: builder = acceptor — `changes/CR-2026090{7,8}-001/acceptance.md`).
`verify:e2e` now covers **three viewports** (laptop 40 · tablet 37 · phone 42). What remains for
`COMPLETED`: the owner's risk call on **4 external-tool gates still `BLOCKED`** (Firefox/WebKit
e2e, k6, ZAP/SAST, Lighthouse — each with a green internal-evidence substitute), then the
~15-minute mechanical close (status flips, matrix backfill, session-folder move).

---

## 1. Scope audited

`APP-SITE` (Next.js customer site, en/ar/fr), `APP-OPS` (Vite SPA, `/ops`), `APP-API` (NestJS —
now **134** OpenAPI paths). Customer + 7 staff roles / 26 permission actions. 63 design screens
reconciled; DB +3 tables this stage (`product`, `customer_merge`, `notification_rule`;
migrations `0007`–`0011`); 34 lookup types; 29 flows +
cross-cutting classes. `APP-CMOB` out of scope (deferred; REST contract in scope).

## 2. Method

Native PostgreSQL 16 + Redis 7. Every `verify:*` gate run from a clean tree (no hidden
failures). Source ⇄ runtime reconciliation against FR/UI-UX/SRS v1.0 (+ the `CR-20260907-001`
v1.1 drafts). Targeted runtime spot-checks for money/auth-sensitive paths (booking extras +
restriction enforcement, outbox relay, horizontal/vertical authz, notification suppression).
Every fix **and** every build carries a permanent regression test (API + e2e).

## 3. Gate results

| Gate              | As found (`1efea67`)                | After Stage 7                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:static`   | PASS                                | **PASS** (+ `openapi:check` staleness gate + contract drift; openapi 134)                                                                                                                                                                                                                                                                                                                                                                      |
| `verify:i18n`     | PASS (779)                          | **PASS** (968 — 9 new/extended screens across en/ar/fr; dead key removed)                                                                                                                                                                                                                                                                                                                                                                      |
| `verify:theme`    | PASS                                | **PASS** — re-run clean                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `verify:unit`     | PASS (89)                           | **PASS** — API 89 + web 13                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `verify:api`      | PASS (102)                          | **PASS — 146 / 146** on one clean single run (11 new/rewritten specs, see §4/§5); `migrate.spec` re-run after `0011` proves empty→current through `0007`–`0011`; all 12 Stage-7 specs green together (61 tests)                                                                                                                                                                                                                                |
| `verify:migrate`  | PASS (4)                            | **PASS (4/4)** — proves empty→current with `0007` product · `0008` customer_restriction.status · `0009` customer_merge · `0010` notification_rule · `0011` customer_merge.moved_reservations                                                                                                                                                                                                                                                   |
| `verify:security` | PASS (13)                           | **PASS (13/13)** — re-run clean; every new route reuses `@Permissions` + Zod DTOs                                                                                                                                                                                                                                                                                                                                                              |
| `verify:seo`      | PASS                                | **PASS** — re-run clean (6 routes × en/ar/fr + robots + sitemap 30 locs + private-route noindex)                                                                                                                                                                                                                                                                                                                                               |
| `verify:e2e`      | **FAIL** (`smoke.spec.ts:59` stale) | **PASS on three viewports** — laptop **40/40** · tablet **37/37** (+3 viewport-gated skips) · **phone 42** (full set incl. discovery/booking/reservation-ops/rentals/report/account-i18n/auth/full-sweep/rtl/smoke; +2 a11y project-skips). The chained single-invocation `verify:e2e` still OOMs cold on this 1.9 GB host; the per-project runs fit and were run. Cross-**engine** (Firefox/WebKit) e2e stays CI-only (browsers absent here). |
| `verify:a11y`     | PASS (2)                            | **PASS (2/2)** — re-run clean; axe-core 0 serious/critical on customer + ops surfaces (incl. every new `/ops` screen)                                                                                                                                                                                                                                                                                                                          |
| `verify:perf`     | PASS                                | **PASS** — re-run clean (perf-smoke + perf-site all within budget; `/checkout` heaviest 240 KB br ≤ 285)                                                                                                                                                                                                                                                                                                                                       |

The implementation stage's "verify:e2e 91 green" pre-dated the `1efea67` dashboard commit; on a
clean run the gate was red until `S7-DEF-003` was fixed.

## 4. Defects — all resolved

| ID         | Sev    | Status               | Summary                                                                                                                                                                                                                                                                                                                               |
| ---------- | ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S7-DEF-001 | LOW    | **FIXED**            | Stale committed `openapi.json`; regenerated + a git-independent `--check` gate in `verify:static`.                                                                                                                                                                                                                                    |
| S7-DEF-002 | MEDIUM | **FIXED + VERIFIED** | Transactional outbox was write-only. Built the relay (claim / dispatch / deliver / backoff / dead-letter / retention prune) + a 15 s worker job + the `outbox_backlog` gauge. `outbox.spec` 4/4; worker runtime-verified.                                                                                                             |
| S7-DEF-003 | HIGH   | **VERIFIED**         | `verify:e2e` RED — stale `smoke.spec.ts` dashboard assertion. Rewritten; suite green.                                                                                                                                                                                                                                                 |
| S7-DEF-004 | HIGH   | **FULLY RESOLVED**   | `POST /bookings/confirm` trusted client-supplied extra price + label → `extraCodes` (codes only), then priced server-side against the **real `product` catalogue** (D-1). Injected amounts have zero effect.                                                                                                                          |
| S7-DEF-005 | MEDIUM | **VERIFIED**         | Persistent refresh cookie defeated by a `sessionStorage` restore hint → `localStorage` in both apps + an e2e `storageState` regression test.                                                                                                                                                                                          |
| S7-DEF-006 | LOW    | **FIXED**            | Reference-data "usage count" was a `0` stub. Now a real `count(*)` over a verified consumer-column map (7 types; ambiguous `*_event.reason_code` deliberately excluded), a `tracked` flag, and an in-use deactivation guard (`?force=true`). `config-lookup.spec` TEST-LKP-014.                                                       |
| S7-DEF-007 | MEDIUM | **ADDRESSED**        | `traceability-matrix.md` over-claims. Header warning rewritten; **every** over-claimed FR-ADM row (001/002/003/006/007/008/011) re-stated to what now exists + a Stage 7 delivery appendix + a `SCREEN-CUS-*` old→new (`apps/web` → `apps/site`) path map. Documentation-only; the numeric roll-up is refreshed in the Phase-4 close. |
| S7-OPT-001 | —      | **IMPLEMENTED**      | One dev DB password (`carrental_dev_pw`) across the native + Docker workflows.                                                                                                                                                                                                                                                        |
| S7-OPT-002 | —      | **IMPLEMENTED**      | Cross-tab auth sync — a `storage` listener on the session hint in both `AuthProvider`s: sign-out elsewhere → `clearSession()`, sign-in elsewhere → silent refresh. e2e `auth-and-reference` `S7-OPT-002`.                                                                                                                             |

`S7-OPT-003` (`shot()` dirties a committed screenshot dir) remains `PROPOSED` — it is test
infrastructure, not product code; the churned PNGs are reverted after each e2e run.

## 5. FR-ADM scope — `CR-20260908-001`, all delivered (2026-09-08)

The original v1.0 FR-ADM operations/admin surfaces the enhancement program never built were
gathered into `CR-20260908-001`. The user authorized the full build; each item ships a **vertical
slice** with its authoritative behaviour, an API spec, an e2e test, and FR/UI-UX-status +
`decision-list.md` + `CR-20260908-001/verification.md` propagation. Deeper governance /
scheduler / detection layers are each recorded as a **named follow-up CR**.

| Item                                                               | Migration | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Deferred → follow-up CR                                                                                                                                                              |
| ------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D-1** FR-ADM-006 / OPS-027 / CUS-005 — extras & protection       | `0007`    | `product` table + `ProductService` (the one authoritative pricing path — rejects unknown / inactive / out-of-scope / currency-mismatch / qty-over-max with 422) + `GET /catalogue/products` (customer) + `GET\|POST /ops/catalogue/products` + `booking.confirm()` prices `extraCodes` into snapshotted `extra` lines + `/ops/catalogue/products` screen + `apps/site` checkout extras step. `product.spec` 6, `booking.spec` S7-DEF-004 + SCREEN-CUS-005, e2e ×2.                                                                                                               | `config_version` governance for `product` (draft / approve / effective-date / terms-version), localized name/description, stock limits, agreement/receipt template-line integration. |
| **D-2** FR-ADM-001 — customer records                              | —         | `CustomerModule` — search (min-2, masked contact, restriction badge) + consolidated record (contact, drivers, reservations, rentals, balance, open cases, restrictions, merge history). `/ops/customers` screen. `customer.spec` 5 + e2e.                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                    |
| **D-2** FR-ADM-002 — eligibility restrictions (write)              | `0008`    | `customer_restriction.status` lifecycle (`pending_review` → `active` \| `rejected`; `active` → `lifted`). Create (`customer.manage`); approve/reject **by a different user** (author → 403); lift. `assertCanTransact()` enforced in `booking.confirm()` for a customer booking — an in-scope active `block` → 422 `customer_restricted`; `review` never blocks. `RestrictionsCard`. `customer-restriction.spec` 3 + e2e SCREEN-OPS-022.                                                                                                                                         | Rental-pickup enforcement; the customer-facing restriction explanation.                                                                                                              |
| **D-2** FR-ADM-001 — reversible merge (write)                      | `0009`    | `customer_merge` table. `POST /ops/customers/:id/merge {intoId}` folds the duplicate into the survivor (moves drivers + restrictions, repoints `reservation.customerId`, marks it `merged` + `mergedIntoId` — **never deleted** — records what moved); `POST …/unmerge` reverses it from that record. `customer.detail().mergeHistory`. `MergeCard`. `customer-merge.spec` 3 + e2e.                                                                                                                                                                                              | Automated duplicate _detection_ (fuzzy match / suggestions).                                                                                                                         |
| **D-3** FR-ADM-007 / OPS-028 — locations & operating-hours editor  | —         | `LocationAdminService` + `/ops/locations*` — upsert (name / timezone / weekly hours / after-hours / instructions / supported categories / turnaround); holiday-closure exceptions; **archive (never delete)** with a future-reservation impact check (`?force`); inverted hours → 422. `/ops/config/locations` screen (7-row hours grid). `location-admin.spec` 4 + e2e SCREEN-OPS-028.                                                                                                                                                                                          | One-way-route pricing editor; per-location localized public content; the map-coordinate confirmation flow; owned reaccommodation-task generation on closure.                         |
| **D-4** FR-ADM-011 / OPS-033 — template content editor             | —         | `TemplateService` + `/ops/config/templates` — subject / body / declared variables, preview with sample values, draft → in review → published with a validation gate (undeclared `{{vars}}` block save; required legal vars must appear to publish; version bump + supersede; emits `notify.template.published.v1`). `template.spec` 7 + e2e.                                                                                                                                                                                                                                     | Per-channel content variants; A/B / locale-specific rules.                                                                                                                           |
| **D-4** FR-ADM-011 — notification event rules (write)              | `0010`    | `notification_rule` table (+ `notification.sender`). One rule per (event, channel): `enabled`, `audience`, `delayMinutes`, `quietHours`, `maxAttempts`, `retryBackoffMinutes`, `escalateAfterAttempts`, `senderIdentity`; absent = built-in default. `GET\|POST /ops/notification-rules` + `:event/:channel/{enable,disable}` (`config.publish`). `notify.send()` **suppresses** a disabled event (`deliveryState: suppressed`, `lastError: rule_disabled`) and stamps the sender identity. `RuleCard` on the templates screen. `notification-rule.spec` 4 + e2e SCREEN-OPS-033. | A scheduler that actually enforces `delayMinutes` / `quietHours` / `escalateAfterAttempts` (stored + surfaced today).                                                                |
| **D-5** `S7-DEF-002` — outbox relay                                | —         | option a — see §4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | External-integration fan-out (no external consumers in scope — APP-CMOB deferred, no live third-party integrations).                                                                 |
| **D-6** FR-ADM-003 / OPS-004 — unified reservation + rental search | —         | `SearchModule` `GET /ops/search` (`reservation.read` \| `rental.read`) — free text on a reference / primary driver / licence / vehicle plate / VIN; `kind` / `status` / `locationCode` / `from` / `to` filters; each hit carries `kind`, an `overdue` flag, the linked `reservationReference`, and an `href` to the owning surface. `/ops/search` screen. `search.spec` 6 + e2e SCREEN-OPS-004.                                                                                                                                                                                  | Saved views; assigned-staff / payment-state / channel / vehicle-category facets; a combined detail drawer.                                                                           |
| **`S7-DEF-006`** FR-ADM-008 — reference-data usage counts          | —         | see §4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Extending the consumer-column map to the `type`-discriminated `*_event.reason_code` columns.                                                                                         |

## 5a. Phase-4 deep-audit hardening (2026-09-08)

Three latent/defensive fixes found reading the new code (none was a live defect):

1. **Reversible merge** — `unmerge()` would repoint the survivor's _own_ reservations if
   `reservation.customerId` were ever populated (it is `null` everywhere today). `merge()` now
   records the ids it moves (`customer_merge.moved_reservations`, migration `0011`); `unmerge()`
   restores only those.
2. **Location archive back-door** — `POST /ops/locations {status:'archived'}` skipped the
   future-reservation impact check. `upsert` now rejects `archived` (`422 archive_via_action`)
   and blocks editing an archived location before it is restored.
3. **Search date filter** — `GET /ops/search?from=<garbage>` threw a `RangeError` (`500`). A
   `parseDate()` guard makes it `422 invalid_string`.

Regression tests added for all three (`customer-restriction` reject path, `location-admin`
archive-via-upsert, `search` malformed date). All 12 Stage-7 API specs green together (61 tests).

## 6. `CR-20260907-001` reconciliation (`S7-Q-014`)

The v1.1 amendment drafts (Enhancement-Program propagation) were re-verified against the running
system, including after the D-item builds: the additive content (FR-BRD-\*, FR-SEO-\*,
FR-IAM-009; SRS-SITE/BRAND/SEC-018) is sound. Corrections made: (1) the "e2e green" line
(RED at `1efea67`, true again post-`S7-DEF-003`); (2) `traceability-matrix.md` — every
over-claimed FR-ADM row re-stated + delivery appendix + `SCREEN-CUS-*` path map + numeric
roll-up refreshed. **`CR-20260907-001` `ACCEPTED` 2026-09-08** (owner-delegated) —
`changes/CR-20260907-001/acceptance.md`; `baseline-alignment.md` FR/UI-UX/SRS rows → `ALIGNED`;
`change-register.md` → `ACCEPTED` (→ `CLOSED` at the mechanical close, matrix ID-backfill merged).

## 7. Environment-blocked (report `BLOCKED`, not downgraded) — 4 gates

External tools absent on the authoring host; **each has a green internal-evidence substitute**:

| Blocked gate                 | Internal-evidence substitute (green)                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Firefox + WebKit engine e2e  | Chromium `verify:e2e` on **3 viewports** (laptop 40 · tablet 37 · phone 42)                    |
| k6 write-path load           | `verify:perf` (autocannon, hot-read p95 ≤ 40 ms, 0 err)                                        |
| OWASP ZAP (DAST) + SAST      | `verify:security` adversarial suite (13) + `check:secrets` + helmet/CORS/CSRF/rate-limit gates |
| Lighthouse LCP/INP field run | `verify:perf` + `verify:a11y` (axe, 0 serious/critical) + `verify:seo`                         |

Whether to accept these 4 as documented pre-prod follow-ups so Stage 7 can close is a **risk call
for the owner**. Stage 7 agent's recommendation: **accept** — the substitutes cover the
substance; the true gaps are cross-engine render parity and dedicated load/DAST tooling, both
standard pre-prod CI work, not in-scope functional defects.

## 8. What full sign-off requires

1. ✅ **`D-7`** — `CR-20260907-001` v1.1 amendments `ACCEPTED` (2026-09-08, owner-delegated).
2. ✅ **`CR-20260908-001` acceptance** — `ACCEPTED` (2026-09-08, independence caveat recorded);
   deferred depth registered as `CR-20260908-002..007` (`PROPOSED`).
3. ✅ **Phase 4** — deep per-branch audit (§5a: 3 latent/defensive fixes + coverage); e2e now on
   3 viewports; numeric traceability roll-up refreshed; screenshot bundle regenerated this
   session (not committed — regenerable, `S7-OPT-003`).
4. ⏳ **Owner's risk call** on the 4 `BLOCKED` gates (§7) — the one remaining decision.
5. ⏳ **Mechanical close** (~15 min, gated on #4): `pipeline-state.md` Stage 07 → `COMPLETED`;
   `change-register.md` CRs → `VERIFIED`/`CLOSED`; `manifest.md` `latest_system_validation`;
   session → `sessions/completed/`; matrix v1.1 ID-backfill merged.

## 9. Release-readiness statement (interim)

For the **verified scope** — the original SRS roadmap (STAGE-000..008), the Enhancement Program
(STAGE-009..013), the Stage 7 repairs (`S7-DEF-001..007`, `S7-OPT-001/002`), and the full
`CR-20260908-001` FR-ADM build (D-1..D-6 + write-side halves) — no known reproducible in-scope
functional, business, auth, validation, persistence, security, accessibility, responsive, or
operational defect remains. `verify:static` / `i18n` / `unit` / `migrate` / `security` / `seo` /
`theme` / `a11y` / `perf` pass; `verify:api` passes **146/146** in one clean run;
`verify:e2e` passes on **three viewports** (laptop 40 · tablet 37 · phone 42). Both CRs are
`ACCEPTED` (2026-09-08). The system is **not yet signed off** for one reason only: the owner's
risk call on the 4 `BLOCKED` external-tool gates (§7), then the ~15-minute mechanical close. The
deferred depth of each FR-ADM item is captured, per item, as a named follow-up CR
(`CR-20260908-002..007`) — none is a silent gap. External-dependency items (§7) are `BLOCKED`
with green internal-evidence substitutes, not failed.
