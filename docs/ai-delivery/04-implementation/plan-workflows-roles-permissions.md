# Plan — configurable workflows, roles, permissions and users

Status: **phases 1–6 built and pushed to `main` (2026-09-21); see §7 for what is done, how each edge case is covered, and what is deliberately deferred.** Requested 2026-09-19 (Telegram); all eight §6 recommendations accepted ("go"). Everything below is
grounded in a read of the current code (file references in §1); numbers such as "about 30 actions" are
counted from the seed.

## 0. What is being asked, and how it is read

1. **Remove "another user must review".** Today three places refuse the author from approving
   their own change. Read as: no action should _require a second person by default_.
2. **Audit the gaps in roles, permissions and users.**
3. **A permission matrix for users** (and roles).
4. **Dynamic workflows.** Where an action needs a pipeline, the owner defines, from the dashboard,
   the steps and who acts in each — one or several roles/users, "any one" or "all" — instead of the
   current hard-coded "different user" rule.
5. **100% customisable**: roles, permissions and pipelines are data edited in the dashboard, not
   code. No gaps, no edge cases left open.

The two halves fit together: the review rules that exist today become _the default definition of a
configurable workflow_, shipped as **"Direct — no review"**, with a one-click **"Two-person review"**
template for anyone who wants the old behaviour back.

---

## 1. Findings — the current state

### 1.1 Hard-coded "second person" rules (what to remove)

| Where                                                                                               | Rule                                                                                                      | File                                                                        |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Config versions (policies, cancellation rules, branding, SEO, consent, page builder, organisation…) | `approve()` refuses the author: `approval_required / author_cannot_approve`                               | `modules/config/config-version.service.ts:187`                              |
| Message templates (email/SMS)                                                                       | `publish()` refuses the author                                                                            | `modules/notify/template.service.ts:258`                                    |
| Customer restrictions                                                                               | `decide(approve)` refuses the author                                                                      | `modules/customer/customer-restriction.service.ts:105`                      |
| Staff                                                                                               | granting the `administrator` role needs an administrator; the last active administrator cannot be removed | `modules/admin/staff.service.ts` (not "another user" — keep as guard rails) |
| Step-up                                                                                             | password re-entry on payments/email config, "send report now"                                             | `@StepUp()` — not "another user", keep                                      |

The same three flows also have **state machines duplicated per entity** (`draft → in_review →
published/rejected`; `pending_review → active/rejected → lifted`; rate plans `draft → in_review →
published → retired`; translations `draft/in_review/published`), each with its own states, errors
and UI.

### 1.2 Roles

- **Roles are seed data.** `AdminController` exposes only `GET roles`, `GET staff`,
  `POST staff/invite`, `POST staff/:id/access`. There is no create / edit / clone / delete of a role
  and no UI for it.
- `role.permissionActions` is a `jsonb string[]` with **no validation** against the catalogue; a
  typo grants nothing and fails silently. `staff_profile.roleCodes` is another `jsonb string[]` with
  **no foreign key** — deleting or renaming a role would leave dangling codes that silently strip
  access.
- `manager` and `administrator` are `actions: 'ALL'` **resolved when the seed runs** — a permission
  added later is not in their snapshot until a reseed. Payments/email/audit-manage are excluded from
  "ALL" by special-casing.
- `RbacService.GLOBAL_ACTIONS` / `scopeFor()` / `allowsLocation()` is largely unused now that scope
  is enforced by `effectiveLocationCodes` (DEC-029) — two mechanisms describing the same thing.

### 1.3 Permissions

- **about 30 static actions** (catalogue, reservation._, rental._, payment._, fleet._, customer._,
  config._, staff.manage, report.\*, audit.read, integration.manage…) hard-coded in
  `database/seed/system.ts` and in `@Permissions(...)` decorators. Two lists that must be kept in
  sync by hand.
- **Too coarse.** `config.publish` appears on ~45 endpoints (translations, templates, branding, SEO,
  policies, locations, rate plans, legal profile, notification rules…). You cannot grant "may edit
  translations" without "may change payment-adjacent pricing".
- **Dead permissions.** `rental.extend.approve` and `reservation.override` exist in the catalogue and
  are never checked anywhere. **`approvalLimitMinor`** is computed from role codes
  (`approvalLimitFor`), stored on the profile, shown, and **never enforced** — refunds have no limit.
- **Checks are static and context-free.** `actor.permissions.includes(action)`; location scope, amount
  and ownership rules are scattered service by service.
- The UI's copy of the actor (permissions and scope) is a **snapshot from sign-in/refresh** and goes
  stale when an administrator changes access (same class of bug fixed for location scope in DEC-029).

### 1.4 Users

- One flat model: `staff_profile { roleCodes[], locationScope[], approvalLimitMinor, status }`.
- **Missing:** per-user grants/denies, time-bound access, groups/teams, delegation / out-of-office,
  an "effective permissions" view, a reverse "who can do X?" query, a permission-change history view,
  guard against **privilege escalation** (a `staff.manage` holder can grant roles they do not
  themselves hold, other than administrator).

### 1.5 Workflows

- No shared engine: every flow implements its own states, errors, audit and UI.
- No inbox / task list, no assignment, no due dates, no escalation, no reminders, no notification of
  "you have something to review", no delegation, no withdraw.
- "Who can act" is a permission flag (`config.publish`) plus the author exclusion — it cannot say "the
  Finance role OR Ana OR Ben", nor "all three must agree".
- Refunds, cancellations with fees, rental extensions, customer merge, location archive, staff access
  changes and rate-plan publishing are single-step with no way to add a step.

---

## 2. Target design

### 2.1 Principles

1. **Everything is data.** Roles, permission grants, users' overrides, workflow definitions and their
   actors live in the database and are edited in the dashboard; code only declares _what can be
   governed_ (the catalogue of actions and workflow-enabled actions).
2. **Code is the source of truth for the catalogue, the database for the policy.** A boot-time sync
   upserts the permission catalogue from the `@Permissions` decorators; a unit test fails if a
   decorator names an unknown action or a role grants one that no longer exists. No more drift.
3. **Default = no friction.** Every workflow-enabled action ships bound to a _Direct_ definition.
   Adding steps is opt-in.
4. **Deny-by-default, explain-by-default.** Every decision can be explained ("allowed because role
   X", "denied because override Y"), and every change is audited.
5. **No dead ends.** A workflow can never be saved, or run, in a state where nobody can act.

### 2.2 Authorization v2

**Catalogue.** `permission_action` keeps `code, group, riskLevel, description` and gains `module`,
`resourceKind`, `supportsConditions`, `deprecatedAt`. Split the coarse actions into granular ones
(`config.publish` → `translations.publish`, `templates.publish`, `branding.publish`,
`policies.publish`, `locations.manage`, `rateplans.publish`, `organization.manage`, …) with a
migration that grants each existing role the granular set its old action implied, so nothing changes
until an owner edits it. Remove or implement the dead actions (`rental.extend.approve`,
`reservation.override`).

**Roles.** New tables `role` (system flag, `locked`, `version`), `role_permission (role_id, action,
effect allow, conditions jsonb)`. `'ALL'` becomes a real wildcard evaluated at request time. System
roles are read-only but **cloneable**; custom roles are fully editable (create, rename, clone,
archive; deleting a role that is assigned is blocked with a list of holders).

**Users.** `staff_role_assignment (staff_id, role_id, scope {locations[]}, valid_from, valid_until,
granted_by, reason)` replaces `roleCodes[]` (with a real FK). `staff_permission_override (staff_id,
action, effect allow|deny, scope, valid_until, reason, granted_by)` for exceptions. `staff_group`
(+ members) so workflows can address "the Fleet team". **Deny beats allow**, always.

**Conditions (ABAC-lite).** A grant may carry conditions evaluated against the resource:
`{ amountMinorMax, locations, ownRecordsOnly, categories }`. `approvalLimitMinor` becomes the
`payment.refund` condition `amountMinorMax` — and is **enforced** (an over-limit refund routes to a
workflow step or is refused, per configuration).

**Evaluation.** One `AccessService.can(actor, action, resource?)` and `explain(...)`:
effective permissions = union(active assignments) + allow-overrides − deny-overrides, resolved per
request from the database and cached in Redis (existing `CacheBus`) with invalidation on any change.
`@Permissions()` guards keep their shape; scope stays in `effectiveLocationCodes` (DEC-029) and
consults the same service.

**Shared package.** New `packages/authz` (isomorphic): action types, condition schema, `can()`. The
API and the dashboard use the same evaluator so the UI never offers what the API refuses. Library:
**`@casl/ability`** (mature, typed conditions, works in browser and Node) — evaluation in memory;
SQL narrowing stays hand-written.

**Freshness.** `GET /auth/me/access` (permissions + scope + pending-task count) is refetched on
window focus and after any 403; the UI stops trusting the sign-in snapshot.

**Guard rails.** Cannot grant what you do not hold (no escalation); cannot remove the last active
administrator or your own admin access; changing an elevated/high-risk role needs step-up; every
change writes an audit event with a before/after diff; role edits are versioned (rollback).

### 2.3 The permission matrix (UI)

Three views on one page family under _Administration → Access_:

1. **Roles × permissions** — rows are actions grouped by module and risk (chips: normal / elevated /
   high), columns are roles. Toggle cells, bulk toggle a module or a column, search, filter by risk,
   "differences from role X", **a change-review panel** ("this affects 7 people; adds
   `payment.refund` to Support") before saving, keyboard navigable, sticky headers, mobile falls back
   to one role at a time. Cells with conditions show a badge and open a small editor (amount limit,
   locations).
2. **Users × permissions (effective)** — read-only grid with the _source_ in each cell (role name,
   override, group, expired, denied) and a per-user drawer: roles (with scope and dates), overrides,
   effective permissions, "why can/can't this person do X" (`explain`). Export CSV.
3. **Reverse view** — pick an action → everyone who can do it and via what; pick a person → everything
   they can do. Includes "who can act in workflow step Y" (§2.4) so the same page answers "who will
   be asked to approve this".

Plus: role editor (create / clone / archive), user access sheet (assign roles, dates, scope,
overrides), group manager, access-change history.

### 2.4 The workflow engine

**Vocabulary.** A _workflow-enabled action_ (declared in code) is something the system can put a
pipeline in front of: e.g. `config.version.publish`, `template.publish`, `rateplan.publish`,
`translation.publish`, `customer.restriction.activate`, `payment.refund`, `reservation.cancel.withFee`,
`rental.extend`, `location.archive`, `customer.merge`, `staff.access.change`, `recovery.case.resolve`.
Each declares: key, subject type, payload schema (zod), the context variables usable in conditions
(amount, location, category, initiator role…), an **executor** (idempotent function that performs the
change once approved), and its default (Direct) definition.

**Definition** (`workflow_definition` + immutable `workflow_definition_version`): a graph in JSON,
validated by zod:

- **Steps**
  - `approval` — someone decides (approve / reject / request changes → go to a chosen earlier step).
  - `task` — someone _does_ something and marks it done (with optional required fields/evidence).
  - `auto` — the system does something (notify, webhook, apply the change, add a note).
  - `condition` — branch on a rule (e.g. `amount > 500` → Finance; else → Manager).
  - `wait` — timer (delay, or until a date).
  - `parallel` — run branches concurrently, join on all/any.
- **Actors per step** — a list of _selectors_: `role`, `user`, `group`, or **dynamic**
  (`initiator`, `initiator's manager`, `record's location manager`, `subject owner`).
  **Mode**: `any one` · `all` · `N of M` (quorum) · `in order`. A step may mix roles and users.
  Toggles: _exclude the initiator_ (off by default — this is the old rule, now optional), _must be in
  the record's location scope_, _allow delegation_, _require a comment on reject_.
- **Timing** — due in N hours (business hours optional), reminders, **escalation** to another actor
  set after a deadline, or auto-approve/auto-reject on timeout (explicit choice).
- **Notifications** — templates (existing notification-rule system) to assignees, initiator, watchers;
  in-app inbox item + optional email.
- **Conditions** — safe rule language (JSON-logic, no `eval`), built with a visual rule builder.

**Binding.** `workflow_binding (action_key, definition_id, condition, priority, org)` — which
definition applies to which action (optionally per condition, e.g. per location or amount band).
Exactly one active binding resolves per action; none configured ⇒ Direct.

**Runtime** (`workflow_instance`, `workflow_task`, `workflow_task_assignee`, `workflow_event`):

1. A domain service calls `workflows.gate(actionKey, subject, payload, actor)`.
2. **Direct** → the executor runs inline, in the caller's transaction (behaviour identical to today
   minus the second-person rule).
3. Otherwise the change is **captured, not applied**: payload + subject version stored on the
   instance, the response is `202 { instanceId }`, the subject shows _"pending: step 2 of 3 —
   waiting for Finance"_, and tasks are created for the resolved assignees.
4. Each decision is a **single transaction** with a row lock on the task: check the decider is still
   eligible, record the decision, evaluate the step's completion rule (any / all / quorum), advance
   the graph, and on the final step run the executor. Idempotent by `(task, decider)`; double-clicks
   and races return the same result.
5. Timers: BullMQ delayed jobs (Redis and a worker already exist) **plus a reconciler cron** that
   re-derives due/overdue work from the database — jobs are hints, the database is the truth.
6. Everything appends to `workflow_event` and to the audit log.

Runtime library decision: a **small purpose-built graph interpreter** (definitions are user-authored
JSON persisted in Postgres; XState/Temporal would add a second source of truth and a service to
operate). Confirmed-useful packages: `json-logic-js` (conditions), `@casl/ability` (authz),
`bullmq`/`cron-parser` (already installed).

**Inbox & pages**

- **My tasks** (badge in the header, real-time via refetch/focus, later SSE): filters, bulk actions,
  overdue first; task detail shows the subject, the **proposed change as a diff**, history, comments,
  and actions: approve / reject / request changes / reassign / delegate.
- **Requested by me**: status, who it is waiting for, withdraw, nudge.
- **All workflows** (needs `workflow.monitor`): every instance, stuck/overdue, reassign, force-complete
  with reason (audited).
- **Subject pages** show the pending state and history inline.

**Builder** (_Administration → Workflows_)

- List of workflow-enabled actions with the bound definition, "who is asked" summary, and usage.
- Editor: vertical pipeline of step cards (drag to reorder — `@dnd-kit`), step drawer with type,
  actors picker (roles, users, groups, dynamic), any/all/quorum, conditions (rule builder —
  `react-querybuilder`), timing, notifications; **graph view** for branching (`@xyflow/react`,
  lazy-loaded so it never weighs on the rest of the app).
- **Validation panel** (blocks publishing): every step resolves to ≥ 1 _active_ actor; reachable end;
  no cycles without a bound; fallback set; conditions type-check against the action's variables.
- **Simulator**: pick an action and a sample payload/user → shows the path, who would be asked in each
  step, and how long it would take.
- Version history, diff, publish, rollback; **import/export JSON**; templates gallery
  (_Direct_, _Two-person review_, _Manager then Finance for refunds over X_, _Any of these three_).
- Changing a workflow is itself a high-risk action (`workflow.manage`, step-up, audited) and can be
  bound to its own workflow.

### 2.5 API surface (sketch)

```
GET/POST/PATCH/DELETE  /admin/roles            (+ /:id/clone, /:id/permissions)
GET/PUT                /admin/permissions/matrix          roles × actions
GET                    /admin/staff/:id/access            assignments, overrides, effective, explain?action=
POST/DELETE            /admin/staff/:id/assignments, /overrides
GET/POST/…             /admin/groups
GET                    /admin/access/who-can?action=      reverse lookup
GET                    /auth/me/access

GET/POST/…             /admin/workflows                   definitions, versions, publish, simulate
GET/PUT                /admin/workflow-bindings
GET                    /workflows/tasks?assignee=me|…     inbox
POST                   /workflows/tasks/:id/decide|reassign|delegate|comment
GET/POST               /workflows/instances, /:id/withdraw|nudge
```

### 2.6 Data model (new tables, all org-scoped, audited, soft-archive)

`role`, `role_permission`, `role_version`; `staff_role_assignment`, `staff_permission_override`,
`staff_group`, `staff_group_member`; `workflow_definition`, `workflow_definition_version`,
`workflow_binding`, `workflow_instance` (unique partial index: one _open_ instance per
`(action_key, subject_type, subject_id)`), `workflow_task`, `workflow_task_assignee`,
`workflow_event` (append-only), `workflow_delegation`, `inbox_item`. Foreign keys everywhere the
current model uses free-text codes; check constraints on states; indexes for the inbox
(`assignee, status, due_at`) and the reconciler (`status, due_at`).

---

## 3. What happens to today's flows

| Flow                                                                                                               | Today                                            | After                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config versions                                                                                                    | draft → in_review → published, author ≠ approver | `config.version.publish` workflow. Default **Direct**: the author can publish. _Draft_ stays a content state (preview, diff, rollback keep working). Review = a configurable step. |
| Templates                                                                                                          | same                                             | `template.publish` workflow, same treatment                                                                                                                                        |
| Translations                                                                                                       | draft / in_review / published                    | `translation.publish`                                                                                                                                                              |
| Rate plans                                                                                                         | draft → in_review → published                    | `rateplan.publish`                                                                                                                                                                 |
| Customer restrictions                                                                                              | pending_review → active, author ≠ approver       | `customer.restriction.activate`                                                                                                                                                    |
| Refunds                                                                                                            | one step, no limit                               | `payment.refund` with amount-band routing; `approvalLimitMinor` → role condition                                                                                                   |
| Cancellation with fee, rental extend, customer merge, location archive, staff access change, recovery case resolve | single step                                      | each declared as workflow-enabled, Direct by default                                                                                                                               |
| `rental.extend.approve`, `reservation.override`                                                                    | dead permissions                                 | become real workflow actors / conditions or are removed                                                                                                                            |

Public API compatibility: today's `approve` / `reject` endpoints stay as thin wrappers over the
engine for one release, then are removed. In-flight items (`in_review`, `pending_review`) are
converted to instances of the Direct-with-pending definition so nothing is orphaned.

---

## 4. Edge cases — decided up front

| #   | Case                                                               | Decision                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Nobody eligible for a step (role empty, users suspended)           | Publish is blocked by validation; at runtime the step escalates to the definition's **fallback actors** (mandatory field, defaults to administrators); never a dead end.                                               |
| 2   | Assignee suspended / removed / role revoked mid-flight             | Eligibility re-checked at decision time; task re-resolved, reassigned to the remaining set or fallback; event logged; initiator notified.                                                                              |
| 3   | Assignee gains the role after the task started                     | Live resolution: newly eligible people see the task (for role/group selectors); user selectors are exact.                                                                                                              |
| 4   | Definition edited while instances run                              | Instances pin their **definition version**; edits affect only new instances. Optional "migrate open instances" with a preview.                                                                                         |
| 5   | Initiator is also the only approver                                | Allowed by default (matches the request); if _exclude initiator_ is on and no one else exists → fallback, or blocked at publish for that action's typical initiators.                                                  |
| 6   | Two people decide at once (ALL / quorum)                           | Task-row lock + count in one transaction; exactly-once advancement; the loser gets "already decided" with the current state.                                                                                           |
| 7   | Approve and reject race                                            | First committed decision wins; reject on an ANY step is final unless the step allows "changes requested".                                                                                                              |
| 8   | Subject changed or deleted while pending                           | Subject version stored on the instance; executor re-checks it; mismatch ⇒ instance marked **stale**, approvers see "changed since request", initiator can re-submit.                                                   |
| 9   | A second request for the same subject/action                       | Unique open-instance index; API returns the existing instance.                                                                                                                                                         |
| 10  | Amount/condition edited so it crosses a threshold                  | Editing a pending subject cancels and restarts the instance with the new route (audited).                                                                                                                              |
| 11  | Withdraw / cancel                                                  | Initiator may withdraw an open instance (unless a step forbids it); admins may cancel with a reason.                                                                                                                   |
| 12  | Timeout                                                            | Per-step choice: remind → escalate → auto-approve / auto-reject / keep waiting. Reminder throttling (max N, min interval).                                                                                             |
| 13  | Delegation / out-of-office                                         | Delegate for a date range; delegate must hold the same eligibility unless the delegator explicitly allows; loops (A→B→A) rejected; chain depth capped; original owner remains visible in the audit.                    |
| 14  | Actor in another location                                          | Optional per-step "must be in the record's location scope"; otherwise org-wide roles pass.                                                                                                                             |
| 15  | Executor fails (payment gateway down, validation)                  | Instance goes to `failed-to-apply`, retried with backoff (idempotent executor), visible in monitoring; approvers are not asked again.                                                                                  |
| 16  | Workflow deleted / archived with instances open                    | Archive only; open instances finish on their pinned version.                                                                                                                                                           |
| 17  | Admin locks themselves out (removes own permissions)               | Guard rails: last-administrator rule, "you cannot remove your own access to Access/Workflows" without another holder, step-up on high-risk edits.                                                                      |
| 18  | Privilege escalation                                               | Grantors can grant only what they hold (and only within their location scope); enforced server-side; UI hides the rest.                                                                                                |
| 19  | Role deleted while assigned                                        | Blocked; shows holders; archive instead (assignments keep working until reassigned).                                                                                                                                   |
| 20  | Permission cache staleness                                         | Version stamp per staff; any change bumps it and invalidates Redis; guards read the current stamp; UI refetches `/auth/me/access`.                                                                                     |
| 21  | Deny override vs allow via role                                    | Deny wins, and the matrix shows the source.                                                                                                                                                                            |
| 22  | Expired assignment/override                                        | Evaluated by time at request; nightly sweeper only tidies.                                                                                                                                                             |
| 23  | Long-running instance across a permission change to the _executor_ | Executor runs as the system with the recorded initiator and approvers as actors of record; it does not re-check the initiator's permission at the end (it was checked at request time) but re-checks subject validity. |
| 24  | Conditions referencing a missing variable                          | Validation rejects at publish; at runtime a missing variable evaluates to "no match" and hits the `else` branch, logged.                                                                                               |
| 25  | Cycles / unreachable steps / no end                                | Rejected by the validator; "request changes" loops are bounded (max revisions).                                                                                                                                        |
| 26  | Approver = the subject (e.g. approving their own access change)    | Hard rule for security-critical actions (`staff.access.change`, `role.change`): the subject can never approve — not configurable.                                                                                      |
| 27  | Multi-tenant leakage                                               | Every table org-scoped; every query through the scoped repo; tests with two orgs.                                                                                                                                      |
| 28  | Idempotency / retries from the client                              | `Idempotency-Key` on submit and decide.                                                                                                                                                                                |
| 29  | Clock skew, DST, business hours                                    | All due times computed server-side in UTC from the location or org timezone.                                                                                                                                           |
| 30  | i18n / RTL / a11y                                                  | All builder and inbox strings in en/fr/ar; keyboard-operable drag & drop with an accessible reorder alternative; matrix is a real table with headers.                                                                  |
| 31  | Very large orgs                                                    | Matrix virtualised; inbox paginated (keyset); reverse-lookup queries indexed; resolved-assignee lists capped (e.g. 200) with "and N more".                                                                             |
| 32  | Import of a malformed definition                                   | zod + graph validation with per-node errors; nothing partially applied.                                                                                                                                                |
| 33  | Notifications flood                                                | Digest option, per-user preferences, dedupe key per (task, event).                                                                                                                                                     |
| 34  | Audit needs                                                        | Every definition version, binding change, role/permission change, decision, reassignment, escalation, withdrawal, force-complete — actor, before/after, reason, timestamp, correlation id.                             |

---

## 5. Delivery plan

Each phase ends **green** (unit + API integration + browser tests, i18n, openapi, lint) and is
shippable by itself.

| Phase                                          | Scope                                                                                                                                                                                                                                                                                                                                                                       | Est.    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **1. Remove the second-person rule (interim)** | Delete the three author-exclusion checks; keep the draft/publish states so preview/diff/rollback still work; update tests, copy and buttons ("Publish" directly for a permitted user); keep an audit note. Ships the request #1 immediately, before the engine.                                                                                                             | 0.5–1 d |
| **2. Authorization v2**                        | Catalogue sync + test, granular actions with backfill, roles CRUD + versions, assignments, overrides, groups, `AccessService` (`can`/`explain`, cache), `packages/authz`, enforce approval limits, remove dead actions, `/auth/me/access`, guard rails; **permission matrix UI** (roles × actions, users × actions, reverse view, role editor, user access sheet, history). | 6–8 d   |
| **3. Workflow engine core**                    | Schema, zod definition, validator, interpreter, gate + executors for config versions / templates / restrictions, inbox + task detail + diff, notifications, timers + reconciler, monitoring, default **Direct** + **Two-person** templates, legacy `approve/reject` wrappers, migration of in-flight items.                                                                 | 8–10 d  |
| **4. Builder**                                 | Definition editor (pipeline + graph view), actors picker, conditions, timing, validation panel, simulator, versions/diff/rollback, import/export, templates gallery, bindings screen.                                                                                                                                                                                       | 6–8 d   |
| **5. Migrate the remaining actions**           | Refund (amount bands), rate plan, translation, cancellation-with-fee, rental extend, location archive, customer merge, staff access, recovery cases; per-action tests.                                                                                                                                                                                                      | 5–6 d   |
| **6. Hardening**                               | Concurrency/race suite, property tests on the validator and interpreter, two-org isolation tests, load test of inbox/matrix, Playwright flows across 3 viewports (incl. RTL), docs (admin guide, DEC), seed/gallery.                                                                                                                                                        | 4–5 d   |

Roughly **5–6 weeks** of focused work end to end; phases 1–2 alone already deliver "no more second
reviewer", the gap fixes and the permission matrix.

### Test strategy

- **Unit:** authz evaluator (allow/deny/conditions/expiry), definition validator, interpreter (each
  step type and mode), condition engine, escalation math.
- **API integration:** every edge case in §4 as a named spec; two-org isolation; escalation/timeout with
  a controlled clock; concurrent decisions (`Promise.all` on N approvers); executor retry; migration
  from legacy states.
- **Property-based (fast-check):** random definitions never produce a dead end; random decision
  orderings always terminate with exactly one outcome.
- **Browser:** matrix edit → review panel → save → effect visible; build a 3-step workflow →
  simulate → run it → approve as each actor; RTL; phone.
- **Static:** a test that fails if any `@Permissions` action is missing from the catalogue, or any
  workflow-enabled action lacks an executor and a default definition.

### New packages

`@casl/ability` (+ `@casl/react`), `json-logic-js`, `@dnd-kit/core` + `@dnd-kit/sortable`,
`@xyflow/react` (lazy-loaded), `react-querybuilder`, `fast-check` (dev). Already present and reused:
`bullmq`, `cron-parser`, `ioredis`, `zod`, Drizzle.

---

## 6. Decisions needed before starting

1. **"Remove the reviewer"** — confirm: remove it _everywhere_ by default (config versions,
   templates, customer restrictions) and re-introduce it only where an owner configures a step?
   (Recommended: yes.)
2. **Phase 1 first?** Ship the immediate removal now, then build the engine? (Recommended: yes.)
3. **Draft states** — keep _draft_ (preview / diff / rollback) as a content state even when the
   workflow is Direct? (Recommended: yes; it is not an approval.)
4. **Security-critical actions** (staff/role changes) — accept the hard rule "the subject can never
   approve their own access change"? (Recommended: yes.)
5. **Existing role behaviour** — keep the seeded roles exactly as they are and make them editable,
   or reset them to a cleaner starting set? (Recommended: keep, mark as system, cloneable.)
6. **Approval limits** — model as a per-role condition on `payment.refund` and enforce (over-limit →
   configured step or refusal)? (Recommended: yes.)
7. **Notifications** — in-app inbox + email for tasks in v1; SMS/push later? (Recommended: yes.)
8. **Business hours** for due times — org-level calendar in v1, or calendar-hours only? (Recommended:
   calendar-hours in v1, business calendar in phase 6.)

---

## 7. Status — what shipped (2026-09-21)

### 7.1 Phases

| Phase                         | State                                                                                                                                                                                                                                                                              | Where                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1. Second-person rule removed | Done. Direct is the default everywhere; "Two-person review" is a one-click template.                                                                                                                                                                                               | DEC-032                                                                               |
| 2. Authorization v2           | Done: roles CRUD (system roles locked, cloneable), assignments (time-bound), per-user allow/deny overrides, teams, approval limits, permission catalogue test, guard rails, `/auth/me/access`, permission matrix (roles × actions, people × actions, who-can), access history.     | `apps/api/src/modules/admin/access-admin.service.ts`, `apps/web/src/features/access/` |
| 3. Workflow engine            | Done: versioned definitions, bindings with conditions and priority, gate/decide/apply, any/all/quorum/in-order, parallel and wait steps, escalation, timeouts, fallback actors, monitoring, delegation, notifications, keyset inbox, business-hours deadlines, retry with backoff. | `apps/api/src/modules/workflow/`                                                      |
| 4. Builder                    | Done: step list + flow diagram, actor picker, rule builder, timing, validation panel, simulator, versions and diff, import/export, templates, bindings screen; tabs and option lists only (no dropdown to switch a view or a value).                                               | `apps/web/src/features/workflows/`                                                    |
| 5. Remaining actions governed | Done: config versions, templates, customer restrictions, refunds (amount bands), cancellation with fee, recovery cases, rate plans, translations, location archive, customer merge, staff access, rental extension.                                                                | `workflow-actions.spec.ts`                                                            |
| 6. Hardening                  | Done: concurrency, property tests, two-organisation isolation, inbox load test with an index-use assertion, edge-case specs, Playwright flow, axe audit of 57 screens (phone, tablet, laptop) plus an Arabic/RTL pass, admin guide, decisions.                                     | see §7.3                                                                              |

### 7.2 The 34 edge cases of §4

"Test" names the spec that proves it. Everything is in `apps/api/test/` unless noted.

| #      | Covered by                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1      | `workflow.spec` — a step nobody can act on falls back to the fallback actors; publish refuses a workflow nobody can act on                                                           |
| 2, 3   | `workflow.spec` — the open task follows people who become eligible or stop being (reconciler); eligibility re-checked at decision time                                               |
| 4      | `workflow-edge-cases` #4 — instances stay on the version they started on                                                                                                             |
| 5      | `workflow.spec` — exclude-initiator with fallback; Direct default allows the author                                                                                                  |
| 6, 7   | `workflow.spec` — racing ALL approvals advance once; first committed decision wins; different second decision is a conflict                                                          |
| 8      | `workflow.spec` — a changed subject closes the request as stale                                                                                                                      |
| 9      | unique open-instance index + `workflow-edge-cases` #28 (same key returns the same request)                                                                                           |
| 10     | `workflow-edge-cases` #10 — editing a template restarts its request                                                                                                                  |
| 11     | `workflow-edge-cases` #11 — a step can forbid withdrawing; a monitor can still cancel                                                                                                |
| 12     | `workflow.spec` — reminders, escalation once, auto-reject on timeout                                                                                                                 |
| 13     | `workflow-delegation.spec` (9 tests: not transitive, no loops, ≤ 90 days, counts once in ALL, revoked at once)                                                                       |
| 14     | `workflow-edge-cases` #14 — a step can ask only people who work at the request's location. **Per-assignment location scope is deferred** — see 7.4                                   |
| 15     | `workflow.spec` — failing executor retried with backoff, approvers not asked again                                                                                                   |
| 16     | `workflow-edge-cases` #16                                                                                                                                                            |
| 17     | `access-admin.spec` — cannot change your own access; last access manager and last workflow manager protected                                                                         |
| 18     | `access-admin.spec` — nobody can hand out power they do not hold                                                                                                                     |
| 19     | `access-admin.spec` — an in-use role cannot be archived                                                                                                                              |
| 20     | Permissions are read from the database on every request, so a change is effective at once (`access-admin.spec` DENY override). **A Redis cache is deliberately not added** — see 7.4 |
| 21, 22 | `access-admin.spec` — deny wins; scheduled and expired assignments                                                                                                                   |
| 23     | `workflow-actions.spec` — executor runs with the requester's rights snapshot (`_requester`) and re-checks the subject                                                                |
| 24     | `workflow-edge-cases` #24                                                                                                                                                            |
| 25     | `packages/contracts/src/workflow.test.ts` and `workflow.property.test.ts` (random definitions), plus the builder property test in `apps/web`                                         |
| 26     | `workflow-actions.spec` — the person an access change is about can never approve it                                                                                                  |
| 27     | `workflow-isolation.spec` (5 tests, two organisations)                                                                                                                               |
| 28     | `workflow-edge-cases` #28 — service and HTTP `Idempotency-Key`                                                                                                                       |
| 29     | `apps/api/src/modules/workflow/business-hours.test.ts`, `workflow.spec` — deadlines in the location's opening hours, computed in UTC on the server                                   |
| 30     | `apps/web` tests + `verify:i18n`; up/down buttons beside drag and drop; Arabic audit with no issues; axe audit 0 issues                                                              |
| 31     | `workflow-edge-cases` #31 (≤ 200 resolved, and says so); `workflow-load.spec` (keyset inbox, index use); people list pages by 50                                                     |
| 32     | `workflow.spec` — validation with per-step problems; import applies nothing on error                                                                                                 |
| 33     | Same person + same request + same event is sent once (`workflow.spec`). **Digest and per-user preferences are deferred** — see 7.4                                                   |
| 34     | `access-admin.spec` — access history; workflow events on every decision, reassignment, escalation, withdrawal and force-complete                                                     |

### 7.3 Checks that were run

- API integration: workflow engine 33, governed actions 12, delegation 9, isolation 5, load 4, edge cases 11, access admin; route manifest snapshot updated.
- Unit: contracts 17, API 130, web 305.
- Browser: Playwright workflow flow; axe-core on 19 screens × phone/tablet/laptop (0 issues) and the same laptop screens in Arabic (0 issues); every screenshot looked at.
- Static: eslint, tsc, prettier, OpenAPI drift on all installed workspaces (the site and mobile apps are not installed on this machine).

### 7.4 Deliberately deferred (with the reason)

| Item                                                 | Why it can wait                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Redis cache of resolved permissions                  | Permissions are one indexed read per request; a cache adds an invalidation risk for no measured need. Revisit if request latency shows it. |
| CASL on the front end                                | The web already gates from `/auth/me/access`; a library would only add a second evaluator to keep in sync.                                 |
| Per-assignment location scope                        | Roles apply to the locations the account is limited to (DEC-029); a per-assignment scope needs its own UI and migration.                   |
| Digest emails and per-user notification preferences  | Notifications are de-duplicated; a digest is a product decision (frequency, channels).                                                     |
| Editing on the flow diagram (xyflow)                 | The diagram is read-only by design; steps are edited in the list, which is the accessible path.                                            |
| One-click rollback of a role to an earlier state     | The access history shows every change with who and when; roles can be edited back.                                                         |
| Splitting `config.publish` into per-kind permissions | Today one permission covers publishing settings; per-kind splits can be added to the catalogue without a data change.                      |
