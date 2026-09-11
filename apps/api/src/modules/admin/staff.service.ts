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
        approvalLimitMinor: approvalLimitFor(input.roleCodes),
      })
      .onConflictDoUpdate({
        target: staffProfile.accountId,
        set: {
          roleCodes: input.roleCodes,
          locationScope: input.locationScope ?? [],
          // a re-invite (resend) can change roles before the invitee ever accepts — keep the
          // approval limit in sync the same way changeAccess does, or a role bump/cut made this
          // way silently doesn't take effect.
          approvalLimitMinor: approvalLimitFor(input.roleCodes),
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

    // Guards the org against ending up with zero usable administrator access — checked against
    // the *target's* current state, not who the actor is, so it covers every route to the same
    // outcome: an admin demoting themselves, an admin suspending/deactivating themselves (locks
    // the account exactly as effectively as losing the role does), and a different staff.manage
    // actor (e.g. a 'manager', who has every permission action but isn't personally an
    // 'administrator') suspending, deactivating, or role-stripping the org's only administrator.
    const targetIsActiveAdmin =
      profile.status === 'active' && profile.roleCodes.includes('administrator');
    const losesAdminRole = !!input.roleCodes && !input.roleCodes.includes('administrator');
    const losesActiveStatus = input.status === 'suspended' || input.status === 'deactivated';

    if (targetIsActiveAdmin && (losesAdminRole || losesActiveStatus)) {
      const admins = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(staffProfile)
        .where(
          and(eq(staffProfile.status, 'active'), sql`${staffProfile.roleCodes} ? 'administrator'`),
        );
      if ((admins[0]?.n ?? 0) <= 1) {
        throw new AppError('business_rule_violation', {
          title:
            "This account is the organization's only active administrator — it can't be suspended, deactivated, or lose the administrator role.",
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
        // a role change (promotion or demotion) has to move the approval limit with it — invite()
        // sets this from the initial roles, but changeAccess previously never touched it again, so
        // promoting someone to manager/administrator silently left them at the lower limit (and
        // demoting an ex-admin left them with the higher one — a privilege-retention gap).
        approvalLimitMinor: input.roleCodes
          ? approvalLimitFor(input.roleCodes)
          : profile.approvalLimitMinor,
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
      // matches `invite()`'s targetType/targetId (the account, not the internal staffProfile
      // row) so a "view this staff member's history" audit-page filter (targetType=account,
      // targetId=<accountId>) finds every event for them, not just the ones from one of the two
      // write paths — before this fix, invite() and changeAccess() disagreed on both fields.
      targetType: 'account',
      targetId: accountId,
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

/** The staff-profile approval limit is derived purely from role codes (DEC/FR-ADM-009's simple
 *  tiering: manager/administrator get the higher limit, everyone else the base one) — shared by
 *  every write path that can set `roleCodes` so a later role change actually takes effect. */
function approvalLimitFor(roleCodes: string[]): number {
  return roleCodes.some((r) => ['manager', 'administrator'].includes(r)) ? 500_000 : 20_000;
}
