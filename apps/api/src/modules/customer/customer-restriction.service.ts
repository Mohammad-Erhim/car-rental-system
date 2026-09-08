import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { customer, customerRestriction } from '../../database/schema/customer';

/**
 * FR-ADM-002 — customer eligibility restrictions, write side + enforcement. A free-text note
 * cannot deny service; a `customer_restriction` row does. Lifecycle:
 * `pending_review` → (a **different** user approves) → `active` → `lifted`; or → `rejected`.
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
export class CustomerRestrictionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

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
    return this.shape(row!);
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
    // segregation of duties — the author cannot approve their own restriction (FR-ADM-002)
    if (decision === 'approve' && row.createdBy && row.createdBy === actor.accountId) {
      throw AppError.forbidden('A restriction must be approved by someone other than its author');
    }
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
