import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import {
  permissionAction,
  role,
  staffPermissionOverride,
  staffProfile,
  staffRoleAssignment,
} from '../../database/schema/iam';

import { computeEffective, type AccessGraph, type EffectiveAccess } from './access-graph';

/**
 * Loads the access graph from the database and evaluates it (`access-graph.ts`). The one place that
 * turns "this staff member" into "these permissions, these limits, because of these roles".
 * Resolved per request (no cache yet): correctness first — a change an administrator makes applies
 * to the very next call.
 */
@Injectable()
export class AccessService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async catalogue(exec: Pick<Database, 'select'> = this.db): Promise<string[]> {
    return (await exec.select({ code: permissionAction.code }).from(permissionAction)).map(
      (r) => r.code,
    );
  }

  /** The graph for the given staff (or every staff member of an organisation when omitted). */
  async loadGraph(
    opts: { staffProfileIds?: string[]; organizationId?: string } = {},
    exec: Pick<Database, 'select'> = this.db,
  ): Promise<AccessGraph> {
    const { staffProfileIds, organizationId } = opts;
    const staffFilter = staffProfileIds
      ? inArray(staffRoleAssignment.staffProfileId, staffProfileIds)
      : undefined;
    const [catalogue, roles, assignments, overrides] = await Promise.all([
      this.catalogue(exec),
      exec
        .select()
        .from(role)
        .where(
          organizationId
            ? or(isNull(role.organizationId), eq(role.organizationId, organizationId))
            : undefined,
        ),
      exec.select().from(staffRoleAssignment).where(staffFilter),
      exec
        .select()
        .from(staffPermissionOverride)
        .where(
          staffProfileIds
            ? inArray(staffPermissionOverride.staffProfileId, staffProfileIds)
            : undefined,
        ),
    ]);
    return {
      catalogue,
      roles: roles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        actions: r.permissionActions,
        conditions: r.conditions,
        archived: !!r.archivedAt,
      })),
      assignments: assignments.map((a) => ({
        id: a.id,
        staffProfileId: a.staffProfileId,
        roleId: a.roleId,
        validFrom: a.validFrom,
        validUntil: a.validUntil,
        reason: a.reason,
      })),
      overrides: overrides.map((o) => ({
        id: o.id,
        staffProfileId: o.staffProfileId,
        action: o.action,
        effect: o.effect as 'allow' | 'deny',
        validUntil: o.validUntil,
        reason: o.reason,
      })),
    };
  }

  async resolveForProfile(staffProfileId: string, at: Date = new Date()): Promise<EffectiveAccess> {
    const graph = await this.loadGraph({ staffProfileIds: [staffProfileId] });
    return computeEffective(graph, staffProfileId, at);
  }

  /** Active staff (invited/suspended/deactivated hold nothing) holding `staff.manage` right now. */
  accessManagers(
    organizationId: string,
    exec: Pick<Database, 'select'> = this.db,
  ): Promise<string[]> {
    return this.holdersOf(organizationId, 'staff.manage', exec);
  }

  /** Active staff who hold `action` right now (assignments in their window, overrides applied). */
  async holdersOf(
    organizationId: string,
    action: string,
    exec: Pick<Database, 'select'> = this.db,
  ): Promise<string[]> {
    const profiles = await exec
      .select({ id: staffProfile.id })
      .from(staffProfile)
      .where(
        and(eq(staffProfile.organizationId, organizationId), eq(staffProfile.status, 'active')),
      );
    const graph = await this.loadGraph(
      { staffProfileIds: profiles.map((p) => p.id), organizationId },
      exec,
    );
    return profiles
      .filter((p) => computeEffective(graph, p.id).permissions.includes(action))
      .map((p) => p.id);
  }
}
