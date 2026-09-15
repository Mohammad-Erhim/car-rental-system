import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { customer, driver, privacyRequest } from '../../database/schema/customer';

import { AccountRepo } from './account.repo';
import { VerificationService } from './verification.service';

@Injectable()
export class ProfileService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly accounts: AccountRepo,
    private readonly audit: AuditService,
    private readonly verification: VerificationService,
  ) {}

  async getProfile(actor: Actor) {
    const acc = await this.accounts.findById(actor.accountId);
    if (!acc) throw new AppError('resource_not_found');
    const [cust] = await this.db
      .select()
      .from(customer)
      .where(eq(customer.accountId, actor.accountId))
      .limit(1);
    return {
      accountId: acc.id,
      fullName: cust?.fullName ?? acc.displayName,
      email: acc.email,
      emailVerified: !!acc.emailVerifiedAt,
      phone: acc.phone ?? null,
      phoneVerified: !!acc.phoneVerifiedAt,
      localeCode: acc.localeCode,
      timezone: acc.timezone ?? cust?.timezone ?? null,
      address: cust?.address ?? {},
      communicationPrefs: cust?.communicationPrefs ?? {},
      version: cust?.version ?? acc.version,
    };
  }

  async updateProfile(
    actor: Actor,
    patch: {
      fullName?: string;
      localeCode?: string;
      timezone?: string;
      address?: Record<string, string>;
      communicationPrefs?: Record<string, boolean>;
    },
    expectedVersion?: number,
  ) {
    const [cust] = await this.db
      .select()
      .from(customer)
      .where(eq(customer.accountId, actor.accountId))
      .limit(1);
    if (!cust) throw new AppError('resource_not_found', { title: 'Customer profile not found' });
    if (expectedVersion !== undefined && expectedVersion !== cust.version) {
      throw AppError.conflict(cust.version);
    }

    const before = {
      fullName: cust.fullName,
      localeCode: cust.localeCode,
      communicationPrefs: cust.communicationPrefs,
    };

    // guard the UPDATE itself on the loaded version so two concurrent saves can't both win
    // (the earlier compare above is TOCTOU on its own — this is the atomic check)
    const versionGuard =
      expectedVersion !== undefined
        ? and(eq(customer.id, cust.id), eq(customer.version, expectedVersion))
        : eq(customer.id, cust.id);

    const [updated] = await this.db
      .update(customer)
      .set({
        fullName: patch.fullName ?? cust.fullName,
        localeCode: patch.localeCode ?? cust.localeCode,
        timezone: patch.timezone ?? cust.timezone,
        address: patch.address ?? cust.address,
        communicationPrefs: { ...cust.communicationPrefs, ...(patch.communicationPrefs ?? {}) },
        version: sql`${customer.version} + 1`,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(versionGuard)
      .returning();

    if (!updated) {
      const [current] = await this.db
        .select({ version: customer.version })
        .from(customer)
        .where(eq(customer.id, cust.id))
        .limit(1);
      throw AppError.conflict(current?.version ?? cust.version);
    }

    if (patch.localeCode || patch.fullName) {
      await this.accounts.update(actor.accountId, {
        displayName: patch.fullName ?? undefined,
        localeCode: patch.localeCode ?? undefined,
      });
    }

    await this.audit.record({
      action: 'iam.profile.updated',
      targetType: 'customer',
      targetId: cust.id,
      actor,
      before,
      after: { ...before, ...patch },
    });

    return this.getProfile(actor);
  }

  // -------------------------------------------------------------- saved drivers

  async listDrivers(actor: Actor) {
    const [cust] = await this.db
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.accountId, actor.accountId))
      .limit(1);
    if (!cust) return [];
    return this.db
      .select()
      .from(driver)
      .where(and(eq(driver.customerId, cust.id), eq(driver.isSavedForReuse, true)));
  }

  async addDriver(actor: Actor, input: Record<string, unknown>) {
    const [cust] = await this.db
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.accountId, actor.accountId))
      .limit(1);
    if (!cust) throw new AppError('resource_not_found');
    const [row] = await this.db
      .insert(driver)
      .values({
        customerId: cust.id,
        role: (input.role as string) ?? 'additional',
        fullName: String(input.fullName ?? ''),
        dateOfBirth: (input.dateOfBirth as string) ?? null,
        email: (input.email as string) ?? null,
        phone: (input.phone as string) ?? null,
        licenceNumber: (input.licenceNumber as string) ?? null,
        licenceCountry: (input.licenceCountry as string) ?? null,
        licenceType: (input.licenceType as string) ?? null,
        licenceExpiresOn: (input.licenceExpiresOn as string) ?? null,
        createdBy: actor.accountId,
      })
      .returning();
    await this.audit.record({
      action: 'iam.driver.added',
      targetType: 'driver',
      targetId: row!.id,
      actor,
      after: { fullName: row!.fullName, role: row!.role },
    });
    return row;
  }

  async removeDriver(actor: Actor, driverId: string) {
    const [cust] = await this.db
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.accountId, actor.accountId))
      .limit(1);
    if (!cust) throw new AppError('resource_not_found');
    const [row] = await this.db
      .select()
      .from(driver)
      .where(and(eq(driver.id, driverId), eq(driver.customerId, cust.id)))
      .limit(1);
    if (!row) throw AppError.notFound('driver');
    await this.db
      .update(driver)
      .set({ isSavedForReuse: false, updatedAt: sql`now()`, updatedBy: actor.accountId })
      .where(eq(driver.id, driverId));
    await this.audit.record({
      action: 'iam.driver.removed_from_reuse',
      targetType: 'driver',
      targetId: driverId,
      actor,
    });
  }

  // ------------------------------------------------------- data access / closure

  async listDataRequests(actor: Actor) {
    return this.db
      .select()
      .from(privacyRequest)
      .where(eq(privacyRequest.accountId, actor.accountId))
      .orderBy(sql`${privacyRequest.createdAt} desc`);
  }

  async createDataRequest(
    actor: Actor,
    kind: 'access' | 'correction' | 'closure',
    detail?: string,
  ) {
    const blockers: Array<{ code: string; detail: string }> = [];
    // Closure blockers (FR-IAM-008): active rentals / unpaid balance / disputes / retention.
    // Rentals/payments land in later stages; the structure + a retention note are modelled now.
    if (kind === 'closure') {
      blockers.push({
        code: 'retention_period',
        detail: 'Some records must be retained for a legally required period after closure.',
      });
    }
    const [row] = await this.db
      .insert(privacyRequest)
      .values({
        accountId: actor.accountId,
        kind,
        detail: detail ?? null,
        status: blockers.length && kind === 'closure' ? 'blocked' : 'received',
        blockers,
        createdBy: actor.accountId,
      })
      .returning();
    await this.audit.record({
      action: `iam.data_request.${kind}`,
      targetType: 'privacy_request',
      targetId: row!.id,
      actor,
      after: { kind, status: row!.status },
    });
    return row;
  }

  async cancelDataRequest(actor: Actor, id: string) {
    const [row] = await this.db
      .select()
      .from(privacyRequest)
      .where(and(eq(privacyRequest.id, id), eq(privacyRequest.accountId, actor.accountId)))
      .limit(1);
    if (!row) throw AppError.notFound('request');
    if (['completed', 'rejected', 'cancelled'].includes(row.status)) {
      throw new AppError('business_rule_violation', { title: 'This request is already finalised' });
    }
    await this.db
      .update(privacyRequest)
      .set({ status: 'cancelled', updatedAt: sql`now()` })
      .where(eq(privacyRequest.id, id));
    return { ...row, status: 'cancelled' };
  }
}
