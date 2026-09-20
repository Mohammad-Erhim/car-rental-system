# Workflows — administrator guide

Approval workflows let an owner decide, action by action, whether a change is applied at once or only
after the right people have approved it. Nothing about who reviews is fixed in code. This guide is for
the people who set that up and for those who work the queue. Design decisions: DEC-032 (engine),
DEC-033 (builder), DEC-034 (delegation, business hours, remaining actions).

## The five ideas

1. **Actions** are the things that can be governed (publish a setting, refund, archive a location…).
   The list is fixed by the system; what happens in front of each is yours to choose.
2. **Workflows** are pipelines you build: approval, task, notify, wait, branch-on-a-rule and parallel
   steps. **Direct** (no steps) is built in; so is **Two-person review**.
3. **Bindings** attach a workflow to an action. No binding = the action is applied at once, exactly as
   it always was. A binding can carry a **condition** (e.g. refunds over 500) and routes are tried top to
   bottom.
4. **Requests** are what a bound action creates: the change is _captured, not applied_. It is applied
   exactly once, after the last step passes, by the person-of-record's snapshot of rights under the
   approver's name.
5. **Tasks** are what each step asks of people. You see and decide what was asked of you — no
   permission is needed to decide, only to have been asked.

## Setting one up (about five minutes)

1. **Administration → Workflows → Workflows → New workflow.** Start from a template, name it.
2. **Steps.** Add and reorder steps (drag the grip, use the arrows, or the keyboard: focus the grip,
   Space, arrow keys, Space). Open a step to choose _who_ (roles, named people, teams, the requester),
   _how many must decide_ (any one, everyone, N of them, in order), a deadline (with reminders and what
   happens when it passes: ask others, keep waiting, approve, reject), and whether the deadline counts
   business hours only. **Flow** shows the same pipeline as a diagram.
3. **Check & test.** Publishing is blocked while anything is wrong (nobody can act on a step, a rule reads
   an unknown variable, a route loops). **Show who would be asked** runs your unsaved pipeline against
   the people who exist today.
4. **Publish.** New requests use the new version; requests already in progress finish on the version
   they started with. **Versions** shows what changed in each and can restore an old one as a draft.
5. **Actions tab.** Choose the workflow for the action. Add **routes** to send only some requests
   through it.

## Rules the system enforces for you

- A step nobody can act on falls back to the workflow's **fallback approvers** — a request never gets
  stuck. The requester is excluded only if you turn that on for the step.
- Decisions are safe to race: two people approving an "everyone" step at once count once each; the
  change is applied once.
- If the item changed after it was requested, the request is closed as out of date rather than
  approving something else.
- If applying the change fails (a payment provider is down), it is retried with a growing delay; the
  approvers are never asked again.
- A change **about a person's own access** can never be approved by that person, whatever the
  workflow says.
- A refund above what was captured is refused up front. A role's refund limit applies to direct
  refunds; a workflow is how a request above someone's limit reaches someone above it.

## Working the queue

- The bell in the header counts what is waiting for you. **Tasks** has _Waiting for me_ (overdue first),
  _Requested by me_ (withdraw here), _Out of office_ and — for monitors — _All requests_.
- **Out of office:** name a colleague and an end date (at most 90 days). They see your tasks marked
  "covering for you" and can decide them; the history says who decided for whom. It is not
  transitive, ends by itself, and either of you can end it sooner.
- **Monitors** (`workflow.monitor`) can reassign a task, cancel a request or push it through — each
  with a written reason, all audited.

## Who can do what

| Permission               | Lets you                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| _(none — by assignment)_ | See and decide the tasks asked of you; withdraw your own requests; set your own out-of-office |
| `workflow.monitor`       | See every request; reassign, cancel or force through (with a reason); look at workflows       |
| `workflow.manage`        | Build, publish, bind and archive workflows (password re-confirmation required)                |

## Operating notes

- Timers, reminders, escalation, business-hours release and apply-retries run from the **worker**
  (`pnpm --filter @carrental/api dev:worker` in development). Without it, requests wait but nothing
  times out.
- A request in **Apply failed** shows the error and keeps retrying; a monitor can cancel it.
- Business-hours deadlines use the request's location (its weekly hours, one-off closures and time
  zone); a request with no location is counted in plain clock time.
- Everything is audited: every definition version, binding change, decision, reassignment, delegation
  and forced action, with who and why.

## Not (yet) covered

Visual drag-to-connect editing in the diagram (the diagram is read-only; edit in the list), digest
emails, SMS / push notifications, per-assignment location scope, and role / permission-matrix edits as
governed actions (they already require step-up, forbid self-change and privilege escalation, and are
audited).
