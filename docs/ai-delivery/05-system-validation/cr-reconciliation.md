# CR-20260907-001 — Stage 7 reconciliation (S7-Q-014)

**CR status: stays `IN_PROGRESS` — Stage 7 cannot `CLOSE` it yet.**

## What the CR covers

`CR-20260907-001` propagates the **Enhancement Program** (STAGE-009–013: theming/branding,
en/ar/fr i18n, `apps/site` Next.js public surface, full SEO, `/ops` UX overhaul, step-up auth)
into FR / UI-UX / SRS via drafted **v1.1 amendment** documents. It does **not** re-scope any
original v1.0 requirement.

## Stage 7 verification of the v1.1 drafts (spot-checked against the running system)

| Draft claim                                                                                         | Verdict                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCREEN-OPS-040` branding editor → `/ops/config/branding`                                           | **accurate** — route + `branding-page.tsx` + `POST /config/branding/assets` exist                                                                              |
| `SCREEN-OPS-041` SEO settings → `/ops/config/seo`                                                   | **accurate** — route + `seo-page.tsx` + `GET /meta/seo`                                                                                                        |
| `SCREEN-OPS-042` languages admin → `/ops/config/languages`                                          | **accurate** — route + `POST /config/locales` (+ activate/deactivate/default)                                                                                  |
| `SCREEN-OPS-043/044` recovery & reconciliation / data quality → `/ops/finance`, `/ops/data-quality` | **accurate** — routes + `GET /ops/data-quality`, `GET /ops/payments/reconciliation`                                                                            |
| `SCREEN-SHARED-STEP-UP` → `StepUpProvider` dialog + `POST /auth/step-up` + `@StepUp()`              | **accurate** — guard + route + `step-up.tsx` + `step-up.test.tsx` (2 tests)                                                                                    |
| `SRS-SITE-001..004` (Next.js surface, SEO gate, perf budget, standalone serving)                    | **accurate** — `apps/site`, `verify:seo`, `verify:perf` `perf-site.mjs`, `start:standalone`                                                                    |
| `SRS-BRAND-001..003`, `SRS-SEC-018`                                                                 | **accurate** — `config_version` kinds `branding`/`seo`, `stored_object`, magic-byte sniff + SVG sanitiser in `brand-asset.spec.ts` (8 tests), `auth_challenge` |
| v1.1 verification.md: "No behaviour gap introduced … `verify:e2e` … green"                          | **INACCURATE at `1efea67`** — `verify:e2e` was RED (`S7-DEF-003`); the green run pre-dated the SCREEN-OPS-002 dashboard commit. Fixed by Stage 7.              |

**Conclusion on the drafts:** the _additive_ content (new IDs for the Enhancement Program) is
sound. Two corrections needed: (1) the "e2e green" claim, now true again post-`S7-DEF-003`;
(2) the drafts + the traceability matrix must also carry an honest **delivery-status record for
the original v1.0 FR-ADM items** that were never built (below).

## Blocker status (2026-09-08)

1. **`S7-DEF-007` — traceability over-claim.** ✅ **mostly addressed.** The matrix header warning
   is rewritten, the Stage-7 delivery-status appendix is added, and **every** over-claimed
   FR-ADM row (001/002/003/006/007/008/011) is re-stated to describe what now exists after the
   `CR-20260908-001` builds, each with a `PARTIAL` note naming its deferred depth. **Remaining:**
   refresh the stale `SCREEN-CUS-*` **code-path** column to the `apps/site` (Next.js) reality —
   behaviour is delivered + `verify:e2e`-green; only the path strings are wrong.
2. **`decision-list.md` D-1..D-6 unresolved.** ✅ **resolved.** The user gave full authorization
   (2026-09-08) to build; **all items delivered** — D-1 (extras/protection), D-2 (customer
   records + eligibility restrictions + reversible merge), D-3 (locations editor), D-4 (template
   content + event rules), D-5 (outbox), D-6 (unified search), `S7-DEF-006` (usage counts).
   Migrations `0007`–`0011`; each with an API spec + an e2e + `traceability-matrix.md` /
   `decision-list.md` / `CR-20260908-001/verification.md` rows and a documented follow-up-CR
   list for the deferred depth (governance / scheduler / detection layers).
3. **`S7-DEF-002` scope (D-5).** ✅ **done** (option a) — `outbox-relay.ts` (claim → dispatch →
   deliver / backoff / dead-letter → retention prune), 15 s worker job, `outbox_backlog` gauge;
   `outbox.spec.ts` 4/4.
4. **Stage 7 fixes not yet committed.** By design — the pipeline no-auto-commit rule keeps the
   working tree intact; `git diff` + `recovery-snapshot.md` are the recovery source. The v1.1
   SRS draft still needs a note on the `openapi:check` gate and the `extraCodes` contract shape
   (an amendment-doc edit, folded into the acceptance pass).

## Path to CLOSE

- Stage 7 (remaining): refresh the `SCREEN-CUS-*` code paths in `traceability-matrix.md`; a
  clean full `pnpm verify:all` on a host with headroom / in CI; note the `CR-20260908-001`
  D-item deltas in `baseline-alignment.md`.
- User: **`D-7`** — single acceptance pass over FR v1.1 / UI-UX v1.1 / SRS v1.1; plus the
  `CR-20260908-001` acceptance stage-gate.
- Stage 7: `baseline-alignment.md` FR/UI-UX/SRS/Code/Tests → `ALIGNED`; `change-register.md`
  `CR-20260907-001` row → `VERIFIED` then `CLOSED`; `CHANGELOG.md` entry.
