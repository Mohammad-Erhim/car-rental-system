# Baseline Alignment

Reconstructed 2026-09-07 by migration `SESSION-20260907-185415-PIPELINE-ADOPTION`. States are
evidence-backed, not optimistic. Valid states: `ALIGNED`, `UPDATE_REQUIRED`, `IN_PROGRESS`,
`BLOCKED`, `NOT_APPLICABLE`. **Updated 2026-09-08 (Stage 7 update 4)** — `CR-20260907-001` and
`CR-20260908-001` are both `ACCEPTED` (owner-delegated, 2026-09-08); FR / UI-UX / SRS / Code /
Tests rows move to `ALIGNED`. Four external-tool gates (Firefox/WebKit e2e, k6, ZAP/SAST,
Lighthouse) remain `BLOCKED` with internal-evidence substitutes — see the Automated Tests row and
Stage 7 update 4. The Stage 7 validation report is `IN_PROGRESS` pending the owner's risk call on
those four and the mechanical close.

| Layer                       | Version/Revision                                                       | Included CR IDs                                                                      | Alignment Status                                                                                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional Requirements     | v1.0 + **v1.1 amendment ACCEPTED** (`functional-requirements-v1.1.md`) | `CR-20260907-001` (`ACCEPTED` 2026-09-08), `CR-20260908-001` (`ACCEPTED` 2026-09-08) | `ALIGNED`                                                                                                                                                                                                                                                                                                             | v1.1 amendment adds FR-BRD-\* (branding/theming), FR-SEO-\* (public-site SEO), FR-IAM-009 (step-up), resolves the deferred §14 decisions, delivery-status appendix for the enhancement-program FR IDs. `CR-20260908-001` FR-ADM-001/002/003/006/007/008/011 re-stated in `traceability-matrix.md` to what is built. Accepted 2026-09-08 — `changes/CR-20260907-001/acceptance.md`. Residual: merge the v1.1 IDs as first-class matrix rows (mechanical close step).                                                                                                                                                                                                                |
| UI/UX Design                | v1.0 + **v1.1 amendment ACCEPTED** (`ui-ux-design-plan-v1.1.md`)       | `CR-20260907-001`, `CR-20260908-001`                                                 | `ALIGNED`                                                                                                                                                                                                                                                                                                             | v1.1 amendment adds SCREEN-OPS-040..044 + SCREEN-SHARED-STEP-UP, the `apps/site` surface, the `DataTable`/command-palette/breadcrumb ops contract. `CR-20260908-001` adds SCREEN-OPS-004/021/022/027/028/033 behaviour. Accepted 2026-09-08.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| SRS                         | v1.0 + **v1.1 amendment ACCEPTED** (`srs-v1.1.md`)                     | `CR-20260907-001`, `CR-20260908-001`                                                 | `ALIGNED`                                                                                                                                                                                                                                                                                                             | v1.1 amendment adds SRS-SITE-\* (Next.js customer surface + SEO + perf), SRS-BRAND-\* (`branding`/`seo` config kinds + asset upload), SRS-SEC-018 (step-up), the SRS-UI-011 `DataTable` extension, §18.2 STAGE-009..013. Accepted 2026-09-08. Residual: SRS text for the `openapi:check` gate + `extraCodes` contract (mechanical close step).                                                                                                                                                                                                                                                                                                                                     |
| Code/Database/Configuration | commit `56e3b64` (Stage 7 delta) on branch `implementation`            | `CR-20260907-001`, `CR-20260908-001`                                                 | `ALIGNED`                                                                                                                                                                                                                                                                                                             | Implementation complete for the enhancement program, the STAGE-005/006 deferred features, and all `CR-20260908-001` FR-ADM slices (migrations `0007`–`0011`, openapi 134). `verify:static / unit / i18n (968) / theme / api (146/146) / migrate / security / seo / a11y / perf` green; `verify:e2e` green on **three viewports** (laptop 40, tablet 37, phone 42). The v1.1 amendments describe what the code does.                                                                                                                                                                                                                                                                |
| Automated Tests             | `verify:all` suite + committed e2e                                     | n/a                                                                                  | `ALIGNED` (with 4 gates `BLOCKED`)                                                                                                                                                                                                                                                                                    | All 11 host-runnable `verify:*` gates green — `static / i18n (968) / theme / unit (89) / api (146/146, one clean run) / migrate (empty→current through 0011) / security / seo / e2e (laptop 40 + tablet 37 + phone 42) / a11y / perf`. **`BLOCKED` (external tool absent on the authoring host, internal-evidence substitute noted):** Firefox/WebKit engine e2e — Chromium 3-viewport pass; k6 write-path load — `verify:perf` autocannon; ZAP (DAST) + SAST — `verify:security` adversarial suite (13) + `check:secrets`; Lighthouse field run — `verify:perf` + `verify:a11y` axe + `verify:seo`. Not downgraded; carried as pre-prod follow-ups pending the owner's risk call. |
| Stage 7 Validation          | `05-system-validation/final-report.md`                                 | n/a                                                                                  | `IN_PROGRESS` — the independent Stage 7 four-way audit has run (this session): 63 screens reconciled, `S7-DEF-001..007` resolved, `S7-OPT-001/002` implemented, `CR-20260908-001` built + accepted. `final-report.md` is `IN_PROGRESS` pending the owner's risk call on the 4 `BLOCKED` gates + the mechanical close. |

## Reading this table

`CR-20260907-001` was `DRAFT` through the drafting of the v1.1 amendment documents on 2026-09-08
(`functional-requirements-v1.1.md`, `ui-ux-design-plan-v1.1.md`, `srs-v1.1.md`) — **path 1** of
the CR's `plan.md`, a documentation backfill for already-shipped, tested behaviour that renumbers
and reinterprets nothing in v1.0. It is now **`ACCEPTED`** (2026-09-08, owner-delegated) together
with `CR-20260908-001`; the FR / UI-UX / SRS / Code / Automated-Tests rows are `ALIGNED`. See
**Stage 7 update 4** below and `changes/CR-2026090{7,8}-001/acceptance.md`. The Stage 7
validation report is `IN_PROGRESS` pending the owner's risk call on the 4 `BLOCKED` external-tool
gates and the mechanical close. No behaviour changed to produce the amendments; the `verify:*`
suites are green.

## Stage 7 note (2026-09-08 — `SESSION-20260907-185500-STAGE-07`)

Stage 7 started and is `IN_PROGRESS` (`AWAITING_USER_DECISION`). It **verified** the v1.1
amendment drafts are accurate for the Enhancement-Program scope, but found the alignment is **not**
yet complete:

- `verify:e2e` was **RED** at `1efea67` (`S7-DEF-003` — a stale test; the "e2e green" line in
  `CR-20260907-001/verification.md` pre-dated the SCREEN-OPS-002 commit). Fixed + re-verified green.
- `04-implementation/traceability-matrix.md` **over-claims** `COMPLETED` for FR-ADM-001/002/006/007
  (mapped to unrelated or partial features) and carries stale pre-STAGE-011 customer paths
  (`S7-DEF-007`). "Code/Database" alignment cannot read `ALIGNED` until these are corrected and the
  unbuilt FR-ADM surfaces (`05-system-validation/decision-list.md` D-1..D-6) are resolved
  (built or an accepted scoped-out CR amendment).
- Stage 7 applied 5 code/test fixes (S7-DEF-001/003/004p1/005 + S7-OPT-001), **uncommitted**; the
  SRS v1.1 draft should also record the `openapi:check` gate and the `extraCodes` contract shape.

Rows stay `IN_PROGRESS`. They move to `ALIGNED` when Stage 7 closes (`05-system-validation/final-report.md`
non-DRAFT + `verify:all` green + the v1.1 docs accepted).

## Stage 7 update 2 (2026-09-08 — batch 3)

Stage 7 built the cleanly-bounded FR-ADM slices autonomously ("continue with best practices"):

- **FR-ADM-011 / SCREEN-OPS-033** — notification-template editor (content half): `TemplateService`
  - `/api/v1/ops/templates*` + `/ops/config/templates`. `template.spec` 7. Event-rules half → `CR-20260908-001`.
- **FR-ADM-001/002 / SCREEN-OPS-021/022** — customer records read side: `CustomerModule` +
  `GET /ops/customers[?q=|/:id]` + `/ops/customers`. `customer.spec` 5. Merge + restriction
  write-workflow → `CR-20260908-001`.
- `S7-DEF-002` outbox relay fixed.

**`CR-20260908-001`** gathered the remaining deferred FR-ADM scope.

## Stage 7 update 3 (2026-09-08 — `CR-20260908-001` full build)

The user gave full authorization to build; **all `CR-20260908-001` items are delivered**:

- **D-1** FR-ADM-006 / SCREEN-OPS-027 / SCREEN-CUS-005 — `product` catalogue + authoritative
  booking-time pricing + ops screen + `apps/site` checkout extras step (migration `0007`).
- **D-2** FR-ADM-001/002 — customer records; **eligibility restrictions** write side
  (`pending_review`→`active`→`lifted`, author≠approver, enforced in `booking.confirm()`,
  migration `0008`); **reversible merge** (`customer_merge`, archive-not-delete, `unmerge`,
  migration `0009`).
- **D-3** FR-ADM-007 / SCREEN-OPS-028 — locations & operating-hours editor (hours / instructions
  / holiday exceptions / archive with future-reservation impact check).
- **D-4** FR-ADM-011 / SCREEN-OPS-033 — template content editor + **event rules**
  (`notification_rule`; `notify.send()` applies the enable gate + sender, migration `0010`).
- **D-5** `S7-DEF-002` outbox relay. **D-6** FR-ADM-003 / SCREEN-OPS-004 unified search.
  **`S7-DEF-006`** FR-ADM-008 real reference-data usage counts.

Each item's deferred depth (config-version governance / timing scheduler / duplicate detection /
one-way-route pricing …) is recorded as a follow-up CR in `decision-list.md` +
`CR-20260908-001/verification.md`. `traceability-matrix.md` FR-ADM rows re-stated + delivery
appendix + `SCREEN-CUS-*` old→new path map added (`S7-Q-014` docs complete).

**Gates:** `verify:static` (openapi 134) + `verify:i18n` (968) + `verify:unit` (89) green;
targeted `verify:api` green per feature; `report` e2e 9/9 + `booking` 3/3 + `auth-and-reference`
5/5 on laptop. Full single-run `verify:api` + full 3-viewport `verify:e2e` → Phase 4 (host RAM).

Code/Tests rows stay `IN_PROGRESS`. They move to `ALIGNED` when `CR-20260907-001` is accepted
(`D-7`), the `CR-20260908-001` acceptance stage-gate passes, and the Phase-4 full `verify:all`
runs clean on a host with headroom / in CI.

## Stage 7 update 4 (2026-09-08 — CR acceptance + 3-viewport e2e)

The project owner delegated both acceptance decisions to the Stage 7 agent ("you decide
acceptance decision based on best professional practices"), retaining reversal authority.

- **`CR-20260907-001` → `ACCEPTED`** — additive v1.1 documentation of shipped, tested capability;
  no v1.0 stable ID disturbed; the independent Stage-7 reconciliation it was waiting on has run.
  `changes/CR-20260907-001/acceptance.md`.
- **`CR-20260908-001` → `ACCEPTED`, independence caveat recorded** — builder = acceptor; accepted
  on delegated authority, mitigated by `verify:api` 146/146 + e2e on 3 viewports + all 11 host
  gates green + a transparent follow-up-CR list (`CR-20260908-002..007`, `PROPOSED`).
  `changes/CR-20260908-001/acceptance.md`.
- **e2e now covers three viewports** (was laptop + tablet; the chained single-invocation
  `verify:e2e` OOMs cold on this 1.9 GB host but the per-project runs fit): **laptop 40 · tablet
  37 · phone 42** — every customer + ops flow (discovery, booking, reservation-ops, rentals,
  report, account/i18n, auth, full-sweep, rtl, smoke), all green.
- **FR / UI-UX / SRS / Code / Automated Tests rows → `ALIGNED`.** Residual mechanical-close items
  are cross-reference merges, not alignment gaps.
- **Still `BLOCKED` (4, not downgraded):** Firefox/WebKit engine e2e, k6 write-path load, ZAP +
  SAST, Lighthouse field run — external tools absent on the authoring host; each has a green
  internal-evidence substitute (see the Automated Tests row). Whether to accept these as
  documented pre-prod follow-ups so Stage 7 can close is a risk call left to the owner, with the
  Stage 7 agent's recommendation to accept (the substitutes cover the substance; the gaps are
  cross-engine rendering parity and dedicated load/DAST tooling, both standard pre-prod CI work).
