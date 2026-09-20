import { OPEN_WORKFLOW_STATUSES } from '@carrental/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import {
  workflowEvent,
  workflowInstance,
  workflowTask,
  workflowTaskAssignee,
} from '../../database/schema/workflow';

import { WorkflowActorsService } from './workflow-actors.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowRegistry } from './workflow-registry.service';

const MAX_LIMIT = 100;

/** Read side: my tasks, requests I made, the monitor's view, and one request in full. */
@Injectable()
export class WorkflowQueryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly engine: WorkflowEngineService,
    private readonly actors: WorkflowActorsService,
    private readonly registry: WorkflowRegistry,
  ) {}

  private staffId(actor: Actor): string {
    if (actor.kind !== 'staff' || !actor.staffProfileId) throw AppError.forbidden();
    return actor.staffProfileId;
  }

  /**
   * My open tasks: overdue first, then by deadline, then oldest first — the natural order of urgency,
   * since an overdue task is simply one whose deadline is furthest in the past. Paged by KEYSET
   * (`cursor` = the last row's deadline / created / id), so page 50 costs the same as page 1 and rows
   * that appear or disappear while someone scrolls can never cause a skip or a repeat.
   * `canDecide` is false for someone waiting their turn in an in-order step.
   */
  async inbox(actor: Actor, opts: { limit?: number; cursor?: string } = {}) {
    const me = this.staffId(actor);
    const limit = Math.min(opts.limit ?? 50, MAX_LIMIT);
    const after = opts.cursor ? this.decodeCursor(opts.cursor) : null;
    const dueKey = sql`coalesce(${workflowTask.dueAt}, 'infinity'::timestamptz)`;
    const rows = await this.db
      .select({
        taskId: workflowTask.id,
        instanceId: workflowTask.instanceId,
        stepId: workflowTask.stepId,
        title: workflowTask.title,
        stepType: workflowTask.stepType,
        mode: workflowTask.mode,
        dueAt: workflowTask.dueAt,
        requireComment: workflowTask.requireComment,
        allowChanges: workflowTask.allowChanges,
        position: workflowTaskAssignee.position,
        createdAt: workflowTask.createdAt,
        actionKey: workflowInstance.actionKey,
        subjectType: workflowInstance.subjectType,
        subjectId: workflowInstance.subjectId,
        subjectLabel: workflowInstance.subjectLabel,
        initiatorLabel: workflowInstance.initiatorLabel,
        requestedAt: workflowInstance.createdAt,
        overdue: sql<boolean>`(${workflowTask.dueAt} is not null and ${workflowTask.dueAt} < now())`,
      })
      .from(workflowTaskAssignee)
      .innerJoin(workflowTask, eq(workflowTask.id, workflowTaskAssignee.taskId))
      .innerJoin(workflowInstance, eq(workflowInstance.id, workflowTask.instanceId))
      .where(
        and(
          eq(workflowTaskAssignee.staffProfileId, me),
          eq(workflowTaskAssignee.status, 'pending'),
          eq(workflowTask.status, 'open'),
          eq(workflowInstance.status, 'running'),
          eq(workflowInstance.organizationId, actor.organizationId!),
          after
            ? sql`(${dueKey}, ${workflowTask.createdAt}, ${workflowTask.id}) > (coalesce(${after.d}::timestamptz, 'infinity'::timestamptz), ${after.c}::timestamptz, ${after.i}::uuid)`
            : undefined,
        ),
      )
      .orderBy(asc(dueKey), asc(workflowTask.createdAt), asc(workflowTask.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    // in-order steps: only the first pending person may act
    const seq = page.filter((r) => r.mode === 'sequence').map((r) => r.taskId);
    const turn = new Map<string, string>();
    if (seq.length) {
      const pend = await this.db
        .select()
        .from(workflowTaskAssignee)
        .where(
          and(
            inArray(workflowTaskAssignee.taskId, seq),
            eq(workflowTaskAssignee.status, 'pending'),
          ),
        )
        .orderBy(asc(workflowTaskAssignee.position));
      for (const p of pend) if (!turn.has(p.taskId)) turn.set(p.taskId, p.staffProfileId);
    }
    const items = page.map((r) => ({
      ...r,
      canDecide: r.mode === 'sequence' ? turn.get(r.taskId) === me : true,
      decisions:
        r.stepType === 'task'
          ? ['complete']
          : r.allowChanges
            ? ['approve', 'reject', 'request_changes']
            : ['approve', 'reject'],
      actionLabel: this.registry.get(r.actionKey)?.label ?? r.actionKey,
    }));
    return {
      items,
      nextCursor:
        hasMore && last
          ? this.encodeCursor({ d: last.dueAt, c: last.createdAt, i: last.taskId })
          : null,
    };
  }

  private encodeCursor(c: { d: string | null; c: string; i: string }): string {
    return Buffer.from(JSON.stringify(c)).toString('base64url');
  }

  private decodeCursor(raw: string): { d: string | null; c: string; i: string } {
    try {
      const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
        d: string | null;
        c: string;
        i: string;
      };
      if (
        typeof v.c !== 'string' ||
        typeof v.i !== 'string' ||
        (v.d !== null && typeof v.d !== 'string')
      )
        throw new Error('shape');
      if (
        Number.isNaN(Date.parse(v.c)) ||
        (v.d !== null && Number.isNaN(Date.parse(v.d))) ||
        !/^[0-9a-f-]{36}$/i.test(v.i)
      )
        throw new Error('value');
      return v;
    } catch {
      throw AppError.validation([{ path: 'cursor', code: 'invalid' }]);
    }
  }

  async pendingCount(actor: Actor): Promise<{ pending: number; overdue: number }> {
    const me = this.staffId(actor);
    const [row] = await this.db
      .select({
        pending: sql<number>`count(*)::int`,
        overdue: sql<number>`count(*) filter (where ${workflowTask.dueAt} is not null and ${workflowTask.dueAt} < now())::int`,
      })
      .from(workflowTaskAssignee)
      .innerJoin(workflowTask, eq(workflowTask.id, workflowTaskAssignee.taskId))
      .innerJoin(workflowInstance, eq(workflowInstance.id, workflowTask.instanceId))
      .where(
        and(
          eq(workflowTaskAssignee.staffProfileId, me),
          eq(workflowTaskAssignee.status, 'pending'),
          eq(workflowTask.status, 'open'),
          eq(workflowInstance.status, 'running'),
          eq(workflowInstance.organizationId, actor.organizationId!),
        ),
      );
    return { pending: row?.pending ?? 0, overdue: row?.overdue ?? 0 };
  }

  /** Requests I made (or, for a monitor with `all`, every request), newest first. */
  async instances(
    actor: Actor,
    opts: {
      scope: 'mine' | 'all';
      status?: string;
      actionKey?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    this.staffId(actor);
    if (opts.scope === 'all' && !this.engine.isMonitor(actor)) throw AppError.forbidden();
    const limit = Math.min(opts.limit ?? 50, MAX_LIMIT);
    const where = [eq(workflowInstance.organizationId, actor.organizationId!)];
    if (opts.scope === 'mine') where.push(eq(workflowInstance.initiatorAccountId, actor.accountId));
    if (opts.status === 'open')
      where.push(inArray(workflowInstance.status, [...OPEN_WORKFLOW_STATUSES]));
    else if (opts.status) where.push(eq(workflowInstance.status, opts.status));
    if (opts.actionKey) where.push(eq(workflowInstance.actionKey, opts.actionKey));
    const rows = await this.db
      .select()
      .from(workflowInstance)
      .where(and(...where))
      .orderBy(desc(workflowInstance.createdAt))
      .limit(limit)
      .offset(opts.offset ?? 0);
    const sums = await this.engine.summaries(rows);
    return rows.map((r, i) => ({
      ...sums[i]!,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      subjectLabel: r.subjectLabel,
      initiatorLabel: r.initiatorLabel,
      createdAt: r.createdAt,
      closedAt: r.closedAt,
      lastError: r.lastError,
      actionLabel: this.registry.get(r.actionKey)?.label ?? r.actionKey,
    }));
  }

  /** One request in full: steps and who decided what, the proposed change, and the history. */
  async instanceDetail(actor: Actor, id: string) {
    const me = this.staffId(actor);
    const [inst] = await this.db
      .select()
      .from(workflowInstance)
      .where(
        and(
          eq(workflowInstance.id, id),
          eq(workflowInstance.organizationId, actor.organizationId!),
        ),
      )
      .limit(1);
    if (!inst) throw AppError.notFound('request');
    const tasks = await this.db
      .select()
      .from(workflowTask)
      .where(eq(workflowTask.instanceId, id))
      .orderBy(asc(workflowTask.createdAt));
    const assignees = await this.db
      .select()
      .from(workflowTaskAssignee)
      .where(eq(workflowTaskAssignee.instanceId, id));

    const involved =
      inst.initiatorAccountId === actor.accountId ||
      assignees.some((a) => a.staffProfileId === me) ||
      this.engine.isMonitor(actor);
    if (!involved) throw AppError.notFound('request');

    const names = await this.actors.labels([...new Set(assignees.map((a) => a.staffProfileId))]);
    const events = await this.db
      .select()
      .from(workflowEvent)
      .where(eq(workflowEvent.instanceId, id))
      .orderBy(asc(workflowEvent.createdAt));
    const [summary] = await this.engine.summaries([inst]);
    const def = this.registry.get(inst.actionKey);
    return {
      ...summary!,
      subjectType: inst.subjectType,
      subjectId: inst.subjectId,
      subjectLabel: inst.subjectLabel,
      actionLabel: def?.label ?? inst.actionKey,
      actionDescription: def?.description ?? null,
      initiator: { accountId: inst.initiatorAccountId, label: inst.initiatorLabel },
      // the requester's rights snapshot is for the executor only — never sent to the browser
      payload: Object.fromEntries(Object.entries(inst.payload).filter(([k]) => k !== '_requester')),
      context: inst.context,
      createdAt: inst.createdAt,
      closedAt: inst.closedAt,
      closedReason: inst.closedReason,
      lastError: inst.lastError,
      applyAttempts: inst.applyAttempts,
      canWithdraw:
        (inst.initiatorAccountId === actor.accountId || this.engine.isMonitor(actor)) &&
        (OPEN_WORKFLOW_STATUSES as readonly string[]).includes(inst.status),
      canMonitor: this.engine.isMonitor(actor),
      tasks: tasks.map((t) => ({
        id: t.id,
        stepId: t.stepId,
        title: t.title,
        stepType: t.stepType,
        status: t.status,
        outcome: t.outcome,
        mode: t.mode,
        required: t.required,
        dueAt: t.dueAt,
        requireComment: t.requireComment,
        allowChanges: t.allowChanges,
        decidedAt: t.decidedAt,
        assignees: assignees
          .filter((a) => a.taskId === t.id)
          .sort((a, b) => a.position - b.position)
          .map((a) => ({
            staffProfileId: a.staffProfileId,
            name: names.get(a.staffProfileId) ?? '—',
            status: a.status,
            decision: a.decision,
            comment: a.comment,
            decidedAt: a.decidedAt,
            source: a.source,
            isMe: a.staffProfileId === me,
          })),
      })),
      history: events.map((e) => ({
        id: e.id,
        type: e.type,
        actor: e.actorLabel,
        data: e.data,
        at: e.createdAt,
      })),
    };
  }
}
