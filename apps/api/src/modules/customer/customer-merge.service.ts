import { Inject, Injectable } from '@nestjs/common';
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

/**
 * FR-ADM-001 — duplicate review + **reversible** merge. `merge()` moves the duplicate's saved
 * drivers and eligibility restrictions onto the survivor, marks the duplicate `merged`, and
 * records exactly which rows moved. `unmerge()` uses that record to put everything back. No row
 * is deleted; history stays resolvable through `mergedIntoId`.
 */
@Injectable()
export class CustomerMergeService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

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

      // reservations link primarily by accountId; repoint any that also carried the duplicate's
      // customerId, capturing exactly which so `unmerge` restores only those (not the survivor's own)
      const movedReservations = (
        await tx
          .update(reservation)
          .set({ customerId: survivorId })
          .where(eq(reservation.customerId, mergedId))
          .returning({ id: reservation.id })
      ).map((r) => r.id);

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
        await tx
          .update(reservation)
          .set({ customerId: merge.mergedId })
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
