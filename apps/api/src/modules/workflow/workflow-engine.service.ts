import {
  OPEN_WORKFLOW_STATUSES,
  type ActorSelector,
  type WorkflowSpec,
  type WorkflowStep,
} from '@carrental/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { RbacService } from '../../common/auth/rbac.service';
import type { Actor } from '../../common/auth/types';
import { isUniqueViolation } from '../../common/db-error';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { account, staffProfile } from '../../database/schema/iam';
import { location, locationHoursException } from '../../database/schema/org';
import {
  workflowEvent,
  workflowInstance,
  workflowTask,
  workflowTaskAssignee,
} from '../../database/schema/workflow';

import { WorkflowActorsService } from './workflow-actors.service';
import { addBusinessHours, type Schedule } from './business-hours';
import { evaluateCondition } from './workflow-conditions';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowDelegationService } from './workflow-delegation.service';
import { WorkflowNotifier, type Notice } from './workflow-notifier.service';
import { WorkflowRegistry } from './workflow-registry.service';
import type {
  ActorsOfRecord,
  ClosedReason,
  GateInput,
  GateResult,
  InstanceRow,
  Tx,
  WorkflowActionDef,
  WorkflowSummary,
} from './workflow.types';

type TaskRow = typeof workflowTask.$inferSelect;
type AssigneeRow = typeof workflowTaskAssignee.$inferSelect;
type Decision = 'approve' | 'reject' | 'request_changes' | 'complete';

const MAX_APPLY_ATTEMPTS = 8;
/** A step never asks more people than this — a huge role would otherwise mean thousands of task rows. */
const MAX_ASSIGNEES = 200;
const MAX_STEPS_PER_ADVANCE = 100;

/** Work collected inside a transaction and flushed only once it has committed. */
class Run {
  readonly notices: Notice[] = [];
  readonly audits: Parameters<AuditService['record']>[0][] = [];
  constructor(readonly tx: Tx) {}
}

interface ParallelState {
  done: boolean[];
  released: boolean;
}
interface InstanceState {
  parallel?: Record<string, ParallelState>;
}

/**
 * The workflow runtime. A domain service asks `gate()` whether an action needs a pipeline; if it
 * does, the change is captured (not applied), steps become tasks for the people the definition
 * names, and once the last step passes the registered executor applies the change exactly once.
 *
 * Invariants (each is a named test):
 *  - every decision runs in ONE transaction that first locks the instance row, so ALL / quorum
 *    steps can never double-count and two racing deciders can never both advance a step;
 *  - eligibility is re-checked at decision time — being asked earlier is not enough;
 *  - a step that ends up with nobody eligible falls back to the definition's fallback actors, it is
 *    never a dead end;
 *  - the database is the truth: timers are reconciled from rows, never from in-memory state.
 */
@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger('WorkflowEngine');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly registry: WorkflowRegistry,
    private readonly actors: WorkflowActorsService,
    private readonly definitions: WorkflowDefinitionService,
    private readonly notifier: WorkflowNotifier,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly rbac: RbacService,
    private readonly delegations: WorkflowDelegationService,
  ) {}

  // ───────────────────────────── gate: capture a request ─────────────────────────────

  async gate(input: GateInput): Promise<GateResult> {
    const def = this.registry.require(input.actionKey);
    const actor = input.actor;
    if (actor.kind !== 'staff' || !actor.organizationId || !actor.staffProfileId) {
      throw new AppError('forbidden', { title: 'Staff permission required' });
    }
    const orgId = actor.organizationId;

    const existing = await this.openInstanceFor(orgId, def, input.subjectId);
    if (existing) return this.existingResult(existing);
    if (input.submitKey) {
      const [retry] = await this.db
        .select()
        .from(workflowInstance)
        .where(
          and(
            eq(workflowInstance.organizationId, orgId),
            eq(workflowInstance.initiatorAccountId, actor.accountId),
            eq(workflowInstance.submitKey, input.submitKey),
          ),
        )
        .limit(1);
      if (retry) return this.existingResult(retry);
    }

    const context = this.buildContext(def, input, actor);
    const resolved = await this.definitions.resolveBinding(orgId, input.actionKey, context);
    if (!resolved || resolved.spec.start === null) return { direct: true };

    // a request that keeps coming back for changes is bounded (§4 #25)
    const [{ n } = { n: 0 }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(workflowInstance)
      .where(
        and(
          eq(workflowInstance.organizationId, orgId),
          eq(workflowInstance.actionKey, input.actionKey),
          eq(workflowInstance.subjectType, def.subjectType),
          eq(workflowInstance.subjectId, input.subjectId),
          eq(workflowInstance.status, 'changes_requested'),
        ),
      );
    if (n >= resolved.spec.maxRevisions) {
      throw AppError.businessRule(
        `This request has been sent back for changes ${n} times — start a fresh one instead`,
        { reason: 'workflow_max_revisions' },
      );
    }

    let created: { instance: InstanceRow; run: Run } | null = null;
    await this.tx(async (tx) => {
      const r = new Run(tx);
      const fingerprint = await def.fingerprint(input.subjectId, tx);
      let instance: InstanceRow | undefined;
      try {
        // a savepoint, so losing the unique-index race leaves the outer transaction usable
        instance = await tx.transaction(async (sp) => {
          const [row] = await sp
            .insert(workflowInstance)
            .values({
              organizationId: orgId,
              actionKey: input.actionKey,
              subjectType: def.subjectType,
              subjectId: input.subjectId,
              subjectVersion: fingerprint,
              subjectLabel: input.subjectLabel ?? null,
              definitionId: resolved.definitionId,
              definitionVersionId: resolved.versionId,
              status: 'running',
              payload: input.payload ?? {},
              context,
              initiatorAccountId: actor.accountId,
              initiatorStaffId: actor.staffProfileId,
              initiatorLabel: actor.displayName,
              locationCode: input.locationCode ?? null,
              revision: n + 1,
              submitKey: input.submitKey ?? null,
              state: {},
            })
            .returning();
          return row!;
        });
      } catch (err) {
        if (isUniqueViolation(err)) return;
        throw err;
      }
      await def.onCaptured?.({
        tx,
        subjectId: input.subjectId,
        payload: input.payload ?? {},
        instanceId: instance.id,
        audit: (e) => r.audits.push(e),
      });
      await this.event(tx, instance.id, null, 'instance.created', actor, {
        actionKey: input.actionKey,
        definition: resolved.definitionName,
        revision: n + 1,
      });
      r.audits.push({
        action: 'workflow.instance.created',
        targetType: def.subjectType,
        targetId: input.subjectId,
        actor,
        after: {
          instanceId: instance.id,
          actionKey: input.actionKey,
          definition: resolved.definitionName,
        },
      });
      await this.proceed(r, instance, resolved.spec, resolved.spec.start);
      created = { instance, run: r };
    });
    if (!created) {
      // a concurrent request for the same subject won the unique index — return its instance
      const winner = await this.openInstanceFor(orgId, def, input.subjectId);
      if (winner) return this.existingResult(winner);
      throw new AppError('state_conflict', {
        title: 'Another request for this item was just started',
      });
    }
    const { instance: made, run } = created as { instance: InstanceRow; run: Run };
    await this.flushPost(run);
    if (made.status === 'applying') await this.apply(made.id);
    return this.existingResult(await this.loadInstance(made.id), false);
  }

  private buildContext(
    def: WorkflowActionDef,
    input: GateInput,
    actor: Actor,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const name of def.variables) {
      if (input.context && name in input.context) out[name] = input.context[name];
    }
    // always available, whatever the action declares
    out.location = input.locationCode ?? null;
    out.initiator_roles = actor.roleCodes;
    return out;
  }

  private async existingResult(inst: InstanceRow, existing = true): Promise<GateResult> {
    return {
      direct: false,
      existing,
      instanceId: inst.id,
      summary: (await this.summaries([inst]))[0]!,
    };
  }

  private async openInstanceFor(orgId: string, def: WorkflowActionDef, subjectId: string) {
    const [row] = await this.db
      .select()
      .from(workflowInstance)
      .where(
        and(
          eq(workflowInstance.organizationId, orgId),
          eq(workflowInstance.actionKey, def.key),
          eq(workflowInstance.subjectType, def.subjectType),
          eq(workflowInstance.subjectId, subjectId),
          inArray(workflowInstance.status, [...OPEN_WORKFLOW_STATUSES]),
        ),
      )
      .limit(1);
    return row;
  }

  // ───────────────────────────── the interpreter ─────────────────────────────

  /** Move the main route to `target`, running every step that needs no human until one does. */
  private async proceed(
    r: Run,
    inst: InstanceRow,
    spec: WorkflowSpec,
    target: string | null,
  ): Promise<void> {
    let next = target;
    for (let guard = 0; guard < MAX_STEPS_PER_ADVANCE; guard++) {
      if (next === null) return this.finish(r, inst);
      const step = spec.steps[next];
      if (!step) {
        // a definition that passed validation cannot reach this; if it does, fail loudly, not silently
        throw new Error(`Workflow ${inst.definitionVersionId}: step "${next}" does not exist`);
      }
      switch (step.type) {
        case 'approval':
        case 'task':
        case 'wait':
          await this.openTask(r, inst, spec, step, null);
          return;
        case 'auto':
          await this.runAuto(r, inst, spec, step);
          next = step.next;
          break;
        case 'condition': {
          const hit = step.branches.find((b) => evaluateCondition(b.when, inst.context));
          await this.event(r.tx, inst.id, null, 'condition.evaluated', null, {
            step: step.id,
            matched: hit?.label ?? (hit ? 'branch' : 'else'),
          });
          next = hit ? hit.next : step.else;
          break;
        }
        case 'parallel': {
          const state = this.stateOf(inst);
          state.parallel = {
            ...(state.parallel ?? {}),
            [step.id]: { done: step.branches.map(() => false), released: false },
          };
          await this.saveState(r.tx, inst, state);
          await this.event(r.tx, inst.id, null, 'parallel.started', null, {
            step: step.id,
            branches: step.branches.length,
          });
          for (let i = 0; i < step.branches.length; i++) {
            await this.openInline(r, inst, spec, step, i, 0);
          }
          return;
        }
      }
    }
    throw new Error('Workflow advanced too many steps without stopping');
  }

  /** Open step `pos` of branch `i` of a parallel step (running inline auto steps as it goes). */
  private async openInline(
    r: Run,
    inst: InstanceRow,
    spec: WorkflowSpec,
    parallel: Extract<WorkflowStep, { type: 'parallel' }>,
    i: number,
    startPos: number,
  ): Promise<void> {
    const branch = parallel.branches[i]!;
    for (let pos = startPos; pos < branch.length; pos++) {
      const step = spec.steps[branch[pos]!]!;
      const ref = `${parallel.id}:${i}:${pos}`;
      if (step.type === 'auto') {
        await this.runAuto(r, inst, spec, step);
        continue;
      }
      if (step.type === 'approval' || step.type === 'task' || step.type === 'wait') {
        await this.openTask(r, inst, spec, step, ref);
        return;
      }
    }
    await this.completeBranch(r, inst, spec, parallel, i);
  }

  private async completeBranch(
    r: Run,
    inst: InstanceRow,
    spec: WorkflowSpec,
    parallel: Extract<WorkflowStep, { type: 'parallel' }>,
    i: number,
  ): Promise<void> {
    const state = this.stateOf(inst);
    const p = state.parallel?.[parallel.id];
    if (!p || p.released) return;
    p.done[i] = true;
    const joined = parallel.join === 'any' ? true : p.done.every(Boolean);
    if (!joined) {
      await this.saveState(r.tx, inst, state);
      return;
    }
    p.released = true;
    await this.saveState(r.tx, inst, state);
    // an "any" join releases on the first finished branch — the others stand down
    await this.cancelOpenTasks(r.tx, inst.id, `${parallel.id}:`);
    await this.event(r.tx, inst.id, null, 'parallel.joined', null, { step: parallel.id });
    await this.proceed(r, inst, spec, parallel.next);
  }

  private async runAuto(
    r: Run,
    inst: InstanceRow,
    spec: WorkflowSpec,
    step: Extract<WorkflowStep, { type: 'auto' }>,
  ): Promise<void> {
    if (step.action === 'notify' && step.notify?.length) {
      const people = await this.resolveWho(r.tx, inst, step.notify, {});
      const accounts = await this.actors.people(
        people.map((p) => p.staffProfileId),
        inst.organizationId,
        r.tx,
      );
      r.notices.push({
        kind: 'message',
        recipients: accounts,
        title: step.name,
        body: step.message ?? `${step.name} — ${inst.subjectLabel ?? inst.actionKey}`,
        instanceId: inst.id,
      });
    }
    await this.event(r.tx, inst.id, null, 'auto.ran', null, { step: step.id, action: step.action });
  }

  private async openTask(
    r: Run,
    inst: InstanceRow,
    spec: WorkflowSpec,
    step: Extract<WorkflowStep, { type: 'approval' | 'task' | 'wait' }>,
    branchRef: string | null,
  ): Promise<void> {
    const tx = r.tx;
    if (step.type === 'wait') {
      const [task] = await tx
        .insert(workflowTask)
        .values({
          instanceId: inst.id,
          stepId: step.id,
          stepType: 'wait',
          title: step.name,
          branchRef,
          mode: 'any',
          required: 0,
          resumeAt: step.businessHours
            ? addBusinessHours(
                new Date(),
                step.hours,
                await this.scheduleFor(tx, inst),
              ).toISOString()
            : sql`now() + make_interval(secs => ${Math.round(step.hours * 3600)})`,
        })
        .returning();
      await this.event(tx, inst.id, task!.id, 'task.opened', null, {
        step: step.id,
        wait: step.hours,
      });
      return;
    }

    const security = this.registry.get(inst.actionKey)?.securityCritical
      ? await this.subjectStaff(tx, inst)
      : null;
    const excludeStaffIds = security ? [security] : [];
    const ctx = await this.resolveContext(tx, inst);
    let who = await this.actors.resolve(
      step.actors.selectors,
      ctx,
      {
        excludeInitiator: step.actors.excludeInitiator,
        requireLocationScope: step.actors.requireLocationScope,
        excludeStaffIds,
      },
      tx,
    );
    let source: 'selectors' | 'fallback' = 'selectors';
    if (!who.length) {
      // nobody eligible — never a dead end (§4 #1)
      who = await this.actors.resolve(spec.fallbackActors, ctx, { excludeStaffIds }, tx);
      source = 'fallback';
    }

    const capped = who.length > MAX_ASSIGNEES;
    if (capped) who = who.slice(0, MAX_ASSIGNEES);
    const n = who.length;
    const mode = step.actors.mode;
    const required =
      n === 0
        ? 1
        : mode === 'any'
          ? 1
          : mode === 'quorum'
            ? Math.min(step.actors.quorum ?? 1, n)
            : n;
    const due = step.due;
    const [task] = await tx
      .insert(workflowTask)
      .values({
        instanceId: inst.id,
        stepId: step.id,
        stepType: step.type,
        title: step.name,
        branchRef,
        mode,
        required,
        excludeInitiator: step.actors.excludeInitiator,
        requireLocationScope: step.actors.requireLocationScope,
        requireComment: step.type === 'approval' ? step.requireRejectComment : step.requireNote,
        allowChanges: step.type === 'approval' ? step.allowChanges : false,
        selectors: step.actors.selectors,
        dueAt: due
          ? due.businessHours
            ? addBusinessHours(
                new Date(),
                due.hours,
                await this.scheduleFor(tx, inst),
              ).toISOString()
            : sql`now() + make_interval(secs => ${Math.round(due.hours * 3600)})`
          : null,
        remindEveryHours: due?.reminderEveryHours ? Math.round(due.reminderEveryHours) : null,
        maxReminders: due?.maxReminders ?? 0,
        onTimeout: due?.onTimeout ?? null,
      })
      .returning();
    if (n) {
      await tx.insert(workflowTaskAssignee).values(
        who.map((w, idx) => ({
          taskId: task!.id,
          instanceId: inst.id,
          staffProfileId: w.staffProfileId,
          source: source === 'fallback' ? 'fallback' : w.source,
          position: mode === 'sequence' ? idx : 0,
        })),
      );
    }
    if (n) await this.syncDelegates(r, inst, task!, excludeStaffIds);
    await this.event(tx, inst.id, task!.id, 'task.opened', null, {
      step: step.id,
      assignees: n,
      ...(capped ? { capped: MAX_ASSIGNEES } : {}),
      mode,
      required,
      ...(source === 'fallback' ? { fallback: true } : {}),
    });
    if (!n) {
      await this.event(tx, inst.id, task!.id, 'task.no_eligible_actor', null, { step: step.id });
      this.logger.warn(
        `workflow ${inst.id}: step "${step.id}" has nobody eligible, even after fallback`,
      );
    }
    // in-order steps only ask the first person until they decide
    const asked = mode === 'sequence' ? who.slice(0, 1) : who;
    const people = await this.actors.people(
      asked.map((w) => w.staffProfileId),
      inst.organizationId,
      tx,
    );
    r.notices.push({
      kind: 'assigned',
      recipients: people,
      title: step.name,
      body: `${inst.initiatorLabel ?? 'Someone'} is waiting for you: ${inst.subjectLabel ?? inst.actionKey}`,
      instanceId: inst.id,
      taskId: task!.id,
    });
  }

  /** The route reached its end: hand over to the executor (after this transaction commits). */
  private async finish(r: Run, inst: InstanceRow): Promise<void> {
    await r.tx
      .update(workflowInstance)
      .set({ status: 'applying', updatedAt: sql`now()` })
      .where(eq(workflowInstance.id, inst.id));
    inst.status = 'applying';
    await this.event(r.tx, inst.id, null, 'instance.approved', null, {});
  }

  // ───────────────────────────── decisions ─────────────────────────────

  async decide(
    actor: Actor,
    taskId: string,
    input: { decision: Decision; comment?: string },
  ): Promise<WorkflowSummary> {
    if (actor.kind !== 'staff' || !actor.staffProfileId) throw AppError.forbidden();
    const [pre] = await this.db
      .select({ instanceId: workflowTask.instanceId })
      .from(workflowTask)
      .where(eq(workflowTask.id, taskId))
      .limit(1);
    if (!pre) throw AppError.notFound('task');

    let after: InstanceRow | undefined;
    let run: Run | undefined;
    let wentStale = false;
    await this.tx(async (tx) => {
      const r = new Run(tx);
      run = r;
      // lock order is always instance → task → assignee, so concurrent deciders serialise
      const inst = await this.lockInstance(tx, pre.instanceId);
      if (inst.organizationId !== actor.organizationId) throw AppError.notFound('task');
      const [task] = await tx
        .select()
        .from(workflowTask)
        .where(eq(workflowTask.id, taskId))
        .for('update');
      if (!task) throw AppError.notFound('task');
      const [mine] = await tx
        .select()
        .from(workflowTaskAssignee)
        .where(
          and(
            eq(workflowTaskAssignee.taskId, taskId),
            eq(workflowTaskAssignee.staffProfileId, actor.staffProfileId!),
          ),
        )
        .for('update');
      if (!mine || mine.status === 'removed') {
        throw new AppError('forbidden', { title: 'This task is not assigned to you' });
      }
      // idempotent retry: same person, same decision → same answer
      if (mine.status === 'decided') {
        if (mine.decision === input.decision) {
          after = inst;
          return;
        }
        throw new AppError('state_conflict', {
          title: 'You have already decided this',
          params: { reason: 'already_decided', decision: mine.decision },
        });
      }
      if (inst.status !== 'running') {
        throw new AppError('state_conflict', {
          title: `This request is already ${inst.status.replace(/_/g, ' ')}`,
          params: { reason: 'instance_closed', status: inst.status },
        });
      }
      if (task.status !== 'open') {
        throw new AppError('state_conflict', {
          title: 'This step was just settled by someone else',
          params: { reason: 'task_settled', outcome: task.outcome },
        });
      }
      if (task.stepType === 'wait')
        throw AppError.businessRule('A timer step cannot be decided', { reason: 'wait_step' });

      const spec = (await this.definitions.loadVersion(inst.definitionVersionId, tx)).spec;
      await this.assertEligible(tx, inst, task, mine, actor);
      this.assertDecisionAllowed(task, input);

      // the subject changed since it was requested → close as stale rather than approve something else
      const def = this.registry.require(inst.actionKey);
      const fp = await def.fingerprint(inst.subjectId, tx);
      if (fp !== inst.subjectVersion) {
        await this.close(r, inst, 'stale', 'stale', null, actor.accountId);
        after = { ...inst, status: 'stale' };
        wentStale = true;
        return;
      }

      await tx
        .update(workflowTaskAssignee)
        .set({
          status: 'decided',
          decision: input.decision,
          comment: input.comment ?? null,
          decidedAt: sql`now()`,
          decidedByAccountId: actor.accountId,
          updatedAt: sql`now()`,
        })
        .where(eq(workflowTaskAssignee.id, mine.id));
      if (mine.onBehalfOf) {
        // a delegate decided: it counts as the person they cover for (who stays on record as the principal)
        await tx
          .update(workflowTaskAssignee)
          .set({
            status: 'decided',
            decision: input.decision,
            comment: input.comment ?? null,
            decidedAt: sql`now()`,
            decidedByAccountId: actor.accountId,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(workflowTaskAssignee.taskId, task.id),
              eq(workflowTaskAssignee.staffProfileId, mine.onBehalfOf),
            ),
          );
      } else {
        // the person decided themselves: whoever was covering for them is no longer needed
        await tx
          .update(workflowTaskAssignee)
          .set({ status: 'removed', updatedAt: sql`now()` })
          .where(
            and(
              eq(workflowTaskAssignee.taskId, task.id),
              eq(workflowTaskAssignee.onBehalfOf, actor.staffProfileId!),
              eq(workflowTaskAssignee.status, 'pending'),
            ),
          );
      }
      await this.event(tx, inst.id, task.id, `decision.${input.decision}`, actor, {
        step: task.stepId,
        comment: input.comment ?? null,
        ...(mine.onBehalfOf ? { onBehalfOf: mine.onBehalfOf } : {}),
      });
      r.audits.push({
        action: `workflow.task.${input.decision}`,
        targetType: inst.subjectType,
        targetId: inst.subjectId,
        actor,
        reason: input.comment,
        after: { instanceId: inst.id, step: task.stepId },
      });

      if (input.decision === 'request_changes') {
        await this.close(
          r,
          inst,
          'changes_requested',
          'changes_requested',
          input.comment ?? null,
          actor.accountId,
        );
        after = { ...inst, status: 'changes_requested' };
        return;
      }

      const mates = await tx
        .select()
        .from(workflowTaskAssignee)
        .where(eq(workflowTaskAssignee.taskId, task.id));
      // a delegate's row mirrors the person they cover — count each asked person once
      const principals = mates.filter((m) => !m.onBehalfOf);
      const approvals = principals.filter(
        (m) => m.decision === 'approve' || m.decision === 'complete',
      ).length;
      const pending = principals.filter((m) => m.status === 'pending').length;

      if (input.decision === 'reject') {
        // a quorum step survives a "no" while enough people can still say yes; every other mode is final
        const lost = task.mode === 'quorum' ? approvals + pending < task.required : true;
        if (lost) {
          await this.close(r, inst, 'rejected', 'rejected', input.comment ?? null, actor.accountId);
          after = { ...inst, status: 'rejected' };
        } else {
          await this.event(tx, inst.id, task.id, 'step.rejection_noted', actor, {
            approvals,
            pending,
          });
        }
        return;
      }

      if (approvals >= task.required) {
        await tx
          .update(workflowTask)
          .set({
            status: 'done',
            outcome: input.decision === 'complete' ? 'completed' : 'approved',
            decidedAt: sql`now()`,
            updatedAt: sql`now()`,
          })
          .where(eq(workflowTask.id, task.id));
        await tx
          .update(workflowTaskAssignee)
          .set({ status: 'removed', updatedAt: sql`now()` })
          .where(
            and(
              eq(workflowTaskAssignee.taskId, task.id),
              eq(workflowTaskAssignee.status, 'pending'),
            ),
          );
        await this.event(tx, inst.id, task.id, 'step.settled', actor, {
          step: task.stepId,
          outcome: 'approved',
        });
        await this.afterTask(r, inst, spec, task);
      } else if (task.mode === 'sequence') {
        // hand the baton to the next person in line
        const nextUp = principals
          .filter((m) => m.status === 'pending')
          .sort((a, b) => a.position - b.position)[0];
        if (nextUp) {
          const people = await this.actors.people([nextUp.staffProfileId], inst.organizationId, tx);
          r.notices.push({
            kind: 'assigned',
            recipients: people,
            title: task.title,
            body: `${inst.initiatorLabel ?? 'Someone'} is waiting for you: ${inst.subjectLabel ?? inst.actionKey}`,
            instanceId: inst.id,
            taskId: task.id,
          });
        }
      }
      const [fresh] = await tx
        .select()
        .from(workflowInstance)
        .where(eq(workflowInstance.id, inst.id));
      after = fresh;
    });
    await this.flushPost(run!);
    if (wentStale) {
      throw new AppError('state_conflict', {
        title:
          'This changed after it was requested, so the request was closed — ask again with the new version',
        params: { reason: 'stale' },
      });
    }
    const final = await this.loadInstance(after?.id ?? pre.instanceId);
    if (final.status === 'applying') await this.apply(final.id);
    return (await this.summaries([await this.loadInstance(final.id)]))[0]!;
  }

  /**
   * The subject of an open request was edited while it waited (§4 #10). The request as approved-so-far
   * no longer describes what will be applied, so it is closed (the subject returns to draft) and the
   * caller starts a fresh one — with the new content, routed by the rules that now apply.
   * Returns the closed request, or `null` if there was none.
   */
  async cancelForRestart(
    actor: Actor,
    actionKey: string,
    subjectId: string,
  ): Promise<InstanceRow | null> {
    if (actor.kind !== 'staff' || !actor.organizationId) return null;
    const def = this.registry.require(actionKey);
    const open = await this.openInstanceFor(actor.organizationId, def, subjectId);
    if (!open) return null;
    let run!: Run;
    let closed: InstanceRow | null = null;
    await this.tx(async (tx) => {
      run = new Run(tx);
      const inst = await this.lockInstance(tx, open.id);
      if (!(OPEN_WORKFLOW_STATUSES as readonly string[]).includes(inst.status)) return;
      await this.close(
        run,
        inst,
        'cancelled',
        'cancelled',
        'Changed while waiting — restarted',
        actor.accountId,
      );
      run.audits.push({
        action: 'workflow.instance.restarted',
        targetType: inst.subjectType,
        targetId: inst.subjectId,
        actor,
        after: { instanceId: inst.id },
      });
      closed = inst;
    });
    await this.flushPost(run);
    return closed;
  }

  /**
   * Legacy-friendly entry point: the subject's own "approve"/"reject" endpoint acts on the open
   * request if there is one. `null` = there is no open request (caller proceeds as if direct);
   * with `strict: false`, `null` is also returned when the caller is not one of the people asked.
   */
  async decideForSubject(input: {
    actor: Actor;
    actionKey: string;
    subjectId: string;
    decision: Decision;
    comment?: string;
    strict?: boolean;
  }): Promise<WorkflowSummary | null> {
    const actor = input.actor;
    if (actor.kind !== 'staff' || !actor.staffProfileId || !actor.organizationId) return null;
    const def = this.registry.require(input.actionKey);
    const inst = await this.openInstanceFor(actor.organizationId, def, input.subjectId);
    if (!inst) return null;
    const mine = await this.db
      .select({ taskId: workflowTask.id })
      .from(workflowTaskAssignee)
      .innerJoin(workflowTask, eq(workflowTask.id, workflowTaskAssignee.taskId))
      .where(
        and(
          eq(workflowTask.instanceId, inst.id),
          eq(workflowTask.status, 'open'),
          eq(workflowTaskAssignee.staffProfileId, actor.staffProfileId),
          eq(workflowTaskAssignee.status, 'pending'),
        ),
      )
      .orderBy(asc(workflowTask.createdAt))
      .limit(1);
    if (!mine[0]) {
      if (input.strict === false) return null;
      throw new AppError('forbidden', {
        title: 'This is waiting on other people — you are not one of them',
        params: { reason: 'not_assigned' },
      });
    }
    return this.decide(actor, mine[0].taskId, { decision: input.decision, comment: input.comment });
  }

  private async assertEligible(
    tx: Tx,
    inst: InstanceRow,
    task: TaskRow,
    mine: AssigneeRow,
    actor: Actor,
  ): Promise<void> {
    const deny = (reason: string, title: string) =>
      new AppError('forbidden', { title, params: { reason } });
    const active = await this.actors.people([actor.staffProfileId!], inst.organizationId, tx);
    if (!active.length) throw deny('not_active', 'Your account is no longer active');

    const security = this.registry.get(inst.actionKey)?.securityCritical;
    if (security && (await this.subjectStaff(tx, inst)) === actor.staffProfileId) {
      throw deny('subject_cannot_approve', 'You cannot decide a change to your own access');
    }
    // people added by fallback / escalation / a monitor are eligible by that act, not by selector
    // (and the "not the requester" filter belongs to the step's own actors, not to the safety net)
    const delegated = mine.source === 'delegate';
    const byAct = delegated || ['fallback', 'escalation', 'manual'].includes(mine.source);
    if (
      (!byAct || delegated) &&
      task.excludeInitiator &&
      inst.initiatorStaffId === actor.staffProfileId
    ) {
      throw deny('initiator_excluded', 'The person who made this request cannot decide it');
    }
    if (delegated) {
      // covering for someone: only while that arrangement is in force, and while they still have it pending
      const [principal] = mine.onBehalfOf
        ? await tx
            .select()
            .from(workflowTaskAssignee)
            .where(
              and(
                eq(workflowTaskAssignee.taskId, task.id),
                eq(workflowTaskAssignee.staffProfileId, mine.onBehalfOf),
              ),
            )
            .limit(1)
        : [];
      if (
        !mine.onBehalfOf ||
        !principal ||
        principal.status !== 'pending' ||
        !(await this.delegations.isActive(mine.onBehalfOf, actor.staffProfileId!, tx))
      ) {
        throw deny('delegation_ended', 'You are no longer covering for that person on this task');
      }
    }
    if (!byAct) {
      const now = await this.actors.resolve(
        task.selectors as ActorSelector[],
        await this.resolveContext(tx, inst),
        {
          excludeInitiator: task.excludeInitiator,
          requireLocationScope: task.requireLocationScope,
        },
        tx,
      );
      if (!now.some((a) => a.staffProfileId === actor.staffProfileId)) {
        throw deny('no_longer_eligible', 'You are no longer eligible to decide this step');
      }
    }
    if (task.mode === 'sequence') {
      const pending = await tx
        .select()
        .from(workflowTaskAssignee)
        .where(
          and(eq(workflowTaskAssignee.taskId, task.id), eq(workflowTaskAssignee.status, 'pending')),
        )
        .orderBy(asc(workflowTaskAssignee.position));
      const turn = Math.min(...pending.map((p) => p.position));
      if (pending.length && mine.position !== turn) {
        throw deny('not_your_turn', 'An earlier person in the order has not decided yet');
      }
    }
  }

  private assertDecisionAllowed(task: TaskRow, input: { decision: Decision; comment?: string }) {
    const bad = (title: string, reason: string) => AppError.businessRule(title, { reason });
    if (task.stepType === 'task') {
      if (input.decision !== 'complete')
        throw bad('A task can only be marked done', 'decision_not_allowed');
      if (task.requireComment && !input.comment?.trim())
        throw bad('Add a note to mark this done', 'comment_required');
      return;
    }
    if (input.decision === 'complete')
      throw bad('An approval step is approved or rejected', 'decision_not_allowed');
    if (input.decision === 'request_changes' && !task.allowChanges) {
      throw bad('This step cannot send a request back for changes', 'decision_not_allowed');
    }
    if (input.decision !== 'approve' && task.requireComment && !input.comment?.trim()) {
      throw bad('Say why — a comment is required', 'comment_required');
    }
  }

  /** A step just passed: continue down its branch or the main route. */
  private async afterTask(
    r: Run,
    inst: InstanceRow,
    spec: WorkflowSpec,
    task: TaskRow,
  ): Promise<void> {
    if (task.branchRef) {
      const [pid, i, pos] = task.branchRef.split(':') as [string, string, string];
      const parallel = spec.steps[pid] as Extract<WorkflowStep, { type: 'parallel' }>;
      await this.openInline(r, inst, spec, parallel, Number(i), Number(pos) + 1);
      return;
    }
    const step = spec.steps[task.stepId]!;
    const next = step.type === 'condition' ? null : (step as { next: string | null }).next;
    await this.proceed(r, inst, spec, next);
  }

  // ───────────────────────────── closing ─────────────────────────────

  private async close(
    r: Run,
    inst: InstanceRow,
    status: 'rejected' | 'withdrawn' | 'cancelled' | 'changes_requested' | 'stale',
    reason: ClosedReason,
    comment: string | null,
    actorAccountId: string | null,
  ): Promise<void> {
    const tx = r.tx;
    await this.cancelOpenTasks(tx, inst.id);
    await tx
      .update(workflowInstance)
      .set({ status, closedAt: sql`now()`, closedReason: comment, updatedAt: sql`now()` })
      .where(eq(workflowInstance.id, inst.id));
    inst.status = status;
    const def = this.registry.get(inst.actionKey);
    await def?.onClosed?.({
      tx,
      instance: inst,
      subjectId: inst.subjectId,
      payload: inst.payload,
      reason,
      comment,
      actorAccountId,
      audit: (e) => r.audits.push(e),
    });
    await this.event(tx, inst.id, null, `instance.${status}`, null, { comment });
    r.notices.push({
      kind: 'closed',
      status,
      recipients: [],
      recipientAccountIds: [inst.initiatorAccountId],
      title: `${inst.subjectLabel ?? inst.actionKey} — ${status.replace(/_/g, ' ')}`,
      body: comment ?? '',
      instanceId: inst.id,
    });
  }

  async withdraw(actor: Actor, instanceId: string, reason?: string): Promise<WorkflowSummary> {
    // read outside the transaction: which steps are open, and does any of them forbid withdrawing?
    const [inst] = await this.db
      .select()
      .from(workflowInstance)
      .where(eq(workflowInstance.id, instanceId))
      .limit(1);
    const forbids = inst ? await this.openStepForbidsWithdraw(inst) : false;
    return this.simpleClose(actor, instanceId, 'withdrawn', reason, (locked) => {
      const monitor = this.isMonitor(actor);
      if (locked.initiatorAccountId !== actor.accountId && !monitor) {
        throw new AppError('forbidden', {
          title: 'Only the requester or a monitor can withdraw this',
        });
      }
      if (forbids && !monitor) {
        throw new AppError('forbidden', {
          title: 'This step cannot be withdrawn — ask a monitor to cancel it',
          params: { reason: 'withdraw_not_allowed' },
        });
      }
    });
  }

  /** A step can say the requester may not pull the request back while it is being worked (§4 #11). */
  private async openStepForbidsWithdraw(inst: InstanceRow): Promise<boolean> {
    const open = await this.db
      .select({ stepId: workflowTask.stepId })
      .from(workflowTask)
      .where(and(eq(workflowTask.instanceId, inst.id), eq(workflowTask.status, 'open')));
    if (!open.length) return false;
    const spec = (await this.definitions.loadVersion(inst.definitionVersionId)).spec;
    return open.some((t) => {
      const step = spec.steps[t.stepId];
      return (
        !!step && (step.type === 'approval' || step.type === 'task') && step.allowWithdraw === false
      );
    });
  }

  async cancel(actor: Actor, instanceId: string, reason: string): Promise<WorkflowSummary> {
    if (!this.isMonitor(actor)) throw AppError.forbidden();
    if (!reason.trim())
      throw AppError.businessRule('A reason is required', { reason: 'comment_required' });
    return this.simpleClose(actor, instanceId, 'cancelled', reason);
  }

  private async simpleClose(
    actor: Actor,
    instanceId: string,
    status: 'withdrawn' | 'cancelled',
    reason: string | undefined,
    check?: (inst: InstanceRow) => void,
  ): Promise<WorkflowSummary> {
    let run!: Run;
    await this.tx(async (tx) => {
      run = new Run(tx);
      const inst = await this.lockInstance(tx, instanceId);
      if (inst.organizationId !== actor.organizationId) throw AppError.notFound('request');
      check?.(inst);
      if (!(OPEN_WORKFLOW_STATUSES as readonly string[]).includes(inst.status)) {
        throw new AppError('state_conflict', {
          title: `This request is already ${inst.status.replace(/_/g, ' ')}`,
          params: { reason: 'instance_closed', status: inst.status },
        });
      }
      await this.close(run, inst, status, status, reason ?? null, actor.accountId);
      run.audits.push({
        action: `workflow.instance.${status}`,
        targetType: inst.subjectType,
        targetId: inst.subjectId,
        actor,
        reason,
        after: { instanceId: inst.id },
      });
    });
    await this.flushPost(run);
    return (await this.summaries([await this.loadInstance(instanceId)]))[0]!;
  }

  /** A monitor pushes the current step(s) through (approve) or ends the request (reject) — audited. */
  async force(
    actor: Actor,
    instanceId: string,
    decision: 'approve' | 'reject',
    reason: string,
  ): Promise<WorkflowSummary> {
    if (!this.isMonitor(actor)) throw AppError.forbidden();
    if (!reason.trim())
      throw AppError.businessRule('A reason is required', { reason: 'comment_required' });
    let run!: Run;
    await this.tx(async (tx) => {
      run = new Run(tx);
      const inst = await this.lockInstance(tx, instanceId);
      if (inst.organizationId !== actor.organizationId) throw AppError.notFound('request');
      if (inst.status !== 'running') {
        throw new AppError('state_conflict', {
          title: 'This request is not running',
          params: { reason: 'instance_closed', status: inst.status },
        });
      }
      const spec = (await this.definitions.loadVersion(inst.definitionVersionId, tx)).spec;
      run.audits.push({
        action: `workflow.instance.forced_${decision}`,
        targetType: inst.subjectType,
        targetId: inst.subjectId,
        actor,
        reason,
        after: { instanceId: inst.id },
      });
      await this.event(tx, inst.id, null, `instance.forced_${decision}`, actor, { reason });
      if (decision === 'reject') {
        await this.close(run, inst, 'rejected', 'rejected', reason, actor.accountId);
        return;
      }
      for (let guard = 0; guard < MAX_STEPS_PER_ADVANCE; guard++) {
        const [open] = await tx
          .select()
          .from(workflowTask)
          .where(and(eq(workflowTask.instanceId, inst.id), eq(workflowTask.status, 'open')))
          .orderBy(asc(workflowTask.createdAt))
          .limit(1);
        if (!open || inst.status !== 'running') break;
        await tx
          .update(workflowTask)
          .set({ status: 'done', outcome: 'forced', decidedAt: sql`now()`, updatedAt: sql`now()` })
          .where(eq(workflowTask.id, open.id));
        await tx
          .update(workflowTaskAssignee)
          .set({ status: 'removed', updatedAt: sql`now()` })
          .where(
            and(
              eq(workflowTaskAssignee.taskId, open.id),
              eq(workflowTaskAssignee.status, 'pending'),
            ),
          );
        await this.afterTask(run, inst, spec, open);
      }
    });
    await this.flushPost(run);
    const fresh = await this.loadInstance(instanceId);
    if (fresh.status === 'applying') await this.apply(fresh.id);
    return (await this.summaries([await this.loadInstance(instanceId)]))[0]!;
  }

  /** A monitor replaces one asked person with another. */
  async reassign(
    actor: Actor,
    taskId: string,
    input: { toStaffProfileId: string; fromStaffProfileId?: string; reason?: string },
  ): Promise<WorkflowSummary> {
    if (!this.isMonitor(actor)) throw AppError.forbidden();
    let run!: Run;
    let instanceId!: string;
    await this.tx(async (tx) => {
      run = new Run(tx);
      const [pre] = await tx
        .select()
        .from(workflowTask)
        .where(eq(workflowTask.id, taskId))
        .limit(1);
      if (!pre) throw AppError.notFound('task');
      const inst = await this.lockInstance(tx, pre.instanceId);
      instanceId = inst.id;
      if (inst.organizationId !== actor.organizationId) throw AppError.notFound('task');
      const [task] = await tx
        .select()
        .from(workflowTask)
        .where(eq(workflowTask.id, taskId))
        .for('update');
      if (!task || task.status !== 'open' || task.stepType === 'wait') {
        throw new AppError('state_conflict', {
          title: 'This step is no longer open',
          params: { reason: 'task_settled' },
        });
      }
      const security = this.registry.get(inst.actionKey)?.securityCritical
        ? await this.subjectStaff(tx, inst)
        : null;
      if (security === input.toStaffProfileId) {
        throw AppError.businessRule('The subject of a change cannot approve it', {
          reason: 'subject_cannot_approve',
        });
      }
      const [target] = await this.actors.people([input.toStaffProfileId], inst.organizationId, tx);
      if (!target)
        throw AppError.businessRule('That person is not an active staff member', {
          reason: 'assignee_inactive',
        });

      const pending = await tx
        .select()
        .from(workflowTaskAssignee)
        .where(
          and(eq(workflowTaskAssignee.taskId, task.id), eq(workflowTaskAssignee.status, 'pending')),
        );
      const from = input.fromStaffProfileId
        ? pending.find((p) => p.staffProfileId === input.fromStaffProfileId)
        : pending.length === 1
          ? pending[0]
          : undefined;
      if (pending.length && !from) {
        throw AppError.businessRule('Say whose place this person takes', {
          reason: 'reassign_from_required',
        });
      }
      if (from) {
        await tx
          .update(workflowTaskAssignee)
          .set({ status: 'removed', updatedAt: sql`now()` })
          .where(eq(workflowTaskAssignee.id, from.id));
      }
      await tx
        .insert(workflowTaskAssignee)
        .values({
          taskId: task.id,
          instanceId: inst.id,
          staffProfileId: input.toStaffProfileId,
          source: 'manual',
          position: from?.position ?? 0,
        })
        .onConflictDoUpdate({
          target: [workflowTaskAssignee.taskId, workflowTaskAssignee.staffProfileId],
          set: {
            status: 'pending',
            source: 'manual',
            decision: null,
            decidedAt: null,
            updatedAt: sql`now()`,
          },
        });
      await this.event(tx, inst.id, task.id, 'task.reassigned', actor, {
        from: from?.staffProfileId ?? null,
        to: input.toStaffProfileId,
        reason: input.reason ?? null,
      });
      run.audits.push({
        action: 'workflow.task.reassigned',
        targetType: inst.subjectType,
        targetId: inst.subjectId,
        actor,
        reason: input.reason,
        after: { instanceId: inst.id, to: input.toStaffProfileId },
      });
      run.notices.push({
        kind: 'assigned',
        recipients: [target],
        title: task.title,
        body: `${inst.initiatorLabel ?? 'Someone'} is waiting for you: ${inst.subjectLabel ?? inst.actionKey}`,
        instanceId: inst.id,
        taskId: task.id,
      });
    });
    await this.flushPost(run);
    return (await this.summaries([await this.loadInstance(instanceId)]))[0]!;
  }

  // ───────────────────────────── apply ─────────────────────────────

  /**
   * Run the registered executor for an approved request — exactly once. Called right after the last
   * step passes and again by the reconciler for a request whose executor failed (idempotent, with
   * backoff). A failure never asks the approvers again.
   */
  async apply(instanceId: string): Promise<void> {
    let staleRun: Run | undefined;
    try {
      let completedRun: Run | undefined;
      await this.tx(async (tx) => {
        const inst = await this.lockInstance(tx, instanceId);
        if (inst.status !== 'applying' && inst.status !== 'apply_failed') return;
        const def = this.registry.require(inst.actionKey);
        const r = new Run(tx);
        const fp = await def.fingerprint(inst.subjectId, tx);
        if (fp !== inst.subjectVersion) {
          await this.close(
            r,
            inst,
            'stale',
            'stale',
            'The item changed after it was requested',
            null,
          );
          staleRun = r;
          return;
        }
        const result = await def.execute({
          tx,
          instance: inst,
          subjectId: inst.subjectId,
          payload: inst.payload,
          actors: await this.actorsOfRecord(tx, inst),
          audit: (e) => r.audits.push(e),
        });
        await tx
          .update(workflowInstance)
          .set({
            status: 'completed',
            closedAt: sql`now()`,
            result: (result as Record<string, unknown> | undefined) ?? null,
            lastError: null,
            updatedAt: sql`now()`,
          })
          .where(eq(workflowInstance.id, inst.id));
        await this.event(tx, inst.id, null, 'instance.completed', null, {});
        await this.outbox.emit(
          {
            type: 'workflow.instance.completed.v1',
            aggregateType: 'workflow_instance',
            aggregateId: inst.id,
            payload: {
              actionKey: inst.actionKey,
              subjectType: inst.subjectType,
              subjectId: inst.subjectId,
            },
          },
          tx,
        );
        r.audits.push({
          action: 'workflow.instance.completed',
          targetType: inst.subjectType,
          targetId: inst.subjectId,
          after: { instanceId: inst.id },
        });
        r.notices.push({
          kind: 'closed',
          status: 'completed',
          recipients: [],
          recipientAccountIds: [inst.initiatorAccountId],
          title: `${inst.subjectLabel ?? inst.actionKey} — approved and applied`,
          body: '',
          instanceId: inst.id,
        });
        completedRun = r;
      });
      if (completedRun) await this.flushPost(completedRun);
      if (staleRun) await this.flushPost(staleRun);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`workflow ${instanceId}: apply failed — ${message}`);
      const [cur] = await this.db
        .select()
        .from(workflowInstance)
        .where(eq(workflowInstance.id, instanceId));
      if (!cur) return;
      const attempts = cur.applyAttempts + 1;
      const backoffMin = Math.min(60, 2 ** attempts);
      await this.db
        .update(workflowInstance)
        .set({
          status: 'apply_failed',
          lastError: message.slice(0, 500),
          applyAttempts: attempts,
          nextApplyAt: sql`now() + make_interval(mins => ${backoffMin})`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(workflowInstance.id, instanceId),
            inArray(workflowInstance.status, ['applying', 'apply_failed']),
          ),
        );
      await this.event(this.db, instanceId, null, 'instance.apply_failed', null, {
        error: message.slice(0, 500),
        attempts,
      });
      await this.audit.record({
        action: 'workflow.instance.apply_failed',
        targetType: cur.subjectType,
        targetId: cur.subjectId,
        outcome: 'failed',
        reason: message.slice(0, 200),
      });
    }
  }

  private async actorsOfRecord(tx: Tx, inst: InstanceRow): Promise<ActorsOfRecord> {
    const rows = await tx
      .select({
        accountId: workflowTaskAssignee.decidedByAccountId,
        decision: workflowTaskAssignee.decision,
        at: workflowTaskAssignee.decidedAt,
      })
      .from(workflowTaskAssignee)
      .where(eq(workflowTaskAssignee.instanceId, inst.id))
      .orderBy(asc(workflowTaskAssignee.decidedAt));
    const approvals = rows.filter(
      (r) => r.accountId && (r.decision === 'approve' || r.decision === 'complete'),
    );
    const last = approvals[approvals.length - 1];
    let label: string | null = null;
    if (last?.accountId) {
      const [who] = await tx
        .select({ n: account.displayName })
        .from(account)
        .where(eq(account.id, last.accountId))
        .limit(1);
      label = who?.n ?? null;
    }
    return {
      initiatorAccountId: inst.initiatorAccountId,
      initiatorLabel: inst.initiatorLabel,
      approverAccountIds: [...new Set(approvals.map((a) => a.accountId!))],
      finalDeciderAccountId: last?.accountId ?? null,
      finalDeciderLabel: label,
    };
  }

  // ───────────────────────────── timers & reconciliation ─────────────────────────────

  /**
   * One pass over everything time-driven, derived from rows (jobs are only hints):
   * release finished timers, remind / escalate / time out overdue tasks, refresh who is eligible,
   * and retry executors that failed. Safe to run from several workers at once.
   */
  async tick(now: Date = new Date()): Promise<Record<string, number>> {
    const stats = { released: 0, reminded: 0, escalated: 0, timedOut: 0, refreshed: 0, retried: 0 };
    const nowIso = now.toISOString();

    // timers
    const waits = await this.db
      .select({ id: workflowTask.id, instanceId: workflowTask.instanceId })
      .from(workflowTask)
      .where(
        and(
          eq(workflowTask.status, 'open'),
          eq(workflowTask.stepType, 'wait'),
          lte(workflowTask.resumeAt, nowIso),
        ),
      )
      .limit(200);
    for (const w of waits) {
      if (await this.releaseWait(w.id, w.instanceId)) stats.released++;
    }

    // overdue tasks
    const overdue = await this.db
      .select()
      .from(workflowTask)
      .where(
        and(
          eq(workflowTask.status, 'open'),
          lte(workflowTask.dueAt, nowIso),
          sql`${workflowTask.escalatedAt} is null`,
        ),
      )
      .limit(200);
    for (const t of overdue) {
      const outcome = await this.handleTimeout(t.id, t.instanceId);
      if (outcome === 'escalated') stats.escalated++;
      else if (outcome === 'timed_out') stats.timedOut++;
    }

    // reminders
    const remindable = await this.db
      .select()
      .from(workflowTask)
      .where(
        and(
          eq(workflowTask.status, 'open'),
          sql`${workflowTask.remindEveryHours} is not null`,
          sql`${workflowTask.reminderCount} < ${workflowTask.maxReminders}`,
          sql`coalesce(${workflowTask.lastRemindedAt}, ${workflowTask.createdAt}) + make_interval(hours => ${workflowTask.remindEveryHours}) <= ${nowIso}::timestamptz`,
        ),
      )
      .limit(200);
    for (const t of remindable) {
      if (await this.remind(t.id, t.instanceId)) stats.reminded++;
    }

    // who is eligible right now (§4 #2, #3)
    const open = await this.db
      .select({ id: workflowTask.id, instanceId: workflowTask.instanceId })
      .from(workflowTask)
      .innerJoin(workflowInstance, eq(workflowInstance.id, workflowTask.instanceId))
      .where(
        and(
          eq(workflowTask.status, 'open'),
          eq(workflowInstance.status, 'running'),
          sql`${workflowTask.stepType} <> 'wait'`,
        ),
      )
      .limit(500);
    for (const t of open) {
      if (await this.refreshAssignees(t.id, t.instanceId)) stats.refreshed++;
    }

    // executors that failed, and any request stuck "applying" after a crash
    const retry = await this.db
      .select({ id: workflowInstance.id })
      .from(workflowInstance)
      .where(
        sql`(${workflowInstance.status} = 'apply_failed' and ${workflowInstance.applyAttempts} < ${MAX_APPLY_ATTEMPTS} and ${workflowInstance.nextApplyAt} <= ${nowIso}::timestamptz)
            or (${workflowInstance.status} = 'applying' and ${workflowInstance.updatedAt} < ${nowIso}::timestamptz - interval '2 minutes')`,
      )
      .limit(100);
    for (const i of retry) {
      await this.apply(i.id);
      stats.retried++;
    }
    return stats;
  }

  private async releaseWait(taskId: string, instanceId: string): Promise<boolean> {
    let run!: Run;
    let released = false;
    await this.tx(async (tx) => {
      run = new Run(tx);
      const inst = await this.lockInstance(tx, instanceId);
      const [task] = await tx
        .select()
        .from(workflowTask)
        .where(eq(workflowTask.id, taskId))
        .for('update');
      if (!task || task.status !== 'open' || inst.status !== 'running') return;
      const spec = (await this.definitions.loadVersion(inst.definitionVersionId, tx)).spec;
      await tx
        .update(workflowTask)
        .set({ status: 'done', outcome: 'completed', decidedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(workflowTask.id, taskId));
      await this.event(tx, inst.id, taskId, 'wait.released', null, { step: task.stepId });
      await this.afterTask(run, inst, spec, task);
      released = true;
    });
    if (released) {
      await this.flushPost(run);
      const fresh = await this.loadInstance(instanceId);
      if (fresh.status === 'applying') await this.apply(instanceId);
    }
    return released;
  }

  private async handleTimeout(
    taskId: string,
    instanceId: string,
  ): Promise<'escalated' | 'timed_out' | 'skipped'> {
    let run!: Run;
    let result: 'escalated' | 'timed_out' | 'skipped' = 'skipped';
    await this.tx(async (tx) => {
      run = new Run(tx);
      const inst = await this.lockInstance(tx, instanceId);
      const [task] = await tx
        .select()
        .from(workflowTask)
        .where(eq(workflowTask.id, taskId))
        .for('update');
      if (!task || task.status !== 'open' || inst.status !== 'running' || task.escalatedAt) return;
      const spec = (await this.definitions.loadVersion(inst.definitionVersionId, tx)).spec;
      const step = spec.steps[task.stepId] as
        | Extract<WorkflowStep, { type: 'approval' | 'task' }>
        | undefined;
      const action = task.onTimeout ?? 'wait';
      await tx
        .update(workflowTask)
        .set({ escalatedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(workflowTask.id, taskId));

      if (action === 'escalate') {
        const targets = step?.due?.escalateTo?.length ? step.due.escalateTo : spec.fallbackActors;
        const security = this.registry.get(inst.actionKey)?.securityCritical
          ? await this.subjectStaff(tx, inst)
          : null;
        const who = await this.actors.resolve(
          targets,
          await this.resolveContext(tx, inst),
          { excludeStaffIds: security ? [security] : [] },
          tx,
        );
        for (const w of who) {
          await tx
            .insert(workflowTaskAssignee)
            .values({
              taskId,
              instanceId,
              staffProfileId: w.staffProfileId,
              source: 'escalation',
              position: 0,
            })
            .onConflictDoNothing();
        }
        // for "all"/"quorum" the escalated people stand in for those who did not answer
        await this.event(tx, instanceId, taskId, 'task.escalated', null, { to: who.length });
        const people = await this.actors.people(
          who.map((w) => w.staffProfileId),
          inst.organizationId,
          tx,
        );
        run.notices.push({
          kind: 'escalated',
          recipients: people,
          title: task.title,
          body: `Overdue: ${inst.subjectLabel ?? inst.actionKey}`,
          instanceId,
          taskId,
        });
        result = 'escalated';
      } else if (action === 'approve' || action === 'reject') {
        await this.event(tx, instanceId, taskId, `task.timed_out_${action}`, null, {});
        if (action === 'reject') {
          await this.close(
            run,
            inst,
            'rejected',
            'timed_out',
            'No answer before the deadline',
            null,
          );
        } else {
          await tx
            .update(workflowTask)
            .set({
              status: 'done',
              outcome: 'timed_out',
              decidedAt: sql`now()`,
              updatedAt: sql`now()`,
            })
            .where(eq(workflowTask.id, taskId));
          await tx
            .update(workflowTaskAssignee)
            .set({ status: 'removed', updatedAt: sql`now()` })
            .where(
              and(
                eq(workflowTaskAssignee.taskId, taskId),
                eq(workflowTaskAssignee.status, 'pending'),
              ),
            );
          await this.afterTask(run, inst, spec, task);
        }
        result = 'timed_out';
      } else {
        await this.event(tx, instanceId, taskId, 'task.overdue', null, {});
      }
    });
    await this.flushPost(run);
    const fresh = await this.loadInstance(instanceId);
    if (fresh.status === 'applying') await this.apply(instanceId);
    return result;
  }

  private async remind(taskId: string, instanceId: string): Promise<boolean> {
    let run!: Run;
    let sent = false;
    await this.tx(async (tx) => {
      run = new Run(tx);
      const inst = await this.lockInstance(tx, instanceId);
      const [task] = await tx
        .select()
        .from(workflowTask)
        .where(eq(workflowTask.id, taskId))
        .for('update');
      if (!task || task.status !== 'open' || inst.status !== 'running') return;
      const pending = await tx
        .select({ id: workflowTaskAssignee.staffProfileId })
        .from(workflowTaskAssignee)
        .where(
          and(eq(workflowTaskAssignee.taskId, taskId), eq(workflowTaskAssignee.status, 'pending')),
        );
      await tx
        .update(workflowTask)
        .set({
          reminderCount: sql`${workflowTask.reminderCount} + 1`,
          lastRemindedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(workflowTask.id, taskId));
      const people = await this.actors.people(
        pending.map((p) => p.id),
        inst.organizationId,
        tx,
      );
      run.notices.push({
        kind: 'reminder',
        recipients: task.mode === 'sequence' ? people.slice(0, 1) : people,
        title: task.title,
        body: `Reminder: ${inst.subjectLabel ?? inst.actionKey} is waiting for you`,
        instanceId,
        taskId,
      });
      await this.event(tx, instanceId, taskId, 'task.reminded', null, {
        n: task.reminderCount + 1,
      });
      sent = true;
    });
    if (sent) await this.flushPost(run);
    return sent;
  }

  /** Re-resolve a step's selectors: add people who became eligible, drop those who no longer are. */
  private async refreshAssignees(taskId: string, instanceId: string): Promise<boolean> {
    let changed = false;
    let run!: Run;
    await this.tx(async (tx) => {
      run = new Run(tx);
      const inst = await this.lockInstance(tx, instanceId);
      const [task] = await tx
        .select()
        .from(workflowTask)
        .where(eq(workflowTask.id, taskId))
        .for('update');
      if (!task || task.status !== 'open' || inst.status !== 'running') return;
      const spec = (await this.definitions.loadVersion(inst.definitionVersionId, tx)).spec;
      const security = this.registry.get(inst.actionKey)?.securityCritical
        ? await this.subjectStaff(tx, inst)
        : null;
      const excludeStaffIds = security ? [security] : [];
      const ctx = await this.resolveContext(tx, inst);
      const live = await this.actors.resolve(
        task.selectors as ActorSelector[],
        ctx,
        {
          excludeInitiator: task.excludeInitiator,
          requireLocationScope: task.requireLocationScope,
          excludeStaffIds,
        },
        tx,
      );
      const rows = await tx
        .select()
        .from(workflowTaskAssignee)
        .where(eq(workflowTaskAssignee.taskId, taskId));
      const bySource = (s: string) => rows.filter((r) => r.status === 'pending' && r.source === s);
      const liveIds = new Set(live.map((l) => l.staffProfileId));
      const activeNow = new Set(
        (
          await this.actors.people(
            rows.map((r) => r.staffProfileId),
            inst.organizationId,
            tx,
          )
        ).map((p) => p.staffProfileId),
      );

      // drop pending selector-derived people who are no longer eligible
      for (const row of rows) {
        if (row.status !== 'pending') continue;
        const selectorBased = !['fallback', 'escalation', 'manual', 'delegate'].includes(
          row.source,
        );
        if (
          (selectorBased && !liveIds.has(row.staffProfileId)) ||
          !activeNow.has(row.staffProfileId) ||
          excludeStaffIds.includes(row.staffProfileId)
        ) {
          await tx
            .update(workflowTaskAssignee)
            .set({ status: 'removed', updatedAt: sql`now()` })
            .where(eq(workflowTaskAssignee.id, row.id));
          await this.event(tx, instanceId, taskId, 'assignee.removed', null, {
            staff: row.staffProfileId,
          });
          changed = true;
        }
      }
      // add newly eligible people (role / group selectors resolve live)
      const known = new Set(rows.map((r) => r.staffProfileId));
      const added = live.filter((l) => !known.has(l.staffProfileId));
      for (const l of added) {
        await tx
          .insert(workflowTaskAssignee)
          .values({
            taskId,
            instanceId,
            staffProfileId: l.staffProfileId,
            source: l.source,
            position: task.mode === 'sequence' ? 99 : 0,
          })
          .onConflictDoNothing();
        await this.event(tx, instanceId, taskId, 'assignee.added', null, {
          staff: l.staffProfileId,
        });
        changed = true;
      }
      if (added.length && task.mode !== 'sequence') {
        const people = await this.actors.people(
          added.map((a) => a.staffProfileId),
          inst.organizationId,
          tx,
        );
        run.notices.push({
          kind: 'assigned',
          recipients: people,
          title: task.title,
          body: `${inst.initiatorLabel ?? 'Someone'} is waiting for you: ${inst.subjectLabel ?? inst.actionKey}`,
          instanceId,
          taskId,
        });
      }

      if (await this.syncDelegates(run, inst, task, excludeStaffIds)) changed = true;
      // nobody left to answer → fall back (never a dead end), unless someone already decided enough
      const after = await tx
        .select()
        .from(workflowTaskAssignee)
        .where(eq(workflowTaskAssignee.taskId, taskId));
      const pendingNow = after.filter((r) => r.status === 'pending').length;
      const approvals = after.filter(
        (r) => r.decision === 'approve' || r.decision === 'complete',
      ).length;
      if (!pendingNow && approvals < task.required) {
        const fb = await this.actors.resolve(spec.fallbackActors, ctx, { excludeStaffIds }, tx);
        for (const f of fb) {
          await tx
            .insert(workflowTaskAssignee)
            .values({
              taskId,
              instanceId,
              staffProfileId: f.staffProfileId,
              source: 'fallback',
              position: 0,
            })
            .onConflictDoUpdate({
              target: [workflowTaskAssignee.taskId, workflowTaskAssignee.staffProfileId],
              set: { status: 'pending', source: 'fallback', decision: null, updatedAt: sql`now()` },
              setWhere: sql`${workflowTaskAssignee.status} = 'removed'`,
            });
        }
        if (fb.length) {
          await this.event(tx, instanceId, taskId, 'task.fell_back', null, { to: fb.length });
          const people = await this.actors.people(
            fb.map((f) => f.staffProfileId),
            inst.organizationId,
            tx,
          );
          run.notices.push({
            kind: 'assigned',
            recipients: people,
            title: task.title,
            body: `Nobody else can decide this — it needs you: ${inst.subjectLabel ?? inst.actionKey}`,
            instanceId,
            taskId,
          });
          changed = true;
        }
      }
      void bySource;
    });
    if (changed) await this.flushPost(run);
    return changed;
  }

  /**
   * Keep a task's cover in step with the delegations in force: whoever is covering for a person
   * with this task pending can decide it too; when a delegation ends, is revoked, or the person has
   * already decided, the cover row goes. Returns true if anything changed.
   */
  private async syncDelegates(
    r: Run,
    inst: InstanceRow,
    task: TaskRow,
    excludeStaffIds: string[],
  ): Promise<boolean> {
    const tx = r.tx;
    const rows = await tx
      .select()
      .from(workflowTaskAssignee)
      .where(eq(workflowTaskAssignee.taskId, task.id));
    const principals = rows.filter((x) => !x.onBehalfOf && x.status === 'pending');
    const cover = await this.delegations.activeDelegates(
      principals.map((p) => p.staffProfileId),
      tx,
    );
    let changed = false;

    // drop cover that is no longer in force (or whose principal has decided / gone)
    for (const row of rows.filter((x) => x.source === 'delegate' && x.status === 'pending')) {
      const stillCovering =
        principals.some((p) => p.staffProfileId === row.onBehalfOf) &&
        (cover.get(row.onBehalfOf!) ?? []).includes(row.staffProfileId);
      if (!stillCovering) {
        await tx
          .update(workflowTaskAssignee)
          .set({ status: 'removed', updatedAt: sql`now()` })
          .where(eq(workflowTaskAssignee.id, row.id));
        await this.event(tx, inst.id, task.id, 'delegate.removed', null, {
          staff: row.staffProfileId,
          onBehalfOf: row.onBehalfOf,
        });
        changed = true;
      }
    }

    // add cover that has started
    const known = new Set(rows.map((x) => x.staffProfileId));
    const wanted: Array<{ delegate: string; principal: AssigneeRow }> = [];
    for (const p of principals) {
      for (const d of cover.get(p.staffProfileId) ?? []) {
        if (known.has(d) || excludeStaffIds.includes(d) || wanted.some((w) => w.delegate === d))
          continue;
        if (task.excludeInitiator && inst.initiatorStaffId === d) continue;
        wanted.push({ delegate: d, principal: p });
      }
    }
    if (wanted.length) {
      const active = new Set(
        (
          await this.actors.people(
            wanted.map((w) => w.delegate),
            inst.organizationId,
            tx,
          )
        ).map((x) => x.staffProfileId),
      );
      const add = wanted.filter((w) => active.has(w.delegate));
      for (const w of add) {
        await tx
          .insert(workflowTaskAssignee)
          .values({
            taskId: task.id,
            instanceId: inst.id,
            staffProfileId: w.delegate,
            source: 'delegate',
            onBehalfOf: w.principal.staffProfileId,
            position: w.principal.position,
          })
          .onConflictDoNothing();
        await this.event(tx, inst.id, task.id, 'delegate.added', null, {
          staff: w.delegate,
          onBehalfOf: w.principal.staffProfileId,
        });
      }
      if (add.length) {
        const people = await this.actors.people(
          add.map((a) => a.delegate),
          inst.organizationId,
          tx,
        );
        r.notices.push({
          kind: 'assigned',
          recipients: task.mode === 'sequence' ? [] : people,
          title: task.title,
          body: `You are covering an approval: ${inst.subjectLabel ?? inst.actionKey}`,
          instanceId: inst.id,
          taskId: task.id,
        });
        changed = true;
      }
    }
    return changed;
  }

  // ───────────────────────────── reads ─────────────────────────────

  /** Live status of the requests attached to these subjects (for badges on the subject's own page). */
  async summaryForSubjects(
    orgId: string,
    subjectType: string,
    ids: string[],
  ): Promise<Map<string, WorkflowSummary>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select()
      .from(workflowInstance)
      .where(
        and(
          eq(workflowInstance.organizationId, orgId),
          eq(workflowInstance.subjectType, subjectType),
          inArray(workflowInstance.subjectId, ids),
          inArray(workflowInstance.status, [...OPEN_WORKFLOW_STATUSES]),
        ),
      );
    const sums = await this.summaries(rows);
    return new Map(rows.map((r, i) => [r.subjectId, sums[i]!]));
  }

  async summaries(rows: InstanceRow[]): Promise<WorkflowSummary[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const tasks = await this.db
      .select()
      .from(workflowTask)
      .where(and(inArray(workflowTask.instanceId, ids), eq(workflowTask.status, 'open')))
      .orderBy(asc(workflowTask.createdAt));
    const assignees = tasks.length
      ? await this.db
          .select()
          .from(workflowTaskAssignee)
          .where(
            and(
              inArray(
                workflowTaskAssignee.taskId,
                tasks.map((t) => t.id),
              ),
              eq(workflowTaskAssignee.status, 'pending'),
              // cover rows mirror the person they cover — the summary names the people asked
              isNull(workflowTaskAssignee.onBehalfOf),
            ),
          )
      : [];
    const names = await this.actors.labels(
      [...new Set(assignees.map((a) => a.staffProfileId))],
      this.db,
    );
    const defNames = await this.definitions.namesForVersions([
      ...new Set(rows.map((r) => r.definitionVersionId)),
    ]);
    return rows.map((inst) => {
      const openTask = tasks.find((t) => t.instanceId === inst.id);
      const who = openTask ? assignees.filter((a) => a.taskId === openTask.id) : [];
      const shown = who.slice(0, 5).map((a) => names.get(a.staffProfileId) ?? '—');
      return {
        instanceId: inst.id,
        actionKey: inst.actionKey,
        status: inst.status,
        definitionName: defNames.get(inst.definitionVersionId) ?? '',
        stepId: openTask?.stepId ?? null,
        stepName: openTask?.title ?? null,
        waitingFor: shown,
        waitingForMore: Math.max(0, who.length - shown.length),
        dueAt: openTask?.dueAt ?? null,
        revision: inst.revision,
      };
    });
  }

  async loadInstance(id: string, exec: Pick<Database, 'select'> = this.db): Promise<InstanceRow> {
    const [row] = await exec
      .select()
      .from(workflowInstance)
      .where(eq(workflowInstance.id, id))
      .limit(1);
    if (!row) throw AppError.notFound('request');
    return row;
  }

  // ───────────────────────────── helpers ─────────────────────────────

  isMonitor(actor: Actor): boolean {
    return this.rbac.has(actor, 'workflow.monitor');
  }

  /**
   * The opening hours deadlines are counted in: the request's own location (with its one-off
   * closures), or — when the request has no location — plain clock time.
   */
  private async scheduleFor(tx: Tx, inst: InstanceRow): Promise<Schedule | null> {
    if (!inst.locationCode) return null;
    const [loc] = await tx
      .select()
      .from(location)
      .where(
        and(eq(location.organizationId, inst.organizationId), eq(location.code, inst.locationCode)),
      )
      .limit(1);
    if (!loc) return null;
    const exceptions = await tx
      .select()
      .from(locationHoursException)
      .where(eq(locationHoursException.locationId, loc.id));
    return {
      timezone: loc.timezone,
      regularHours: (loc.regularHours ?? []) as Schedule['regularHours'],
      exceptions: exceptions.map((e) => ({
        date: e.date,
        closed: e.closed,
        open: e.open,
        close: e.close,
      })),
    };
  }

  private stateOf(inst: InstanceRow): InstanceState {
    return (inst.state ?? {}) as InstanceState;
  }

  private async saveState(tx: Tx, inst: InstanceRow, state: InstanceState): Promise<void> {
    inst.state = state as Record<string, unknown>;
    await tx
      .update(workflowInstance)
      .set({ state: state as Record<string, unknown>, updatedAt: sql`now()` })
      .where(eq(workflowInstance.id, inst.id));
  }

  private async lockInstance(tx: Tx, id: string): Promise<InstanceRow> {
    const [row] = await tx
      .select()
      .from(workflowInstance)
      .where(eq(workflowInstance.id, id))
      .for('update');
    if (!row) throw AppError.notFound('request');
    return row;
  }

  private async cancelOpenTasks(tx: Tx, instanceId: string, branchPrefix?: string): Promise<void> {
    const where = and(
      eq(workflowTask.instanceId, instanceId),
      eq(workflowTask.status, 'open'),
      branchPrefix ? sql`${workflowTask.branchRef} like ${branchPrefix + '%'}` : undefined,
    );
    const open = await tx.select({ id: workflowTask.id }).from(workflowTask).where(where);
    if (!open.length) return;
    const ids = open.map((t) => t.id);
    await tx
      .update(workflowTask)
      .set({ status: 'cancelled', decidedAt: sql`now()`, updatedAt: sql`now()` })
      .where(inArray(workflowTask.id, ids));
    await tx
      .update(workflowTaskAssignee)
      .set({ status: 'removed', updatedAt: sql`now()` })
      .where(
        and(inArray(workflowTaskAssignee.taskId, ids), eq(workflowTaskAssignee.status, 'pending')),
      );
  }

  private async resolveContext(tx: Tx, inst: InstanceRow) {
    let subjectOwnerStaffId: string | null = null;
    const def = this.registry.get(inst.actionKey);
    const owner = await def?.subjectOwner?.(inst.subjectId, tx);
    if (owner?.staffProfileId) subjectOwnerStaffId = owner.staffProfileId;
    else if (owner?.accountId) {
      const [p] = await tx
        .select({ id: staffProfile.id })
        .from(staffProfile)
        .where(eq(staffProfile.accountId, owner.accountId))
        .limit(1);
      subjectOwnerStaffId = p?.id ?? null;
    }
    return {
      organizationId: inst.organizationId,
      initiatorStaffId: inst.initiatorStaffId,
      subjectOwnerStaffId,
      locationCode: inst.locationCode,
    };
  }

  /** The staff profile the change is *about* (only for security-critical actions). */
  private async subjectStaff(tx: Tx, inst: InstanceRow): Promise<string | null> {
    const owner = await this.registry.get(inst.actionKey)?.subjectOwner?.(inst.subjectId, tx);
    if (owner?.staffProfileId) return owner.staffProfileId;
    if (owner?.accountId) {
      const [p] = await tx
        .select({ id: staffProfile.id })
        .from(staffProfile)
        .where(eq(staffProfile.accountId, owner.accountId))
        .limit(1);
      return p?.id ?? null;
    }
    return null;
  }

  private async resolveWho(
    tx: Tx,
    inst: InstanceRow,
    selectors: ActorSelector[],
    opts: { excludeInitiator?: boolean },
  ) {
    return this.actors.resolve(selectors, await this.resolveContext(tx, inst), opts, tx);
  }

  private async event(
    exec: Pick<Database, 'insert'>,
    instanceId: string,
    taskId: string | null,
    type: string,
    actor: Actor | null,
    data: Record<string, unknown>,
  ): Promise<void> {
    await exec.insert(workflowEvent).values({
      instanceId,
      taskId,
      type,
      actorAccountId: actor?.accountId ?? null,
      actorLabel: actor?.displayName ?? null,
      data,
    });
  }

  private tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => fn(tx as unknown as Tx));
  }

  private async flushPost(r: Run): Promise<void> {
    for (const a of r.audits) {
      try {
        await this.audit.record(a);
      } catch (err) {
        this.logger.warn(`audit write failed: ${(err as Error).message}`);
      }
    }
    if (r.notices.length) await this.notifier.deliver(r.notices).catch(() => undefined);
  }
}
