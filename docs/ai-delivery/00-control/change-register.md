# Change Register

Append-only. One row per change request, in creation order. Never renumber or delete a row.

| CR ID           | Date       | Title                                                                                                                                                                                                                                 | Classification | Status                | Affected layers                                                       | Record                                |
| --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| CR-20260907-001 | 2026-09-07 | Propagate Enhancement Program (STAGE-008..013) scope into Functional Requirements, UI/UX Design Plan, and SRS                                                                                                                         | Change Request | `CLOSED` (2026-09-08) | Functional Requirements, UI/UX Design Plan, SRS                       | `00-control/changes/CR-20260907-001/` |
| CR-20260908-001 | 2026-09-08 | Complete the deferred FR-ADM operations/admin scope (extras/protection, locations editor, unified search, customer-records + eligibility-restrictions + reversible-merge, template content + event-rules, reference-data usage count) | Change Request | `CLOSED` (2026-09-08) | Functional Requirements, UI/UX Design Plan, SRS, Code/Database, Tests | `00-control/changes/CR-20260908-001/` |
| CR-20260908-002 | 2026-09-08 | `product` catalogue depth — `config_version` governance, localized name/description, stock/quantity limits, agreement/receipt template lines                                                                                          | Change Request | `PROPOSED`            | Functional Requirements, SRS, Code/Database, Tests                    | `00-control/changes/CR-20260908-002/` |
| CR-20260908-003 | 2026-09-08 | Locations editor depth — one-way-route pricing, localized public content, map-coordinate confirmation                                                                                                                                 | Change Request | `PROPOSED`            | Functional Requirements, UI/UX Design Plan, SRS, Code/Database, Tests | `00-control/changes/CR-20260908-003/` |
| CR-20260908-004 | 2026-09-08 | Unified search depth — saved views + assigned-staff / payment-state / channel facets                                                                                                                                                  | Change Request | `PROPOSED`            | UI/UX Design Plan, Code/Database, Tests                               | `00-control/changes/CR-20260908-004/` |
| CR-20260908-005 | 2026-09-08 | Eligibility restrictions depth — rental-pickup enforcement + customer-facing explanation copy                                                                                                                                         | Change Request | `PROPOSED`            | Functional Requirements, UI/UX Design Plan, Code/Database, Tests      | `00-control/changes/CR-20260908-005/` |
| CR-20260908-006 | 2026-09-08 | Customer records depth — automated duplicate detection                                                                                                                                                                                | Change Request | `PROPOSED`            | Functional Requirements, Code/Database, Tests                         | `00-control/changes/CR-20260908-006/` |
| CR-20260908-007 | 2026-09-08 | Notification rules depth — scheduler that executes delay / quiet-hours / escalation                                                                                                                                                   | Change Request | `PROPOSED`            | Functional Requirements, SRS, Code/Database, Tests                    | `00-control/changes/CR-20260908-007/` |
| CR-20260908-008 | 2026-09-08 | Pre-prod CI gate backlog — Firefox/WebKit engine e2e, k6 write-path load, OWASP ZAP + SAST, Lighthouse LCP/INP field run (Stage 7 accepted these as `BLOCKED` with internal-evidence substitutes)                                     | Change Request | `PROPOSED`            | Tests, DevOps/CI                                                      | `00-control/changes/CR-20260908-008/` |

## Notes

**CR-20260907-001** — created during pipeline-adoption migration
`SESSION-20260907-185415-PIPELINE-ADOPTION` (`00-control/migrations/MIG-20260907-001/`) to make
pre-existing, real documentation drift traceable. See `baseline-alignment.md` and
`migrations/MIG-20260907-001/alignment-gap-register.md` for full evidence. It records a change
that was already implemented under direct user mandate
(`04-implementation/enhancement-program.md`) but never formally propagated to the specification
documents.

**CR-20260908-001** — raised by the Stage 7 audit (`S7-DEF-007`) to gather the deferred v1.0
FR-ADM operations/admin scope. The user gave **full authorization to build** (2026-09-08); Stage 7
then delivered **all items**, one at a time, each with an API spec + an e2e + FR/UI-UX-status +
`decision-list.md` propagation and a **named follow-up CR** for its deferred depth:

- D-1 extras & protection (FR-ADM-006, migration `0007`); D-2 customer records + eligibility
  restrictions (`0008`) + reversible merge (`0009`) (FR-ADM-001/002); D-3 locations &
  operating-hours editor (FR-ADM-007); D-4 template content editor + notification event rules
  (`0010`) (FR-ADM-011); D-5 outbox relay (`S7-DEF-002`); D-6 unified reservation + rental
  search (FR-ADM-003); `S7-DEF-006` reference-data usage counts (FR-ADM-008).

See `00-control/changes/CR-20260908-001/verification.md` for the per-item evidence.

## Acceptance (2026-09-08)

The project owner delegated both acceptance decisions to the Stage 7 agent on 2026-09-08 ("you
decide acceptance decision based on best professional practices"), retaining reversal authority.

- **CR-20260907-001 → `ACCEPTED`.** Additive v1.1 documentation of already-shipped, tested
  capability; no v1.0 stable ID disturbed; the independent Stage-7 reconciliation the CR was
  waiting on has now run. Full assessment: `changes/CR-20260907-001/acceptance.md`.
- **CR-20260908-001 → `ACCEPTED`, with a recorded independence caveat** — builder and acceptor
  are the same agent; accepted on delegated authority, mitigated by full automated coverage
  (`verify:api` 146/146 + e2e on 3 viewports), all 11 host gates green, and a transparent
  follow-up-CR list for the deferred depth. Full assessment:
  `changes/CR-20260908-001/acceptance.md`.

**Closed 2026-09-08.** Both CRs → `VERIFIED` → `CLOSED` at the Stage 7 mechanical close:
`baseline-alignment.md` all rows `ALIGNED`; the traceability-matrix backfill of the v1.1 IDs +
the numeric roll-up merged; the CR-20260908-001 deferred-depth follow-ups registered below as
`CR-20260908-002..007`; the 4 owner-accepted pre-prod CI gates registered as `CR-20260908-008`.
Stage 07 → `COMPLETED`; system `END-USER RELEASE-READY` (`05-system-validation/final-report.md`).

## Follow-up CRs — `PROPOSED` (Stage 7, 2026-09-08)

`CR-20260908-002..007` carry the deferred FR-ADM depth from `CR-20260908-001`; `CR-20260908-008`
carries the 4 external-tool gates the owner accepted as pre-prod CI follow-ups. Each has a stub
`request.md` under `00-control/changes/CR-20260908-00X/`. None is in Stage 7 scope.

| CR ID           | Scope                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CR-20260908-002 | `product` `config_version` governance + localized name/description + stock/quantity limits + agreement/receipt template lines |
| CR-20260908-003 | Locations: one-way-route pricing, localized public content, map-coordinate confirmation                                       |
| CR-20260908-004 | Unified search: saved views + assigned-staff / payment-state / channel facets                                                 |
| CR-20260908-005 | Eligibility restrictions: rental-_pickup_ enforcement + customer-facing explanation copy                                      |
| CR-20260908-006 | Customer records: automated duplicate _detection_                                                                             |
| CR-20260908-007 | Notification rules: scheduler that executes delay / quiet-hours / escalation                                                  |
| CR-20260908-008 | Pre-prod CI gate backlog: Firefox/WebKit engine e2e · k6 write-path load · OWASP ZAP + SAST · Lighthouse LCP/INP field run    |
