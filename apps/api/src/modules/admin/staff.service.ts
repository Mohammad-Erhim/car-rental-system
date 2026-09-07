import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { PasswordService } from '../../common/auth/password.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { account, permissionAction, role, staffProfile } from '../../database/schema/iam';
import { organization } from '../../database/schema/org';
import { IamPublic } from '../iam/iam.public';

@Injectable()
export class StaffService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly iam: IamPublic,
  ) {}

  async listRoles() {
    const roles = await this.db.select().from(role).orderBy(asc(role.name));
    const actions = await this.db
      .select()
      .from(permissionAction)
      .orderBy(asc(permissionAction.group));
    return { roles, permissionActions: actions };
  }

  async listStaff(actor: Actor) {
    const rows = await this.db
      .select({
        accountId: account.id,
        displayName: account.displayName,
        email: account.email,
        accountStatus: account.status,
        lastSignInAt: account.lastSignInAt,
        profileId: staffProfile.id,
        roleCodes: staffProfile.roleCodes,
        locationScope: staffProfile.locationScope,
        status: staffProfile.status,
        approvalLimitMinor: staffProfile.approvalLimitMinor,
        organizationId: staffProfile.organizationId,
      })
      .from(staffProfile)
      .innerJoin(account, eq(account.id, staffProfile.accountId))
      .where(
        actor.organizationId ? eq(staffProfile.organizationId, actor.organizationId) : sql`true`,
      )
      .orderBy(asc(account.displayName));
    return rows;
  }

  async invite(
    actor: Actor,
    input: { email: string; fullName: string; roleCodes: string[]; locationScope?: string[] },
  ) {
    // validate roles exist
    const known = new Set(
      (await this.db.select({ code: role.code }).from(role)).map((r) => r.code),
    );
    for (const rc of input.roleCodes) {
      if (!known.has(rc)) {
        throw new AppError('validation_failed', {
          title: `Unknown role: ${rc}`,
          fieldErrors: [{ path: 'roleCodes', code: 'unknown_role' }],
        });
      }
    }
    // prevent granting administrator unless the actor is an administrator
    if (input.roleCodes.includes('administrator') && !actor.roleCodes.includes('administrator')) {
      throw new AppError('forbidden', {
        title: 'Only an administrator can grant the administrator role',
      });
    }

    const emailNormalized = input.email.trim().toLowerCase();
    const [existing] = await this.db
      .select()
      .from(account)
      .where(eq(account.emailNormalized, emailNormalized))
      .limit(1);

    let accountId: string;
    if (existing) {
      if (existing.kind !== 'staff') {
        throw new AppError('state_conflict', { title: 'That email is already a customer account' });
      }
      accountId = existing.id;
    } else {
      // temp password; the invitee sets their own via recovery flow
      const tempHash = await this.passwords.hash(cryptoRandom());
      const [acc] = await this.db
        .insert(account)
        .values({
          kind: 'staff',
          email: input.email.trim(),
          emailNormalized,
          passwordHash: tempHash,
          status: 'pending',
          displayName: input.fullName.trim(),
          localeCode: 'en',
        })
        .returning();
      accountId = acc!.id;
    }

    const org = actor.organizationId ?? (await this.defaultOrgId());
    await this.db
      .insert(staffProfile)
      .values({
        accountId,
        organizationId: org,
        roleCodes: input.roleCodes,
        locationScope: input.locationScope ?? [],
        status: 'invited',
        invitedAt: sql`now()`,
        createdBy: actor.accountId,
        approvalLimitMinor: input.roleCodes.some((r) => ['manager', 'administrator'].includes(r))
          ? 500_000
          : 20_000,
      })
      .onConflictDoUpdate({
        target: staffProfile.accountId,
        set: {
          roleCodes: input.roleCodes,
          locationScope: input.locationScope ?? [],
          updatedAt: sql`now()`,
        },
      });

    await this.iam.sendInviteChallenge({
      accountId,
      email: input.email.trim(),
      name: input.fullName.trim(),
    });

    await this.audit.record({
      action: 'admin.staff.invited',
      targetType: 'account',
      targetId: accountId,
      actor,
      after: { roleCodes: input.roleCodes, locationScope: input.locationScope ?? [] },
      reason: 'staff invitation',
    });

    return { accountId, status: 'invited' as const };
  }

  async changeAccess(
    actor: Actor,
    accountId: string,
    input: {
      roleCodes?: string[];
      locationScope?: string[];
      status?: 'active' | 'suspended' | 'deactivated';
    },
  ) {
    const [profile] = await this.db
      .select()
      .from(staffProfile)
      .where(eq(staffProfile.accountId, accountId))
      .limit(1);
    if (!profile) throw AppError.notFound('staff member');

    if (
      accountId === actor.accountId &&
      input.roleCodes &&
      !input.roleCodes.includes('administrator') &&
      actor.roleCodes.includes('administrator')
    ) {
      // prevent self-removal of the last admin path
      const admins = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(staffProfile)
        .where(
          and(eq(staffProfile.status, 'active'), sql`${staffProfile.roleCodes} ? 'administrator'`),
        );
      if ((admins[0]?.n ?? 0) <= 1) {
        throw new AppError('business_rule_violation', {
          title: 'You cannot remove your own last administrator access',
          params: { reason: 'last_admin' },
        });
      }
    }
    if (input.roleCodes?.includes('administrator') && !actor.roleCodes.includes('administrator')) {
      throw new AppError('forbidden', {
        title: 'Only an administrator can grant the administrator role',
      });
    }

    const before = {
      roleCodes: profile.roleCodes,
      locationScope: profile.locationScope,
      status: profile.status,
    };
    await this.db
      .update(staffProfile)
      .set({
        roleCodes: input.roleCodes ?? profile.roleCodes,
        locationScope: input.locationScope ?? profile.locationScope,
        status: input.status ?? profile.status,
        activatedAt:
          input.status === 'active' && !profile.activatedAt ? sql`now()` : profile.activatedAt,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(eq(staffProfile.id, profile.id));

    if (input.status === 'suspended' || input.status === 'deactivated') {
      await this.db
        .update(account)
        .set({
          status: input.status === 'suspended' ? 'suspended' : 'closed',
          updatedAt: sql`now()`,
        })
        .where(eq(account.id, accountId));
    } else if (input.status === 'active') {
      await this.db
        .update(account)
        .set({ status: 'active', updatedAt: sql`now()` })
        .where(eq(account.id, accountId));
    }

    await this.audit.record({
      action: 'admin.staff.access_changed',
      targetType: 'staff_profile',
      targetId: profile.id,
      actor,
      before,
      after: { ...before, ...input },
      reason: 'staff access change',
    });

    return { accountId, ...input };
  }

  private async defaultOrgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('policy_not_configured', { title: 'No organization configured' });
    return org.id;
  }
}

function cryptoRandom(): string {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}
