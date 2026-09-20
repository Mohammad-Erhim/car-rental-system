import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { computeEffective, expandActions, amountLimit } from '../../common/auth/access-graph';
import { AccessService } from '../../common/auth/access.service';
import { assertLocationAccess } from '../../common/auth/location-scope';
import { PasswordService } from '../../common/auth/password.service';
import { SessionService } from '../../common/auth/session.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import {
  account,
  permissionAction,
  role,
  staffProfile,
  staffRoleAssignment,
} from '../../database/schema/iam';
import { ConfigPublic } from '../config/config.public';
import { IamPublic } from '../iam/iam.public';
import { WorkflowPublic } from '../workflow/workflow.public';

@Injectable()
export class StaffService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly iam: IamPublic,
    private readonly sessions: SessionService,
    private readonly config: ConfigPublic,
    private readonly access: AccessService,
    private readonly workflows: WorkflowPublic,
  ) {}

  /**
   * Changing a person's roles, location scope or status is an action an owner can put a pipeline in
   * front of. It is security-critical: the person the change is *about* can never be the one who
   * approves it, whatever the workflow says.
   */
  onModuleInit(): void {
    type Input = {
      roleCodes?: string[];
      locationScope?: string[];
      status?: 'active' | 'suspended' | 'deactivated';
    };
    this.workflows.register<Input>({
      key: 'staff.access.change',
      subjectType: 'staff_access',
      label: 'Change a staff member’s access',
      description: 'Change the roles, location scope or status of a staff account.',
      variables: ['status', 'roles'],
      securityCritical: true,
      fingerprint: async (accountId, tx) => {
        const [p] = await tx
          .select({
            s: staffProfile.status,
            u: staffProfile.version,
            scope: staffProfile.locationScope,
          })
          .from(staffProfile)
          .where(eq(staffProfile.accountId, accountId))
          .limit(1);
        return p
          ? createHash('sha256')
              .update(JSON.stringify([p.s, p.u, p.scope]))
              .digest('hex')
          : null;
      },
      subjectOwner: async (accountId) => ({ accountId }),
      execute: async ({ subjectId, payload, instance, actors, audit }) => {
        const actor = this.workflows.asActor(actors, instance.organizationId, payload);
        await this.changeAccessNow(actor, subjectId, payload);
        audit({
          action: 'staff.access_change_approved',
          targetType: 'staff_access',
          targetId: subjectId,
          actor,
          after: { viaWorkflow: true },
        });
        return { changed: true };
      },
    });
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
        locationScope: staffProfile.locationScope,
        status: staffProfile.status,
        organizationId: staffProfile.organizationId,
      })
      .from(staffProfile)
      .innerJoin(account, eq(account.id, staffProfile.accountId))
      .where(
        actor.organizationId ? eq(staffProfile.organizationId, actor.organizationId) : sql`true`,
      )
      .orderBy(asc(account.displayName));
    // A location-scoped manager sees the staff who work at their branches (and themselves) — not
    // the organisation-wide accounts (administrators) or other branches' teams.
    const graph = await this.access.loadGraph({
      staffProfileIds: rows.map((r) => r.profileId),
      organizationId: actor.organizationId,
    });
    const withAccess = rows.map((r) => {
      const eff = computeEffective(graph, r.profileId);
      return {
        ...r,
        roleCodes: eff.roleCodes,
        // the largest refund this person may issue (null = unlimited / cannot refund)
        refundLimitMinor: eff.permissions.includes('payment.refund')
          ? amountLimit(eff.conditions, 'payment.refund')
          : null,
      };
    });
    const own = actor.locationScope?.length ? actor.locationScope : null;
    if (!own) return withAccess;
    return withAccess.filter(
      (r) => r.accountId === actor.accountId || r.locationScope.some((c) => own.includes(c)),
    );
  }

  async invite(
    actor: Actor,
    input: { email: string; fullName: string; roleCodes: string[]; locationScope?: string[] },
  ) {
    // A location-scoped staff.manage actor can only grant scope they themselves hold — otherwise
    // a branch manager could invite a new hire (or edit an existing one, in changeAccess below)
    // with visibility across every location in the org, escalating past their own access.
    assertGrantedScopeWithinActor(actor, input.locationScope);

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
    await this.db.transaction(async (tx) => {
      const [profile] = await tx
        .insert(staffProfile)
        .values({
          accountId,
          organizationId: org,
          locationScope: input.locationScope ?? [],
          status: 'invited',
          invitedAt: sql`now()`,
          createdBy: actor.accountId,
        })
        .onConflictDoUpdate({
          target: staffProfile.accountId,
          set: { locationScope: input.locationScope ?? [], updatedAt: sql`now()` },
        })
        .returning({ id: staffProfile.id });
      // a re-invite (resend) can change roles before the invitee ever accepts
      await this.setPermanentRoles(tx, actor, profile!.id, org, input.roleCodes);
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
    const [target] = await this.db
      .select({ id: staffProfile.id })
      .from(staffProfile)
      .where(eq(staffProfile.accountId, accountId))
      .limit(1);
    if (!target) throw AppError.notFound('staff member');
    return this.workflows.govern(
      {
        actionKey: 'staff.access.change',
        subjectId: accountId,
        subjectLabel: `Access change for ${(await this.db.select({ n: account.displayName }).from(account).where(eq(account.id, accountId)).limit(1))[0]?.n ?? accountId}`,
        payload: input,
        context: { status: input.status ?? null, roles: input.roleCodes ?? null },
        actor,
      },
      () => this.changeAccessNow(actor, accountId, input),
    );
  }

  private async changeAccessNow(
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
    const graph = await this.access.loadGraph({ organizationId: profile.organizationId });
    const effBefore = computeEffective(graph, profile.id);
    const targetIsActiveAdmin =
      profile.status === 'active' && effBefore.roleCodes.includes('administrator');
    const losesAdminRole = !!input.roleCodes && !input.roleCodes.includes('administrator');
    const losesActiveStatus = input.status === 'suspended' || input.status === 'deactivated';

    if (targetIsActiveAdmin && (losesAdminRole || losesActiveStatus)) {
      const active = await this.db
        .select({ id: staffProfile.id })
        .from(staffProfile)
        .where(
          and(
            eq(staffProfile.organizationId, profile.organizationId),
            eq(staffProfile.status, 'active'),
          ),
        );
      const admins = active.filter((p) =>
        computeEffective(graph, p.id).roleCodes.includes('administrator'),
      );
      if (admins.length <= 1) {
        throw new AppError('business_rule_violation', {
          title:
            "This account is the organization's only active administrator — it can't be suspended, deactivated, or lose the administrator role.",
          params: { reason: 'last_admin' },
        });
      }
    }
    assertGrantedScopeWithinActor(actor, input.locationScope);

    const before = {
      roleCodes: effBefore.roleCodes,
      locationScope: profile.locationScope,
      status: profile.status,
    };
    await this.db.transaction(async (tx) => {
      if (input.roleCodes) {
        await this.setPermanentRoles(
          tx,
          actor,
          profile.id,
          profile.organizationId,
          input.roleCodes,
        );
      }
      await tx
        .update(staffProfile)
        .set({
          locationScope: input.locationScope ?? profile.locationScope,
          status: input.status ?? profile.status,
          activatedAt:
            input.status === 'active' && !profile.activatedAt ? sql`now()` : profile.activatedAt,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(eq(staffProfile.id, profile.id));
    });

    if (input.status === 'suspended' || input.status === 'deactivated') {
      await this.db
        .update(account)
        .set({
          status: input.status === 'suspended' ? 'suspended' : 'closed',
          updatedAt: sql`now()`,
        })
        .where(eq(account.id, accountId));
      // ActorService already re-checks status on every request, so access is cut immediately
      // regardless — this closes the hygiene gap where a revoked staffer's sessions kept
      // listing as "active" (sessions.listForAccount) until they happened to expire naturally,
      // matching the same immediate-revocation behavior changePassword/completeRecovery already
      // have for a customer account.
      await this.sessions.revokeAllForAccount(
        accountId,
        input.status === 'suspended' ? 'staff_suspended' : 'staff_deactivated',
      );
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

  /**
   * Make `codes` the person's permanent roles (assignments with no end date); time-bound ones are
   * left alone. Every code must be an existing, non-archived role visible to the organisation, and
   * the caller must hold everything a newly granted role grants (no privilege escalation).
   */
  private async setPermanentRoles(
    tx: Pick<Database, 'select' | 'insert' | 'delete'>,
    actor: Actor,
    staffProfileId: string,
    organizationId: string,
    codes: string[],
  ): Promise<void> {
    const wanted = [...new Set(codes)];
    const roles = wanted.length
      ? await tx
          .select()
          .from(role)
          .where(
            and(
              inArray(role.code, wanted),
              isNull(role.archivedAt),
              or(isNull(role.organizationId), eq(role.organizationId, organizationId)),
            ),
          )
          .orderBy(sql`${role.organizationId} nulls last`)
      : [];
    const byCode = new Map<string, (typeof roles)[number]>();
    for (const r of roles) if (!byCode.has(r.code)) byCode.set(r.code, r);
    for (const rc of wanted) {
      if (!byCode.has(rc)) {
        throw new AppError('validation_failed', {
          title: `Unknown role: ${rc}`,
          fieldErrors: [{ path: 'roleCodes', code: 'unknown_role' }],
        });
      }
    }
    if (wanted.includes('administrator') && !actor.roleCodes.includes('administrator')) {
      throw new AppError('forbidden', {
        title: 'Only an administrator can grant the administrator role',
      });
    }
    const current = await tx
      .select({ id: staffRoleAssignment.id, roleId: staffRoleAssignment.roleId })
      .from(staffRoleAssignment)
      .where(
        and(
          eq(staffRoleAssignment.staffProfileId, staffProfileId),
          isNull(staffRoleAssignment.validUntil),
        ),
      );
    const haveRoleIds = new Set(current.map((c) => c.roleId));
    const wantIds = new Set([...byCode.values()].map((r) => r.id));
    const catalogue = (await tx.select({ code: permissionAction.code }).from(permissionAction)).map(
      (r) => r.code,
    );
    const mine = new Set(actor.permissions);
    for (const r of byCode.values()) {
      if (haveRoleIds.has(r.id)) continue;
      const missing = expandActions(r.permissionActions, catalogue).filter((a) => !mine.has(a));
      if (missing.length) {
        throw new AppError('forbidden', {
          title: `You can only grant roles whose permissions you hold yourself (missing: ${missing.slice(0, 5).join(', ')})`,
          params: { reason: 'privilege_escalation', missing: missing.join(',') },
        });
      }
    }
    const drop = current.filter((c) => !wantIds.has(c.roleId)).map((c) => c.id);
    if (drop.length)
      await tx.delete(staffRoleAssignment).where(inArray(staffRoleAssignment.id, drop));
    for (const r of byCode.values()) {
      if (haveRoleIds.has(r.id)) continue;
      await tx.insert(staffRoleAssignment).values({
        staffProfileId,
        roleId: r.id,
        grantedBy: actor.accountId,
        reason: 'staff access',
      });
    }
  }

  /** Delegates to `ConfigPublic.defaultOrganization()` (deterministically ordered by
   *  `createdAt`) rather than repeating the raw, unordered `organization` query — see
   *  `config.public.ts`. */
  private async defaultOrgId(): Promise<string> {
    const org = await this.config.defaultOrganization();
    if (!org) throw new AppError('policy_not_configured', { title: 'No organization configured' });
    return org.id;
  }
}

/** An org-wide actor (empty `locationScope`) may grant any scope, including org-wide. A
 *  location-scoped actor may only grant a subset of their own locations — granting a location
 *  outside their own scope would let them create a staffer with more reach than themselves. */
function assertGrantedScopeWithinActor(actor: Actor, grantedScope?: string[]): void {
  const actorScope = actor.locationScope ?? [];
  if (!actorScope.length) return; // org-wide actor
  for (const code of grantedScope ?? []) {
    assertLocationAccess(actor, code);
  }
}

/** CSPRNG-backed — this is live credential material (the invitee's temp password), not a
 *  cosmetic id, so `Math.random()` is not acceptable here. */
function cryptoRandom(): string {
  return randomBytes(24).toString('base64url');
}
