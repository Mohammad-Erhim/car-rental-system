import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import {
  WILDCARD,
  computeEffective,
  expandActions,
  whoCan,
  type ActionCondition,
  type ConditionMap,
} from '../../common/auth/access-graph';
import { AccessService } from '../../common/auth/access.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import {
  account,
  permissionAction,
  role,
  staffGroup,
  staffGroupMember,
  staffPermissionOverride,
  staffProfile,
  staffRoleAssignment,
} from '../../database/schema/iam';
import { auditEvent } from '../../database/schema/platform';
import { ConfigPublic } from '../config/config.public';

/** Actions whose grant can carry an amount limit. */
export const CONDITIONAL_ACTIONS: readonly string[] = ['payment.refund'];

const CODE = /^[a-z][a-z0-9_]{1,39}$/;

type Exec = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

/**
 * Access administration — roles, the permission matrix, per-person role assignments and overrides,
 * teams. Every write:
 *  - is validated against the live permission catalogue (a typo is a 422, never a silent no-op);
 *  - cannot grant anything the caller doesn't hold themselves (no privilege escalation);
 *  - can't change the caller's own access (no self-escalation, no self-lockout);
 *  - can't leave the organisation without anyone able to manage access;
 *  - is audited with before/after.
 * System roles are locked (clone to customise); custom roles are fully editable.
 */
@Injectable()
export class AccessAdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly config: ConfigPublic,
  ) {}

  // ------------------------------------------------------------------ helpers

  private async orgId(actor: Actor): Promise<string> {
    if (actor.organizationId) return actor.organizationId;
    const org = await this.config.defaultOrganization();
    if (!org) throw new AppError('policy_not_configured', { title: 'No organization configured' });
    return org.id;
  }

  private async catalogueCodes(exec: Exec = this.db): Promise<string[]> {
    return (await exec.select({ code: permissionAction.code }).from(permissionAction)).map(
      (r) => r.code,
    );
  }

  /** The role by code, preferring the organisation's own over a system role of the same code. */
  private async findRole(orgId: string, code: string, exec: Exec = this.db) {
    const rows = await exec
      .select()
      .from(role)
      .where(
        and(eq(role.code, code), or(isNull(role.organizationId), eq(role.organizationId, orgId))),
      )
      .orderBy(sql`${role.organizationId} nulls last`)
      .limit(1);
    return rows[0] ?? null;
  }

  private async mustFindRole(orgId: string, code: string, exec: Exec = this.db) {
    const r = await this.findRole(orgId, code, exec);
    if (!r) throw AppError.notFound(`role ${code}`);
    return r;
  }

  private validateActions(
    actions: string[],
    catalogue: string[],
    opts: { allowWildcard: boolean },
  ): void {
    const known = new Set(catalogue);
    const issues: Array<{ path: string; code: string; params?: Record<string, string> }> = [];
    actions.forEach((a, i) => {
      if (a === WILDCARD) {
        if (!opts.allowWildcard)
          issues.push({ path: `permissionActions.${i}`, code: 'wildcard_not_allowed' });
      } else if (!known.has(a)) {
        issues.push({
          path: `permissionActions.${i}`,
          code: 'unknown_action',
          params: { action: a },
        });
      }
    });
    if (issues.length)
      throw AppError.validation(issues, 'Unknown or not-allowed permission action');
  }

  private validateConditions(conditions: ConditionMap, actions: string[]): void {
    const issues: Array<{ path: string; code: string }> = [];
    for (const [action, c] of Object.entries(conditions)) {
      if (!CONDITIONAL_ACTIONS.includes(action))
        issues.push({ path: `conditions.${action}`, code: 'not_supported' });
      else if (!actions.includes(action) && !actions.includes(WILDCARD)) {
        issues.push({ path: `conditions.${action}`, code: 'action_not_granted' });
      } else if (
        c.amountMinorMax !== undefined &&
        (!Number.isInteger(c.amountMinorMax) || c.amountMinorMax < 0)
      ) {
        issues.push({ path: `conditions.${action}.amountMinorMax`, code: 'invalid' });
      }
    }
    if (issues.length) throw AppError.validation(issues, 'Invalid condition');
  }

  /** The caller may hand out only what they hold — otherwise a `staff.manage` holder could mint power. */
  private assertCanGrant(actor: Actor, actions: string[], catalogue: string[]): void {
    const mine = new Set(actor.permissions);
    const missing = expandActions(actions, catalogue).filter((a) => !mine.has(a));
    if (missing.length) {
      throw new AppError('forbidden', {
        title: `You can only grant permissions you hold yourself (missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''})`,
        params: { reason: 'privilege_escalation', missing: missing.join(',') },
      });
    }
  }

  private assertNotSelf(actor: Actor, accountId: string): void {
    if (actor.accountId === accountId) {
      throw new AppError('forbidden', {
        title: "You can't change your own access — ask another administrator",
        params: { reason: 'self_change' },
      });
    }
  }

  /** After a change, at least one active staff member must still be able to manage access. */
  private async assertAccessManagersRemain(orgId: string, exec: Exec): Promise<void> {
    if ((await this.access.accessManagers(orgId, exec)).length === 0) {
      throw new AppError('business_rule_violation', {
        title: 'This change would leave nobody able to manage access',
        params: { reason: 'last_access_manager' },
      });
    }
  }

  private conditionsOf(r: typeof role.$inferSelect): ConditionMap {
    return r.conditions ?? {};
  }

  // -------------------------------------------------------------------- roles

  async listRoles(actor: Actor) {
    const orgId = await this.orgId(actor);
    const [roles, catalogue, assignments, profiles] = await Promise.all([
      this.db
        .select()
        .from(role)
        .where(or(isNull(role.organizationId), eq(role.organizationId, orgId)))
        .orderBy(asc(role.name)),
      this.db
        .select()
        .from(permissionAction)
        .orderBy(asc(permissionAction.group), asc(permissionAction.code)),
      this.db.select().from(staffRoleAssignment),
      this.db
        .select({ id: staffProfile.id })
        .from(staffProfile)
        .where(eq(staffProfile.organizationId, orgId)),
    ]);
    const inOrg = new Set(profiles.map((p) => p.id));
    const now = Date.now();
    const holders = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (!inOrg.has(a.staffProfileId)) continue;
      if (new Date(a.validFrom).getTime() > now) continue;
      if (a.validUntil && new Date(a.validUntil).getTime() <= now) continue;
      (holders.get(a.roleId) ?? holders.set(a.roleId, new Set()).get(a.roleId)!).add(
        a.staffProfileId,
      );
    }
    return {
      roles: roles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        locked: r.locked,
        archived: !!r.archivedAt,
        permissionActions: r.permissionActions,
        conditions: this.conditionsOf(r),
        holderCount: holders.get(r.id)?.size ?? 0,
        version: r.version,
      })),
      permissionActions: catalogue,
    };
  }

  async createRole(
    actor: Actor,
    input: {
      code: string;
      name: string;
      description?: string;
      permissionActions: string[];
      conditions?: ConditionMap;
    },
  ) {
    const orgId = await this.orgId(actor);
    if (!CODE.test(input.code)) {
      throw AppError.validation(
        [{ path: 'code', code: 'invalid_format' }],
        'Role code must be lowercase letters, digits and underscores',
      );
    }
    if (await this.findRole(orgId, input.code)) {
      throw new AppError('state_conflict', {
        title: `A role with the code "${input.code}" already exists`,
      });
    }
    const catalogue = await this.catalogueCodes();
    this.validateActions(input.permissionActions, catalogue, { allowWildcard: false });
    this.validateConditions(input.conditions ?? {}, input.permissionActions);
    this.assertCanGrant(actor, input.permissionActions, catalogue);
    const [row] = await this.db
      .insert(role)
      .values({
        organizationId: orgId,
        code: input.code,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        isSystem: false,
        locked: false,
        permissionActions: [...new Set(input.permissionActions)],
        conditions: input.conditions ?? {},
        createdBy: actor.accountId,
      })
      .returning();
    await this.audit.record({
      action: 'iam.role.created',
      targetType: 'role',
      targetId: row!.code,
      actor,
      after: { permissionActions: row!.permissionActions, conditions: row!.conditions },
    });
    return this.shapeRole(row!, 0);
  }

  async updateRole(
    actor: Actor,
    code: string,
    patch: {
      name?: string;
      description?: string | null;
      permissionActions?: string[];
      conditions?: ConditionMap;
    },
    expectedVersion?: number,
  ) {
    const orgId = await this.orgId(actor);
    return this.db.transaction(async (tx) => {
      const r = await this.mustFindRole(orgId, code, tx);
      if (r.locked) {
        throw new AppError('forbidden', {
          title: 'System roles are read-only — clone the role to customise it',
          params: { reason: 'role_locked' },
        });
      }
      if (expectedVersion !== undefined && expectedVersion !== r.version) {
        throw AppError.conflict(r.version, 'role');
      }
      const catalogue = await this.catalogueCodes(tx);
      const actions = patch.permissionActions
        ? [...new Set(patch.permissionActions)]
        : r.permissionActions;
      const conditions = patch.conditions ?? this.conditionsOf(r);
      if (patch.permissionActions)
        this.validateActions(actions, catalogue, { allowWildcard: false });
      this.validateConditions(conditions, actions);
      const added = actions.filter((a) => !r.permissionActions.includes(a));
      if (added.length) this.assertCanGrant(actor, added, catalogue);
      const [row] = await tx
        .update(role)
        .set({
          name: patch.name?.trim() ?? r.name,
          description:
            patch.description === undefined ? r.description : patch.description?.trim() || null,
          permissionActions: actions,
          conditions,
          version: r.version + 1,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(eq(role.id, r.id))
        .returning();
      await this.assertAccessManagersRemain(orgId, tx);
      await this.audit.record({
        action: 'iam.role.updated',
        targetType: 'role',
        targetId: r.code,
        actor,
        before: { name: r.name, permissionActions: r.permissionActions, conditions: r.conditions },
        after: {
          name: row!.name,
          permissionActions: row!.permissionActions,
          conditions: row!.conditions,
        },
      });
      return this.shapeRole(row!, await this.holderCount(row!.id, tx));
    });
  }

  async cloneRole(actor: Actor, code: string, input: { code: string; name: string }) {
    const orgId = await this.orgId(actor);
    const src = await this.mustFindRole(orgId, code);
    const catalogue = await this.catalogueCodes();
    const actions = expandActions(src.permissionActions, catalogue).filter((a) =>
      catalogue.includes(a),
    );
    // a clone is a copy of a role's powers: the caller must hold every one of them
    this.assertCanGrant(actor, actions, catalogue);
    return this.createRole(actor, {
      code: input.code,
      name: input.name,
      description: src.description ?? undefined,
      permissionActions: actions,
      conditions: this.conditionsOf(src),
    });
  }

  async setRoleArchived(actor: Actor, code: string, archived: boolean) {
    const orgId = await this.orgId(actor);
    return this.db.transaction(async (tx) => {
      const r = await this.mustFindRole(orgId, code, tx);
      if (r.locked) {
        throw new AppError('forbidden', {
          title: 'System roles cannot be archived',
          params: { reason: 'role_locked' },
        });
      }
      if (archived) {
        const holders = await this.holderCount(r.id, tx);
        if (holders > 0) {
          throw new AppError('business_rule_violation', {
            title: `${holders} ${holders === 1 ? 'person still holds' : 'people still hold'} this role — reassign them first`,
            params: { reason: 'role_in_use', holders },
          });
        }
      }
      const [row] = await tx
        .update(role)
        .set({
          archivedAt: archived ? sql`now()` : null,
          version: r.version + 1,
          updatedAt: sql`now()`,
        })
        .where(eq(role.id, r.id))
        .returning();
      await this.audit.record({
        action: archived ? 'iam.role.archived' : 'iam.role.restored',
        targetType: 'role',
        targetId: r.code,
        actor,
      });
      return this.shapeRole(row!, 0);
    });
  }

  private async holderCount(roleId: string, exec: Exec = this.db): Promise<number> {
    const now = new Date().toISOString();
    const rows = await exec
      .select({ id: staffRoleAssignment.staffProfileId })
      .from(staffRoleAssignment)
      .where(
        and(
          eq(staffRoleAssignment.roleId, roleId),
          sql`${staffRoleAssignment.validFrom} <= ${now}`,
          or(
            isNull(staffRoleAssignment.validUntil),
            sql`${staffRoleAssignment.validUntil} > ${now}`,
          ),
        ),
      );
    return new Set(rows.map((r) => r.id)).size;
  }

  private shapeRole(r: typeof role.$inferSelect, holderCount: number) {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      locked: r.locked,
      archived: !!r.archivedAt,
      permissionActions: r.permissionActions,
      conditions: this.conditionsOf(r),
      holderCount,
      version: r.version,
    };
  }

  // ------------------------------------------------------------------- matrix

  /**
   * Bulk change of the roles × permissions grid. `dryRun` returns exactly what would change and
   * how many people it touches — the review panel — without writing.
   */
  async applyMatrix(
    actor: Actor,
    input: {
      dryRun?: boolean;
      changes: Array<{ roleCode: string; add?: string[]; remove?: string[] }>;
    },
  ) {
    const orgId = await this.orgId(actor);
    const results: Array<{
      roleCode: string;
      added: string[];
      removed: string[];
      affectedStaff: number;
    }> = [];
    await this.db.transaction(async (tx) => {
      const catalogue = await this.catalogueCodes(tx);
      const seen = new Set<string>();
      for (const ch of input.changes) {
        if (seen.has(ch.roleCode)) {
          throw AppError.validation(
            [{ path: 'changes', code: 'duplicate_role' }],
            'A role appears twice',
          );
        }
        seen.add(ch.roleCode);
        const r = await this.mustFindRole(orgId, ch.roleCode, tx);
        if (r.locked) {
          throw new AppError('forbidden', {
            title: `"${r.name}" is a system role and is read-only — clone it to customise`,
            params: { reason: 'role_locked' },
          });
        }
        this.validateActions([...(ch.add ?? []), ...(ch.remove ?? [])], catalogue, {
          allowWildcard: false,
        });
        const added = (ch.add ?? []).filter((a) => !r.permissionActions.includes(a));
        const removed = (ch.remove ?? []).filter((a) => r.permissionActions.includes(a));
        if (added.length) this.assertCanGrant(actor, added, catalogue);
        const next = [...r.permissionActions.filter((a) => !removed.includes(a)), ...added];
        const nextConditions = Object.fromEntries(
          Object.entries(this.conditionsOf(r)).filter(([a]) => next.includes(a)),
        );
        results.push({
          roleCode: r.code,
          added,
          removed,
          affectedStaff: await this.holderCount(r.id, tx),
        });
        if (!input.dryRun && (added.length || removed.length)) {
          await tx
            .update(role)
            .set({
              permissionActions: next,
              conditions: nextConditions,
              version: r.version + 1,
              updatedAt: sql`now()`,
              updatedBy: actor.accountId,
            })
            .where(eq(role.id, r.id));
          await this.audit.record({
            action: 'iam.role.matrix_changed',
            targetType: 'role',
            targetId: r.code,
            actor,
            before: { permissionActions: r.permissionActions },
            after: { permissionActions: next, added, removed },
          });
        }
      }
      if (!input.dryRun) await this.assertAccessManagersRemain(orgId, tx);
    });
    return { applied: !input.dryRun, changes: results };
  }

  // ------------------------------------------------------------ people access

  private async profileByAccount(orgId: string, accountId: string, exec: Exec = this.db) {
    const [row] = await exec
      .select({
        profile: staffProfile,
        displayName: account.displayName,
        email: account.email,
        accountStatus: account.status,
      })
      .from(staffProfile)
      .innerJoin(account, eq(account.id, staffProfile.accountId))
      .where(and(eq(staffProfile.accountId, accountId), eq(staffProfile.organizationId, orgId)))
      .limit(1);
    if (!row) throw AppError.notFound('staff member');
    return row;
  }

  async staffAccess(actor: Actor, accountId: string) {
    const orgId = await this.orgId(actor);
    const { profile, displayName, email, accountStatus } = await this.profileByAccount(
      orgId,
      accountId,
    );
    const graph = await this.access.loadGraph({
      staffProfileIds: [profile.id],
      organizationId: orgId,
    });
    const eff = computeEffective(graph, profile.id);
    const roleById = new Map(graph.roles.map((r) => [r.id, r]));
    const now = Date.now();
    const assignments = graph.assignments
      .filter((a) => a.staffProfileId === profile.id)
      .map((a) => {
        const r = roleById.get(a.roleId);
        const started = new Date(a.validFrom).getTime() <= now;
        const ended = a.validUntil !== null && new Date(a.validUntil).getTime() <= now;
        return {
          id: a.id,
          roleCode: r?.code ?? '?',
          roleName: r?.name ?? '?',
          validFrom: a.validFrom,
          validUntil: a.validUntil,
          reason: a.reason ?? null,
          state: r?.archived ? 'archived' : ended ? 'expired' : started ? 'active' : 'scheduled',
        };
      });
    const overrides = graph.overrides
      .filter((o) => o.staffProfileId === profile.id)
      .map((o) => ({
        id: o.id,
        action: o.action,
        effect: o.effect,
        validUntil: o.validUntil,
        reason: o.reason ?? null,
        expired: o.validUntil !== null && new Date(o.validUntil).getTime() <= now,
      }));
    const memberships = await this.db
      .select({ code: staffGroup.code, name: staffGroup.name })
      .from(staffGroupMember)
      .innerJoin(staffGroup, eq(staffGroup.id, staffGroupMember.groupId))
      .where(and(eq(staffGroupMember.staffProfileId, profile.id), isNull(staffGroup.archivedAt)));
    return {
      staff: {
        accountId,
        displayName,
        email,
        status: profile.status,
        accountStatus,
        locationScope: profile.locationScope,
      },
      assignments,
      overrides,
      groups: memberships,
      effective: {
        roleCodes: eff.roleCodes,
        permissions: eff.permissions,
        denied: eff.denied,
        conditions: eff.conditions,
        sources: eff.sources,
      },
    };
  }

  async addAssignment(
    actor: Actor,
    accountId: string,
    input: { roleCode: string; validFrom?: string; validUntil?: string | null; reason?: string },
  ) {
    const orgId = await this.orgId(actor);
    this.assertNotSelf(actor, accountId);
    if (
      input.validUntil &&
      input.validFrom &&
      new Date(input.validUntil) <= new Date(input.validFrom)
    ) {
      throw AppError.validation(
        [{ path: 'validUntil', code: 'before_start' }],
        'The end must be after the start',
      );
    }
    if (input.validUntil && new Date(input.validUntil) <= new Date()) {
      throw AppError.validation(
        [{ path: 'validUntil', code: 'in_the_past' }],
        'The end must be in the future',
      );
    }
    await this.db.transaction(async (tx) => {
      const { profile } = await this.profileByAccount(orgId, accountId, tx);
      const r = await this.mustFindRole(orgId, input.roleCode, tx);
      if (r.archivedAt) {
        throw new AppError('business_rule_violation', {
          title: 'That role is archived',
          params: { reason: 'role_archived' },
        });
      }
      const catalogue = await this.catalogueCodes(tx);
      this.assertCanGrant(actor, r.permissionActions, catalogue);
      const [row] = await tx
        .insert(staffRoleAssignment)
        .values({
          staffProfileId: profile.id,
          roleId: r.id,
          validFrom: input.validFrom ?? sql`now()`,
          validUntil: input.validUntil ?? null,
          grantedBy: actor.accountId,
          reason: input.reason ?? null,
        })
        .returning();
      await this.audit.record({
        action: 'iam.access.role_assigned',
        targetType: 'account',
        targetId: accountId,
        actor,
        after: { roleCode: r.code, validFrom: row!.validFrom, validUntil: row!.validUntil },
        reason: input.reason,
      });
    });
    return this.staffAccess(actor, accountId);
  }

  async removeAssignment(actor: Actor, accountId: string, assignmentId: string) {
    const orgId = await this.orgId(actor);
    this.assertNotSelf(actor, accountId);
    await this.db.transaction(async (tx) => {
      const { profile } = await this.profileByAccount(orgId, accountId, tx);
      const [row] = await tx
        .select({ a: staffRoleAssignment, code: role.code })
        .from(staffRoleAssignment)
        .innerJoin(role, eq(role.id, staffRoleAssignment.roleId))
        .where(
          and(
            eq(staffRoleAssignment.id, assignmentId),
            eq(staffRoleAssignment.staffProfileId, profile.id),
          ),
        )
        .limit(1);
      if (!row) throw AppError.notFound('role assignment');
      await tx.delete(staffRoleAssignment).where(eq(staffRoleAssignment.id, assignmentId));
      await this.assertAccessManagersRemain(orgId, tx);
      await this.audit.record({
        action: 'iam.access.role_removed',
        targetType: 'account',
        targetId: accountId,
        actor,
        before: { roleCode: row.code },
      });
    });
    return this.staffAccess(actor, accountId);
  }

  async addOverride(
    actor: Actor,
    accountId: string,
    input: { action: string; effect: 'allow' | 'deny'; validUntil?: string | null; reason: string },
  ) {
    const orgId = await this.orgId(actor);
    this.assertNotSelf(actor, accountId);
    if (input.validUntil && new Date(input.validUntil) <= new Date()) {
      throw AppError.validation(
        [{ path: 'validUntil', code: 'in_the_past' }],
        'The end must be in the future',
      );
    }
    await this.db.transaction(async (tx) => {
      const { profile } = await this.profileByAccount(orgId, accountId, tx);
      const catalogue = await this.catalogueCodes(tx);
      if (!catalogue.includes(input.action)) {
        throw AppError.validation(
          [{ path: 'action', code: 'unknown_action' }],
          'Unknown permission action',
        );
      }
      if (input.effect === 'allow') this.assertCanGrant(actor, [input.action], catalogue);
      await tx
        .insert(staffPermissionOverride)
        .values({
          staffProfileId: profile.id,
          action: input.action,
          effect: input.effect,
          validUntil: input.validUntil ?? null,
          reason: input.reason,
          grantedBy: actor.accountId,
        })
        .onConflictDoUpdate({
          target: [staffPermissionOverride.staffProfileId, staffPermissionOverride.action],
          set: {
            effect: input.effect,
            validUntil: input.validUntil ?? null,
            reason: input.reason,
            grantedBy: actor.accountId,
            updatedAt: sql`now()`,
          },
        });
      await this.assertAccessManagersRemain(orgId, tx);
      await this.audit.record({
        action: 'iam.access.override_set',
        targetType: 'account',
        targetId: accountId,
        actor,
        after: { action: input.action, effect: input.effect, validUntil: input.validUntil ?? null },
        reason: input.reason,
      });
    });
    return this.staffAccess(actor, accountId);
  }

  async removeOverride(actor: Actor, accountId: string, overrideId: string) {
    const orgId = await this.orgId(actor);
    this.assertNotSelf(actor, accountId);
    await this.db.transaction(async (tx) => {
      const { profile } = await this.profileByAccount(orgId, accountId, tx);
      const [row] = await tx
        .select()
        .from(staffPermissionOverride)
        .where(
          and(
            eq(staffPermissionOverride.id, overrideId),
            eq(staffPermissionOverride.staffProfileId, profile.id),
          ),
        )
        .limit(1);
      if (!row) throw AppError.notFound('override');
      await tx.delete(staffPermissionOverride).where(eq(staffPermissionOverride.id, overrideId));
      await this.assertAccessManagersRemain(orgId, tx);
      await this.audit.record({
        action: 'iam.access.override_removed',
        targetType: 'account',
        targetId: accountId,
        actor,
        before: { action: row.action, effect: row.effect },
      });
    });
    return this.staffAccess(actor, accountId);
  }

  // ------------------------------------------------------------ matrix / lookup

  /** Every staff member × every action, with where each right comes from. */
  async usersMatrix(actor: Actor) {
    const orgId = await this.orgId(actor);
    const [profiles, catalogue] = await Promise.all([
      this.db
        .select({
          profileId: staffProfile.id,
          accountId: staffProfile.accountId,
          status: staffProfile.status,
          displayName: account.displayName,
          email: account.email,
        })
        .from(staffProfile)
        .innerJoin(account, eq(account.id, staffProfile.accountId))
        .where(eq(staffProfile.organizationId, orgId))
        .orderBy(asc(account.displayName)),
      this.db
        .select()
        .from(permissionAction)
        .orderBy(asc(permissionAction.group), asc(permissionAction.code)),
    ]);
    const graph = await this.access.loadGraph({
      staffProfileIds: profiles.map((p) => p.profileId),
      organizationId: orgId,
    });
    return {
      permissionActions: catalogue,
      staff: profiles.map((p) => {
        const eff = computeEffective(graph, p.profileId);
        return {
          accountId: p.accountId,
          displayName: p.displayName,
          email: p.email,
          status: p.status,
          roleCodes: eff.roleCodes,
          permissions: eff.permissions,
          denied: eff.denied,
          conditions: eff.conditions,
          // the source labels only (roles by name / "override"), enough to render a cell tooltip
          via: Object.fromEntries(
            Object.entries(eff.sources).map(([action, list]) => [
              action,
              list.map((s) => (s.kind === 'role' ? s.name : `override:${s.effect}`)),
            ]),
          ),
        };
      }),
    };
  }

  async whoCan(actor: Actor, action: string) {
    const orgId = await this.orgId(actor);
    const catalogue = await this.catalogueCodes();
    if (!catalogue.includes(action)) {
      throw AppError.validation(
        [{ path: 'action', code: 'unknown_action' }],
        'Unknown permission action',
      );
    }
    const profiles = await this.db
      .select({
        profileId: staffProfile.id,
        accountId: staffProfile.accountId,
        status: staffProfile.status,
        displayName: account.displayName,
        email: account.email,
      })
      .from(staffProfile)
      .innerJoin(account, eq(account.id, staffProfile.accountId))
      .where(and(eq(staffProfile.organizationId, orgId), eq(staffProfile.status, 'active')));
    const graph = await this.access.loadGraph({
      staffProfileIds: profiles.map((p) => p.profileId),
      organizationId: orgId,
    });
    const hits = new Map(
      whoCan(
        graph,
        profiles.map((p) => p.profileId),
        action,
      ).map((h) => [h.staffProfileId, h.sources]),
    );
    return profiles
      .filter((p) => hits.has(p.profileId))
      .map((p) => ({
        accountId: p.accountId,
        displayName: p.displayName,
        email: p.email,
        sources: hits.get(p.profileId) ?? [],
      }));
  }

  /** "Why can / can't this person do X?" */
  async explain(actor: Actor, accountId: string, action: string) {
    const acc = await this.staffAccess(actor, accountId);
    const allowed = acc.effective.permissions.includes(action);
    const denied = acc.effective.denied.includes(action);
    return {
      action,
      allowed,
      reason: denied
        ? 'denied by an override'
        : allowed
          ? 'granted by ' +
            (acc.effective.sources[action] ?? [])
              .map((s) => (s.kind === 'role' ? `role "${s.name}"` : 'an override'))
              .join(', ')
          : 'no active role or override grants it',
      sources: acc.effective.sources[action] ?? [],
      condition: (acc.effective.conditions[action] as ActionCondition | undefined) ?? null,
    };
  }

  async history(actor: Actor, opts: { accountId?: string; limit?: number } = {}) {
    const orgId = await this.orgId(actor);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const conds = [
      or(
        like(auditEvent.action, 'iam.role.%'),
        like(auditEvent.action, 'iam.access.%'),
        like(auditEvent.action, 'admin.staff.%'),
        like(auditEvent.action, 'iam.group.%'),
      ),
      or(eq(auditEvent.organizationId, orgId), isNull(auditEvent.organizationId)),
    ];
    if (opts.accountId)
      conds.push(
        and(eq(auditEvent.targetType, 'account'), eq(auditEvent.targetId, opts.accountId)),
      );
    const rows = await this.db
      .select({
        seq: auditEvent.seq,
        occurredAt: auditEvent.occurredAt,
        action: auditEvent.action,
        actorLabel: auditEvent.actorLabel,
        targetType: auditEvent.targetType,
        targetId: auditEvent.targetId,
        reason: auditEvent.reason,
        before: auditEvent.beforeSafe,
        after: auditEvent.afterSafe,
      })
      .from(auditEvent)
      .where(and(...conds))
      .orderBy(desc(auditEvent.seq))
      .limit(limit);
    // show people by name, not by id
    const accountIds = [
      ...new Set(
        rows.filter((r) => r.targetType === 'account' && r.targetId).map((r) => r.targetId!),
      ),
    ];
    const names = accountIds.length
      ? new Map(
          (
            await this.db
              .select({ id: account.id, name: account.displayName })
              .from(account)
              .where(inArray(account.id, accountIds))
          ).map((a) => [a.id, a.name]),
        )
      : new Map<string, string>();
    return rows.map((r) => ({
      ...r,
      targetLabel:
        r.targetType === 'account' && r.targetId ? (names.get(r.targetId) ?? null) : null,
    }));
  }

  /** The signed-in person's own access, straight from the database (the session copy can be stale). */
  async myAccess(actor: Actor) {
    if (!actor.staffProfileId) {
      return {
        permissions: actor.permissions,
        roleCodes: actor.roleCodes,
        conditions: {},
        locationScope: actor.locationScope,
      };
    }
    const eff = await this.access.resolveForProfile(actor.staffProfileId);
    const [p] = await this.db
      .select({ scope: staffProfile.locationScope })
      .from(staffProfile)
      .where(eq(staffProfile.id, actor.staffProfileId))
      .limit(1);
    return {
      permissions: eff.permissions,
      roleCodes: eff.roleCodes,
      conditions: eff.conditions,
      locationScope: p?.scope ?? [],
    };
  }

  // ------------------------------------------------------------------- groups

  async listGroups(actor: Actor) {
    const orgId = await this.orgId(actor);
    const groups = await this.db
      .select()
      .from(staffGroup)
      .where(eq(staffGroup.organizationId, orgId))
      .orderBy(asc(staffGroup.name));
    const members = groups.length
      ? await this.db
          .select({
            groupId: staffGroupMember.groupId,
            accountId: staffProfile.accountId,
            displayName: account.displayName,
          })
          .from(staffGroupMember)
          .innerJoin(staffProfile, eq(staffProfile.id, staffGroupMember.staffProfileId))
          .innerJoin(account, eq(account.id, staffProfile.accountId))
          .where(
            inArray(
              staffGroupMember.groupId,
              groups.map((g) => g.id),
            ),
          )
      : [];
    return groups.map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
      description: g.description,
      archived: !!g.archivedAt,
      members: members
        .filter((m) => m.groupId === g.id)
        .map((m) => ({ accountId: m.accountId, displayName: m.displayName })),
    }));
  }

  async saveGroup(
    actor: Actor,
    input: { code: string; name: string; description?: string; accountIds?: string[] },
    existingCode?: string,
  ) {
    const orgId = await this.orgId(actor);
    if (!CODE.test(input.code)) {
      throw AppError.validation(
        [{ path: 'code', code: 'invalid_format' }],
        'Group code must be lowercase letters, digits and underscores',
      );
    }
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(staffGroup)
        .where(
          and(
            eq(staffGroup.organizationId, orgId),
            eq(staffGroup.code, existingCode ?? input.code),
          ),
        )
        .limit(1);
      if (!existingCode && existing) {
        throw new AppError('state_conflict', {
          title: `A group with the code "${input.code}" already exists`,
        });
      }
      if (existingCode && !existing) throw AppError.notFound('group');
      let groupId: string;
      if (existing) {
        await tx
          .update(staffGroup)
          .set({
            name: input.name.trim(),
            description: input.description?.trim() || null,
            version: existing.version + 1,
            updatedAt: sql`now()`,
          })
          .where(eq(staffGroup.id, existing.id));
        groupId = existing.id;
      } else {
        const [g] = await tx
          .insert(staffGroup)
          .values({
            organizationId: orgId,
            code: input.code,
            name: input.name.trim(),
            description: input.description?.trim() || null,
          })
          .returning();
        groupId = g!.id;
      }
      if (input.accountIds) {
        const profiles = input.accountIds.length
          ? await tx
              .select({ id: staffProfile.id })
              .from(staffProfile)
              .where(
                and(
                  eq(staffProfile.organizationId, orgId),
                  inArray(staffProfile.accountId, input.accountIds),
                ),
              )
          : [];
        if (profiles.length !== new Set(input.accountIds).size) {
          throw AppError.validation(
            [{ path: 'accountIds', code: 'unknown_staff' }],
            'Unknown staff member',
          );
        }
        await tx.delete(staffGroupMember).where(eq(staffGroupMember.groupId, groupId));
        if (profiles.length) {
          await tx
            .insert(staffGroupMember)
            .values(profiles.map((p) => ({ groupId, staffProfileId: p.id })));
        }
      }
      await this.audit.record({
        action: existing ? 'iam.group.updated' : 'iam.group.created',
        targetType: 'group',
        targetId: input.code,
        actor,
        after: { name: input.name, members: input.accountIds?.length },
      });
    });
    return (await this.listGroups(actor)).find((g) => g.code === input.code)!;
  }

  async setGroupArchived(actor: Actor, code: string, archived: boolean) {
    const orgId = await this.orgId(actor);
    const [g] = await this.db
      .update(staffGroup)
      .set({ archivedAt: archived ? sql`now()` : null, updatedAt: sql`now()` })
      .where(and(eq(staffGroup.organizationId, orgId), eq(staffGroup.code, code)))
      .returning();
    if (!g) throw AppError.notFound('group');
    await this.audit.record({
      action: archived ? 'iam.group.archived' : 'iam.group.restored',
      targetType: 'group',
      targetId: code,
      actor,
    });
    return { code, archived };
  }
}
