import { createHash } from 'node:crypto';

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { customer, customerRestriction } from '../../database/schema/customer';
import { ConfigPublic } from '../config/config.public';
import { WorkflowPublic } from '../workflow/workflow.public';

/**
 * FR-ADM-002 — customer eligibility restrictions, write side + enforcement. A free-text note
 * cannot deny service; a `customer_restriction` row does. Lifecycle:
 * created → (`customer.restriction.activate` workflow — Direct by default, so it is active at once)
 * → `active` → `lifted`. With a pipeline bound, it waits as `pending_review` until the steps pass, or
 * ends `rejected`. Rows created before workflows existed can still be approved / rejected directly.
 * `assertCanTransact()` is the enforcement point called by booking + rental pickup.
 */
export type RestrictionScope = 'all' | `category:${string}` | `location:${string}`;

export interface CreateRestrictionInput {
  category: 'review' | 'block';
  scope?: string;
  reasonCode?: string;
  evidenceRef?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

@Injectable()
export class CustomerRestrictionService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly refData: ConfigPublic,
    private readonly workflows: WorkflowPublic,
  ) {}

  /** Putting a restriction into force is an action an owner can put a pipeline in front of. */
  onModuleInit(): void {
    this.workflows.register({
      key: 'customer.restriction.activate',
      subjectType: 'customer_restriction',
      label: 'Put a customer restriction into force',
      description: 'A review or block on a customer takes effect.',
      variables: ['category', 'scope', 'reasonCode'],
      fingerprint: async (id, tx) => {
        const [r] = await tx
          .select()
          .from(customerRestriction)
          .where(eq(customerRestriction.id, id))
          .limit(1);
        if (!r) return null;
        return createHash('sha256')
          .update(
            JSON.stringify([
              r.customerId,
              r.category,
              r.scope,
              r.reasonCode,
              r.evidenceRef,
              r.effectiveFrom,
              r.effectiveTo,
            ]),
          )
          .digest('hex');
      },
      subjectOwner: async (id, tx) => {
        const [r] = await tx
          .select({ by: customerRestriction.createdBy })
          .from(customerRestriction)
          .where(eq(customerRestriction.id, id))
          .limit(1);
        return r?.by ? { accountId: r.by } : null;
      },
      execute: async ({ tx, subjectId, actors, audit }) => {
        const [r] = await tx
          .select()
          .from(customerRestriction)
          .where(eq(customerRestriction.id, subjectId))
          .limit(1);
        if (!r || r.status !== 'pending_review')
          throw new Error('The restriction is no longer waiting for approval');
        await tx
          .update(customerRestriction)
          .set({
            status: 'active',
            isActive: true,
            approvedBy: actors.finalDeciderAccountId ?? actors.initiatorAccountId,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(customerRestriction.id, subjectId));
        audit({
          action: 'customer.restriction.approved',
          targetType: 'customer_restriction',
          targetId: subjectId,
          actor: {
            accountId: actors.finalDeciderAccountId ?? actors.initiatorAccountId,
            displayName: actors.finalDeciderLabel ?? actors.initiatorLabel ?? undefined,
            kind: 'staff',
          },
          after: { customerId: r.customerId, viaWorkflow: true },
        });
        return { status: 'active' };
      },
      // a restriction has no draft to return to: any outcome other than "applied" ends it as rejected
      onClosed: async ({ tx, subjectId, reason, comment, audit }) => {
        await tx
          .update(customerRestriction)
          .set({
            status: 'rejected',
            isActive: false,
            reviewNotes: comment ?? reason.replace(/_/g, ' '),
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(customerRestriction.id, subjectId),
              eq(customerRestriction.status, 'pending_review'),
            ),
          );
        audit({
          action: 'customer.restriction.rejected',
          targetType: 'customer_restriction',
          targetId: subjectId,
          reason: comment ?? reason,
        });
      },
    });
  }

  private async customerRow(customerId: string) {
    const [row] = await this.db.select().from(customer).where(eq(customer.id, customerId)).limit(1);
    if (!row) throw AppError.notFound('customer');
    return row;
  }

  async list(customerId: string) {
    await this.customerRow(customerId);
    const rows = await this.db
      .select()
      .from(customerRestriction)
      .where(eq(customerRestriction.customerId, customerId))
      .orderBy(desc(customerRestriction.createdAt));
    return rows.map((r) => this.shape(r));
  }

  async create(actor: Actor, customerId: string, input: CreateRestrictionInput) {
    await this.customerRow(customerId);
    const scope = input.scope ?? 'all';
    if (!/^(all|category:[a-z0-9_-]+|location:[A-Za-z0-9_-]+)$/.test(scope)) {
      throw AppError.validation([{ path: 'scope', code: 'invalid_string' }]);
    }
    if (input.reasonCode) {
      await this.refData.assertLookupCode('restriction_reason', input.reasonCode, 'reasonCode');
    }
    if (input.effectiveFrom && input.effectiveTo && input.effectiveFrom >= input.effectiveTo) {
      throw AppError.businessRule('The restriction end must be after its start', {
        reason: 'restriction_window_inverted',
      });
    }
    const [row] = await this.db
      .insert(customerRestriction)
      .values({
        customerId,
        category: input.category,
        scope,
        reasonCode: input.reasonCode ?? null,
        evidenceRef: input.evidenceRef ?? null,
        status: 'pending_review',
        isActive: false,
        effectiveFrom: input.effectiveFrom ?? null,
        effectiveTo: input.effectiveTo ?? null,
        createdBy: actor.accountId,
      })
      .returning();
    await this.audit.record({
      action: 'customer.restriction.created',
      targetType: 'customer_restriction',
      targetId: row!.id,
      actor,
      after: { customerId, category: input.category, scope },
    });

    const gate = await this.workflows.gate({
      actionKey: 'customer.restriction.activate',
      subjectId: row!.id,
      subjectLabel: `${input.category} restriction · ${scope}`,
      context: { category: input.category, scope, reasonCode: input.reasonCode ?? null },
      actor,
    });
    if (!gate.direct)
      return { ...this.shape(await this.load(customerId, row!.id)), workflow: gate.summary };

    // Direct: no pipeline is bound, so it takes effect at once (nobody else has to click "approve")
    const [active] = await this.db
      .update(customerRestriction)
      .set({
        status: 'active',
        isActive: true,
        approvedBy: actor.accountId,
        updatedBy: actor.accountId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customerRestriction.id, row!.id))
      .returning();
    await this.audit.record({
      action: 'customer.restriction.approved',
      targetType: 'customer_restriction',
      targetId: row!.id,
      actor,
      after: { customerId, direct: true },
    });
    return this.shape(active!);
  }

  async decide(
    actor: Actor,
    customerId: string,
    restrictionId: string,
    decision: 'approve' | 'reject',
    notes?: string,
  ) {
    const row = await this.load(customerId, restrictionId);
    if (row.status !== 'pending_review') {
      throw AppError.businessRule(`A ${row.status} restriction cannot be ${decision}d`, {
        reason: 'restriction_not_pending',
      });
    }
    // waiting on a pipeline → this is the caller's step; otherwise it predates workflows (legacy)
    const acted = await this.workflows.actOnOpen({
      actor,
      actionKey: 'customer.restriction.activate',
      subjectId: restrictionId,
      decision,
      comment: notes,
    });
    if (acted)
      return { ...this.shape(await this.load(customerId, restrictionId)), workflow: acted };
    const [updated] = await this.db
      .update(customerRestriction)
      .set(
        decision === 'approve'
          ? {
              status: 'active',
              isActive: true,
              approvedBy: actor.accountId,
              reviewNotes: notes ?? null,
              updatedBy: actor.accountId,
              updatedAt: new Date().toISOString(),
            }
          : {
              status: 'rejected',
              isActive: false,
              reviewNotes: notes ?? null,
              updatedBy: actor.accountId,
              updatedAt: new Date().toISOString(),
            },
      )
      .where(eq(customerRestriction.id, restrictionId))
      .returning();
    await this.audit.record({
      action: `customer.restriction.${decision}d`,
      targetType: 'customer_restriction',
      targetId: restrictionId,
      actor,
      after: { customerId, notes },
    });
    return this.shape(updated!);
  }

  async lift(actor: Actor, customerId: string, restrictionId: string, notes?: string) {
    const row = await this.load(customerId, restrictionId);
    if (row.status !== 'active') {
      throw AppError.businessRule('Only an active restriction can be lifted', {
        reason: 'restriction_not_active',
      });
    }
    const [updated] = await this.db
      .update(customerRestriction)
      .set({
        status: 'lifted',
        isActive: false,
        effectiveTo: new Date().toISOString(),
        reviewNotes: notes ?? row.reviewNotes,
        updatedBy: actor.accountId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customerRestriction.id, restrictionId))
      .returning();
    await this.audit.record({
      action: 'customer.restriction.lifted',
      targetType: 'customer_restriction',
      targetId: restrictionId,
      actor,
      after: { customerId, notes },
    });
    return this.shape(updated!);
  }

  /**
   * Enforcement point (FR-ADM-002). Throws 422 `customer_restricted` when an **active** `block`
   * restriction applies to this customer for the given category / location at `at`. `review`
   * restrictions do not block — they surface in the ops record only.
   */
  async assertCanTransact(
    customerId: string,
    ctx: { categoryCode?: string; locationCode?: string; at?: Date },
  ): Promise<void> {
    const at = (ctx.at ?? new Date()).toISOString();
    const rows = await this.db
      .select()
      .from(customerRestriction)
      .where(
        and(
          eq(customerRestriction.customerId, customerId),
          eq(customerRestriction.status, 'active'),
          eq(customerRestriction.category, 'block'),
          or(isNull(customerRestriction.effectiveFrom), lte(customerRestriction.effectiveFrom, at)),
          or(isNull(customerRestriction.effectiveTo), gte(customerRestriction.effectiveTo, at)),
        ),
      );
    const hit = rows.find((r) => this.scopeApplies(r.scope, ctx));
    if (hit) {
      throw AppError.businessRule(
        'This customer is currently restricted from completing this booking — contact a manager',
        { reason: 'customer_restricted', scope: hit.scope, restrictionId: hit.id },
      );
    }
  }

  private scopeApplies(
    scope: string,
    ctx: { categoryCode?: string; locationCode?: string },
  ): boolean {
    if (scope === 'all') return true;
    if (scope.startsWith('category:')) return scope.slice(9) === ctx.categoryCode;
    if (scope.startsWith('location:')) return scope.slice(9) === ctx.locationCode;
    return false;
  }

  private async load(customerId: string, restrictionId: string) {
    const [row] = await this.db
      .select()
      .from(customerRestriction)
      .where(
        and(
          eq(customerRestriction.id, restrictionId),
          eq(customerRestriction.customerId, customerId),
        ),
      )
      .limit(1);
    if (!row) throw AppError.notFound('customer restriction');
    return row;
  }

  private shape(r: typeof customerRestriction.$inferSelect) {
    return {
      id: r.id,
      customerId: r.customerId,
      category: r.category,
      scope: r.scope,
      reasonCode: r.reasonCode,
      evidenceRef: r.evidenceRef,
      status: r.status,
      reviewNotes: r.reviewNotes,
      createdBy: r.createdBy,
      approvedBy: r.approvedBy,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      isActive: r.isActive,
      createdAt: r.createdAt,
    };
  }
}
