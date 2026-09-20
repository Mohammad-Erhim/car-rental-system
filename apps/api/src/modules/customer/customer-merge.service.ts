import { createHash } from 'node:crypto';

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { desc, eq, inArray, isNull } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import {
  customer,
  customerMerge,
  customerRestriction,
  driver,
} from '../../database/schema/customer';
import { reservation } from '../../database/schema/reservation';
import { WorkflowPublic } from '../workflow/workflow.public';

/**
 * FR-ADM-001 — duplicate review + **reversible** merge. `merge()` moves the duplicate's saved
 * drivers and eligibility restrictions onto the survivor, marks the duplicate `merged`, and
 * records exactly which rows moved. `unmerge()` uses that record to put everything back. No row
 * is deleted; history stays resolvable through `mergedIntoId`.
 */
@Injectable()
export class CustomerMergeService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly workflows: WorkflowPublic,
  ) {}

  /** Merging two customer records is an action an owner can put a pipeline in front of. */
  onModuleInit(): void {
    this.workflows.register<{ survivorId: string; reason?: string }>({
      key: 'customer.merge',
      subjectType: 'customer',
      label: 'Merge two customer records',
      description:
        'Combine a duplicate customer into another; the duplicate is kept but marked merged.',
      variables: ['reason'],
      fingerprint: async (mergedId, tx) => {
        const [d] = await tx
          .select({ s: customer.status, v: customer.version })
          .from(customer)
          .where(eq(customer.id, mergedId))
          .limit(1);
        return d
          ? createHash('sha256')
              .update(JSON.stringify([d.s, d.v]))
              .digest('hex')
          : null;
      },
      execute: async ({ subjectId, payload, instance, actors, audit }) => {
        const actor = this.workflows.asActor(actors, instance.organizationId, payload);
        const r = await this.mergeNow(actor, payload.survivorId, subjectId, payload.reason);
        audit({
          action: 'customer.merge_approved',
          targetType: 'customer',
          targetId: subjectId,
          actor,
          after: { viaWorkflow: true },
        });
        return { merged: true, ...(r as object) };
      },
    });
  }

  private async load(id: string) {
    const [row] = await this.db.select().from(customer).where(eq(customer.id, id)).limit(1);
    if (!row) throw AppError.notFound('customer');
    return row;
  }

  /** merge `mergedId` into `survivorId` */
  async merge(actor: Actor, survivorId: string, mergedId: string, reason?: string) {
    if (survivorId === mergedId) {
      throw AppError.businessRule('A customer cannot be merged into itself', {
        reason: 'same_customer',
      });
    }
    const survivor = await this.load(survivorId);
    const dup = await this.load(mergedId);
    if (survivor.status !== 'active') {
      throw AppError.businessRule('The surviving record must be active', {
        reason: 'survivor_not_active',
      });
    }
    if (dup.status === 'merged') {
      throw AppError.businessRule('That record is already merged', { reason: 'already_merged' });
    }
    return this.workflows.govern(
      {
        actionKey: 'customer.merge',
        subjectId: mergedId,
        subjectLabel: `Merge ${dup.fullName ?? mergedId} into ${survivor.fullName ?? survivorId}`,
        payload: { survivorId, reason },
        context: { reason: reason ?? null },
        actor,
      },
      () => this.mergeNow(actor, survivorId, mergedId, reason),
    );
  }

  private async mergeNow(actor: Actor, survivorId: string, mergedId: string, reason?: string) {
    if (survivorId === mergedId) {
      throw AppError.businessRule('A customer cannot be merged into itself', {
        reason: 'same_customer',
      });
    }
    const survivor = await this.load(survivorId);
    const dup = await this.load(mergedId);
    if (survivor.status !== 'active') {
      throw AppError.businessRule('The surviving record must be active', {
        reason: 'survivor_not_active',
      });
    }
    if (dup.status === 'merged') {
      throw AppError.businessRule('That record is already merged', { reason: 'already_merged' });
    }

    return this.db.transaction(async (tx) => {
      const movedDrivers = (
        await tx
          .update(driver)
          .set({ customerId: survivorId, updatedAt: new Date().toISOString() })
          .where(eq(driver.customerId, mergedId))
          .returning({ id: driver.id })
      ).map((r) => r.id);

      const movedRestrictions = (
        await tx
          .update(customerRestriction)
          .set({ customerId: survivorId, updatedAt: new Date().toISOString() })
          .where(eq(customerRestriction.customerId, mergedId))
          .returning({ id: customerRestriction.id })
      ).map((r) => r.id);

      // Reservations are owned by accountId (see customer.service.ts's `detail()`) —
      // `reservation.customerId` was a column nothing in the system ever populated, so repointing
      // it here (as this previously did) always moved zero rows while still reporting success;
      // it has since been dropped entirely (migration 0029). Repoint by accountId instead,
      // capturing exactly which reservations moved so `unmerge` restores only those. Only
      // meaningful when both sides have an account; an account-less duplicate (a walk-in profile)
      // has no reservations reachable this way to move, and there's nowhere valid to attach
      // ownership if the survivor has no account either.
      const movedReservations =
        dup.accountId && survivor.accountId
          ? (
              await tx
                .update(reservation)
                .set({ accountId: survivor.accountId })
                .where(eq(reservation.accountId, dup.accountId))
                .returning({ id: reservation.id })
            ).map((r) => r.id)
          : [];

      await tx
        .update(customer)
        .set({
          status: 'merged',
          mergedIntoId: survivorId,
          updatedBy: actor.accountId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(customer.id, mergedId));

      const [rec] = await tx
        .insert(customerMerge)
        .values({
          survivorId,
          mergedId,
          reason: reason ?? null,
          movedDrivers,
          movedRestrictions,
          movedReservations,
          createdBy: actor.accountId,
        })
        .returning();

      await this.audit.record({
        action: 'customer.merged',
        targetType: 'customer',
        targetId: mergedId,
        actor,
        after: {
          survivorId,
          movedDrivers: movedDrivers.length,
          movedRestrictions: movedRestrictions.length,
          movedReservations: movedReservations.length,
        },
      });
      return {
        mergeId: rec!.id,
        survivorId,
        mergedId,
        movedDrivers: movedDrivers.length,
        movedRestrictions: movedRestrictions.length,
        movedReservations: movedReservations.length,
      };
    });
  }

  /** reverse the most recent un-reversed merge that involves `customerId` (as survivor or dup) */
  async unmerge(actor: Actor, customerId: string) {
    const candidates = await this.db
      .select()
      .from(customerMerge)
      .where(isNull(customerMerge.reversedAt))
      .orderBy(desc(customerMerge.createdAt));
    const merge = candidates.find((m) => m.survivorId === customerId || m.mergedId === customerId);
    if (!merge) throw AppError.notFound('reversible merge');

    return this.db.transaction(async (tx) => {
      if (merge.movedDrivers.length) {
        await tx
          .update(driver)
          .set({ customerId: merge.mergedId, updatedAt: new Date().toISOString() })
          .where(inArray(driver.id, merge.movedDrivers));
      }
      if (merge.movedRestrictions.length) {
        await tx
          .update(customerRestriction)
          .set({ customerId: merge.mergedId, updatedAt: new Date().toISOString() })
          .where(inArray(customerRestriction.id, merge.movedRestrictions));
      }
      if (merge.movedReservations.length) {
        // merge() never touches the duplicate's own accountId (only its status/mergedIntoId),
        // so it's still there to restore reservation ownership back to.
        const [dup] = await tx
          .select({ accountId: customer.accountId })
          .from(customer)
          .where(eq(customer.id, merge.mergedId))
          .limit(1);
        await tx
          .update(reservation)
          .set({ accountId: dup?.accountId ?? null })
          .where(inArray(reservation.id, merge.movedReservations));
      }

      await tx
        .update(customer)
        .set({
          status: 'active',
          mergedIntoId: null,
          updatedBy: actor.accountId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(customer.id, merge.mergedId));

      await tx
        .update(customerMerge)
        .set({ reversedAt: new Date().toISOString(), reversedBy: actor.accountId })
        .where(eq(customerMerge.id, merge.id));

      await this.audit.record({
        action: 'customer.unmerged',
        targetType: 'customer',
        targetId: merge.mergedId,
        actor,
        after: { survivorId: merge.survivorId, mergeId: merge.id },
      });
      return { mergeId: merge.id, restored: merge.mergedId, from: merge.survivorId };
    });
  }

  /** merges where this customer is the survivor (for the consolidated record) */
  async historyFor(customerId: string) {
    const rows = await this.db
      .select()
      .from(customerMerge)
      .where(eq(customerMerge.survivorId, customerId))
      .orderBy(desc(customerMerge.createdAt));
    return rows.map((r) => ({
      id: r.id,
      mergedId: r.mergedId,
      reason: r.reason,
      reversedAt: r.reversedAt,
      movedDrivers: r.movedDrivers.length,
      movedRestrictions: r.movedRestrictions.length,
      createdAt: r.createdAt,
    }));
  }
}
