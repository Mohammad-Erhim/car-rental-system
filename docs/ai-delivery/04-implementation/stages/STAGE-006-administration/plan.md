# STAGE-006 — Administration & reporting · plan

## Objective / outcome

The internal control plane: versioned configuration for pricing / policies / products /
locations with **preview + approval + publish** (publishing never mutates a prior accepted
fact); a reports hub (definitions → runs → viewer → CSV export → schedules with recipient-
authorization gating); audit & data-quality views; integration health & recovery (the
`recovery_case` / `reconciliation_exception` write sides exist — add the operator surfaces and a
retry action). Also fold in the STAGE-005 deferred items where cheap (maintenance workflow,
fleet import validation).

## Source IDs

FR-ADM-005..012, FR-RPT-001..006, FR-PRC-001, FR-INT-001..005, FR-GBL-004/008;
SCREEN-OPS-025–039; FLOW-OPS-010/012/013/014/015/016/017/018; SRS-LKP-\*, SRS-I18N-\*, SRS-OBS-\*.

## Backend

1. **`config` versioning** — a generic `config_version` (kind: pricing | policy | product |
   location; payload jsonb; state draft → in_review → published → superseded; `publishedVersion`;
   `effectiveFrom`). `preview(kind, payload)` runs the domain validator and returns the computed
   effect (e.g. a sample quote for a pricing change); `submit` → in_review; `approve` (separate
   permission from author) → publish + supersede the prior. The `rate_plan` from STAGE-002 stays
   the pricing implementation; this wraps every config kind in the same workflow. Cancellation
   fee + fuel rate move here as `policy` config.
2. **`report` module** — `report_definition` (code, title, query kind, param schema, column set,
   row/field scope), `report_run` (params, status, row count, a stored result blob or a cursor).
   `run(defCode, params, actor)` executes a whitelisted aggregate (reservations by state,
   revenue by category/period, fleet utilisation, refunds, open cases) respecting the actor's
   location scope; `exportCsv(runId)` streams; `schedule(defCode, cron, recipients)` +
   `listSchedules` — a scheduled delivery stops when a recipient's authorization is removed
   (checked at send time).
3. **`case` operator surface** — list/detail/resolve for `recovery_case` +
   `reconciliation_exception` (mostly done in 004); add a `retry` action for an integration
   failure (re-emit the outbox event / re-run the reconcile).
4. **audit & data-quality** — read API over `audit_event` (filter by actor/target/action/date,
   masked) for SCREEN-OPS-038; a data-quality check runner (lookup drift already in
   `/health/ready`; add orphan / referential checks) for SCREEN-OPS-039.
5. **fleet** — `importUnits(rows)` (validate → report per-row errors, insert the valid ones);
   `scheduleMaintenance` / `releaseMaintenance` on `vehicle_block` with a reason + an
   availability-impact note.

## Web (`apps/web/src/surfaces/ops`)

- **SCREEN-OPS-025–029** config versioning: a list per kind, a draft editor, "Preview" (shows
  the computed effect), "Submit for approval", "Approve & publish"; version history.
- **SCREEN-OPS-035–037** reports hub (definition cards) → run form → results table → "Export
  CSV" → schedules list + new-schedule form.
- **SCREEN-OPS-038** audit viewer (filter bar + table). **SCREEN-OPS-039** data-quality panel.
- **SCREEN-OPS-033/034** already done (staff & roles, translations) — link from here.
- **SCREEN-OPS-017–020** fleet: import wizard (paste rows → validation report → import),
  maintenance schedule form.

## Acceptance / tests

- **Config:** invalid config cannot be approved/published (validator runs on submit AND
  approve); publishing a new version supersedes the prior and never edits it; a customer-facing
  effect (e.g. a policy change) takes effect on the next relevant operation, not retroactively.
- **Approval separation:** the author of a draft cannot approve it (unless they also hold the
  approver permission); the action is audited with both actor ids.
- **Reports:** a run respects the actor's location scope (rows outside it are absent); export
  contains exactly the visible columns/rows; a schedule to a now-unauthorized recipient does not
  send.
- **Audit:** the audit viewer shows masked before/after; it cannot be written through.
- **E2E (3 viewports):** an admin edits a policy → previews → submits → a second admin approves
  & publishes → history shows both; an admin runs the "reservations by state" report → sees rows
  → exports CSV (asserts the downloaded content shape via the API, since the sandbox blocks
  downloads); the audit viewer filters to one action. Responsive + 1 RTL screenshot of the
  config editor.
- `verify:static | unit | api | migrate | e2e` all green; screenshots in
  `stages/STAGE-006-administration/screenshots/`.

## Migrations / data

- New tables: `config_version`, `report_definition`, `report_run`, `report_schedule`. Seed:
  ~4 report definitions; the current cancellation-fee + fuel-rate as the first `policy`
  config_version (published).

## Risks / notes

- The "publish never mutates a prior accepted fact" rule is the core invariant — model every
  config kind as append-only versions; the "current" one is a pointer, never an in-place edit.
- Reports must apply the same location-scope filter the rest of the app uses — reuse
  `rbac.scopeFor` / `allowsLocation`.
- CSV export + scheduled email are the surfaces most likely to leak data outside scope — apply
  the filter at query time, not in the formatter.
