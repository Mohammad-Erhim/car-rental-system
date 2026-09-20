import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { account, staffProfile } from '../../database/schema/iam';
import { workflowDelegation } from '../../database/schema/workflow';

import { WorkflowActorsService } from './workflow-actors.service';

const MAX_DAYS = 90;

/**
 * Out of office. A person names a delegate for a period; while it lasts the delegate may decide the
 * delegator's tasks (open ones and new ones). Never transitive — a delegate cannot pass it on — so
 * chains and loops cannot form; time-boxed (≤ 90 days); revocable at any time; audited; and the
 * request history always says "decided by X on behalf of Y".
 */
@Injectable()
export class WorkflowDelegationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly actors: WorkflowActorsService,
    private readonly audit: AuditService,
  ) {}

  /** delegator → delegates, for delegations valid right now (used by the engine). */
  async activeDelegates(
    delegatorIds: string[],
    exec: Pick<Database, 'select'> = this.db,
  ): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!delegatorIds.length) return out;
    const rows = await exec
      .select({ from: workflowDelegation.delegatorStaffId, to: workflowDelegation.delegateStaffId })
      .from(workflowDelegation)
      .where(
        and(
          inArray(workflowDelegation.delegatorStaffId, delegatorIds),
          isNull(workflowDelegation.revokedAt),
          lte(workflowDelegation.validFrom, sql`now()`),
          gt(workflowDelegation.validUntil, sql`now()`),
        ),
      );
    for (const r of rows) out.set(r.from, [...(out.get(r.from) ?? []), r.to]);
    return out;
  }

  /** Is `delegate` currently allowed to act for `delegator`? */
  async isActive(
    delegatorId: string,
    delegateId: string,
    exec: Pick<Database, 'select'> = this.db,
  ): Promise<boolean> {
    const map = await this.activeDelegates([delegatorId], exec);
    return (map.get(delegatorId) ?? []).includes(delegateId);
  }

  async listFor(actor: Actor) {
    const me = this.me(actor);
    const rows = await this.db
      .select()
      .from(workflowDelegation)
      .where(
        and(
          eq(workflowDelegation.organizationId, actor.organizationId!),
          or(
            eq(workflowDelegation.delegatorStaffId, me),
            eq(workflowDelegation.delegateStaffId, me),
          ),
          isNull(workflowDelegation.revokedAt),
          gt(workflowDelegation.validUntil, sql`now()`),
        ),
      )
      .orderBy(desc(workflowDelegation.validUntil));
    const names = await this.actors.labels([
      ...new Set(rows.flatMap((r) => [r.delegatorStaffId, r.delegateStaffId])),
    ]);
    return rows.map((r) => ({
      id: r.id,
      direction: r.delegatorStaffId === me ? ('outgoing' as const) : ('incoming' as const),
      delegator: { staffProfileId: r.delegatorStaffId, name: names.get(r.delegatorStaffId) ?? '—' },
      delegate: { staffProfileId: r.delegateStaffId, name: names.get(r.delegateStaffId) ?? '—' },
      validFrom: r.validFrom,
      validUntil: r.validUntil,
      reason: r.reason,
      active: new Date(r.validFrom).getTime() <= Date.now(),
    }));
  }

  /** Colleagues one could hand tasks to (active staff, not me). Any staff member may list them. */
  async people(actor: Actor) {
    const me = this.me(actor);
    const rows = await this.db
      .select({ staffProfileId: staffProfile.id, name: account.displayName, email: account.email })
      .from(staffProfile)
      .innerJoin(account, eq(account.id, staffProfile.accountId))
      .where(
        and(
          eq(staffProfile.organizationId, actor.organizationId!),
          eq(staffProfile.status, 'active'),
          eq(account.status, 'active'),
        ),
      )
      .orderBy(account.displayName);
    return rows.filter((r) => r.staffProfileId !== me);
  }

  async create(
    actor: Actor,
    input: {
      delegateStaffProfileId: string;
      validFrom?: string;
      validUntil: string;
      reason?: string;
    },
  ) {
    const me = this.me(actor);
    const orgId = actor.organizationId!;
    if (input.delegateStaffProfileId === me) {
      throw AppError.businessRule('You cannot delegate to yourself', { reason: 'delegate_self' });
    }
    const [delegate] = await this.actors.people([input.delegateStaffProfileId], orgId);
    if (!delegate)
      throw AppError.businessRule('That person is not an active staff member', {
        reason: 'delegate_inactive',
      });

    const from = input.validFrom ? new Date(input.validFrom) : new Date();
    const until = new Date(input.validUntil);
    if (Number.isNaN(until.getTime()) || Number.isNaN(from.getTime())) {
      throw AppError.validation([{ path: 'validUntil', code: 'invalid_date' }]);
    }
    if (until <= from)
      throw AppError.businessRule('The end must be after the start', {
        reason: 'delegation_window',
      });
    if (until.getTime() <= Date.now())
      throw AppError.businessRule('The end must be in the future', { reason: 'delegation_window' });
    if (until.getTime() - from.getTime() > MAX_DAYS * 86_400_000) {
      throw AppError.businessRule(`A delegation can last at most ${MAX_DAYS} days`, {
        reason: 'delegation_too_long',
      });
    }
    // no A→B while B→A is in force: a loop would leave a task with nobody who can genuinely own it
    if (await this.isActive(input.delegateStaffProfileId, me)) {
      throw AppError.businessRule(
        'That person is already covering for you — a delegation cannot loop back',
        { reason: 'delegation_loop' },
      );
    }
    const [row] = await this.db
      .insert(workflowDelegation)
      .values({
        organizationId: orgId,
        delegatorStaffId: me,
        delegateStaffId: input.delegateStaffProfileId,
        validFrom: from.toISOString(),
        validUntil: until.toISOString(),
        reason: input.reason ?? null,
        createdBy: actor.accountId,
      })
      .returning();
    await this.audit.record({
      action: 'workflow.delegation.created',
      targetType: 'workflow_delegation',
      targetId: row!.id,
      actor,
      reason: input.reason,
      after: {
        delegate: input.delegateStaffProfileId,
        from: from.toISOString(),
        until: until.toISOString(),
      },
    });
    return (await this.listFor(actor)).find((d) => d.id === row!.id)!;
  }

  async revoke(actor: Actor, id: string, isMonitor: boolean) {
    const me = this.me(actor);
    const [row] = await this.db
      .select()
      .from(workflowDelegation)
      .where(
        and(
          eq(workflowDelegation.id, id),
          eq(workflowDelegation.organizationId, actor.organizationId!),
        ),
      )
      .limit(1);
    if (!row || row.revokedAt) throw AppError.notFound('delegation');
    // the delegator, the delegate (declining) or a monitor
    if (![row.delegatorStaffId, row.delegateStaffId].includes(me) && !isMonitor)
      throw AppError.forbidden();
    await this.db
      .update(workflowDelegation)
      .set({ revokedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(workflowDelegation.id, id));
    await this.audit.record({
      action: 'workflow.delegation.revoked',
      targetType: 'workflow_delegation',
      targetId: id,
      actor,
    });
  }

  private me(actor: Actor): string {
    if (actor.kind !== 'staff' || !actor.staffProfileId || !actor.organizationId)
      throw AppError.forbidden();
    return actor.staffProfileId;
  }
}
