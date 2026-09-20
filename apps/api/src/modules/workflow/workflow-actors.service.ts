import type { ActorSelector } from '@carrental/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, gt, lte, or, sql } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import {
  account,
  role,
  staffGroup,
  staffGroupMember,
  staffProfile,
  staffRoleAssignment,
} from '../../database/schema/iam';

export interface ResolveContext {
  organizationId: string;
  initiatorStaffId?: string | null;
  subjectOwnerStaffId?: string | null;
  locationCode?: string | null;
}

export interface ResolveOptions {
  excludeInitiator?: boolean;
  requireLocationScope?: boolean;
  /** people who may never be asked (e.g. the subject of a security-critical change) */
  excludeStaffIds?: string[];
}

export interface ResolvedActor {
  staffProfileId: string;
  /** why they are asked: `role:<code>` · `user` · `group:<code>` · `dynamic:<source>` */
  source: string;
  /** order of the selector that produced them (for in-order steps) */
  position: number;
}

export interface StaffPerson {
  staffProfileId: string;
  accountId: string;
  displayName: string;
  email: string;
  localeCode: string;
  locationScope: string[];
}

/**
 * Turns a step's actor selectors into concrete, currently-eligible people. Only ACTIVE staff with an
 * active account are ever returned; an assignment or group membership is honoured only inside its
 * validity window and only for a non-archived role/group. The same function answers "who would be
 * asked" (simulator), "who is asked" (task creation) and "may this person still decide" (decision).
 */
@Injectable()
export class WorkflowActorsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async resolve(
    selectors: readonly ActorSelector[],
    ctx: ResolveContext,
    opts: ResolveOptions = {},
    exec: Pick<Database, 'select'> = this.db,
  ): Promise<ResolvedActor[]> {
    const found = new Map<string, ResolvedActor>();
    const add = (staffProfileId: string, source: string, position: number) => {
      const prior = found.get(staffProfileId);
      if (!prior || position < prior.position)
        found.set(staffProfileId, { staffProfileId, source, position });
    };

    for (const [position, sel] of selectors.entries()) {
      if (sel.kind === 'user') {
        add(sel.staffProfileId, 'user', position);
      } else if (sel.kind === 'dynamic') {
        const id = sel.source === 'initiator' ? ctx.initiatorStaffId : ctx.subjectOwnerStaffId;
        if (id) add(id, `dynamic:${sel.source}`, position);
      } else if (sel.kind === 'role') {
        const rows = await exec
          .select({ staffProfileId: staffRoleAssignment.staffProfileId })
          .from(staffRoleAssignment)
          .innerJoin(role, eq(role.id, staffRoleAssignment.roleId))
          .where(
            and(
              eq(role.code, sel.roleCode),
              isNull(role.archivedAt),
              or(isNull(role.organizationId), eq(role.organizationId, ctx.organizationId)),
              lte(staffRoleAssignment.validFrom, sql`now()`),
              or(
                isNull(staffRoleAssignment.validUntil),
                gt(staffRoleAssignment.validUntil, sql`now()`),
              ),
            ),
          );
        for (const r of rows) add(r.staffProfileId, `role:${sel.roleCode}`, position);
      } else if (sel.kind === 'group') {
        const rows = await exec
          .select({ staffProfileId: staffGroupMember.staffProfileId, code: staffGroup.code })
          .from(staffGroupMember)
          .innerJoin(staffGroup, eq(staffGroup.id, staffGroupMember.groupId))
          .where(
            and(
              eq(staffGroup.id, sel.groupId),
              isNull(staffGroup.archivedAt),
              eq(staffGroup.organizationId, ctx.organizationId),
            ),
          );
        for (const r of rows) add(r.staffProfileId, `group:${r.code}`, position);
      }
    }
    if (!found.size) return [];

    const people = await this.people([...found.keys()], ctx.organizationId, exec);
    const eligible = new Set(people.map((p) => p.staffProfileId));
    const scopeOf = new Map(people.map((p) => [p.staffProfileId, p.locationScope]));
    const excluded = new Set(opts.excludeStaffIds ?? []);
    if (opts.excludeInitiator && ctx.initiatorStaffId) excluded.add(ctx.initiatorStaffId);

    return [...found.values()]
      .filter((a) => eligible.has(a.staffProfileId) && !excluded.has(a.staffProfileId))
      .filter((a) => {
        if (!opts.requireLocationScope || !ctx.locationCode) return true;
        const scope = scopeOf.get(a.staffProfileId) ?? [];
        return scope.length === 0 || scope.includes(ctx.locationCode);
      })
      .sort((a, b) => a.position - b.position || a.staffProfileId.localeCompare(b.staffProfileId));
  }

  /** Active staff (active profile + active account) among `ids`, in this organisation. */
  async people(
    ids: string[],
    organizationId: string,
    exec: Pick<Database, 'select'> = this.db,
  ): Promise<StaffPerson[]> {
    if (!ids.length) return [];
    const rows = await exec
      .select({
        staffProfileId: staffProfile.id,
        accountId: account.id,
        displayName: account.displayName,
        email: account.email,
        localeCode: account.localeCode,
        locationScope: staffProfile.locationScope,
      })
      .from(staffProfile)
      .innerJoin(account, eq(account.id, staffProfile.accountId))
      .where(
        and(
          inArray(staffProfile.id, ids),
          eq(staffProfile.organizationId, organizationId),
          eq(staffProfile.status, 'active'),
          eq(account.status, 'active'),
        ),
      );
    return rows;
  }

  /** Names for display, including people who are no longer active (history stays readable). */
  async labels(
    ids: string[],
    exec: Pick<Database, 'select'> = this.db,
  ): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await exec
      .select({ id: staffProfile.id, name: account.displayName })
      .from(staffProfile)
      .innerJoin(account, eq(account.id, staffProfile.accountId))
      .where(inArray(staffProfile.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
