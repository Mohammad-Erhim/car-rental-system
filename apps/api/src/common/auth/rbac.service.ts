import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { role } from '../../database/schema/iam';

import type { Actor, AuthScope } from './types';

/** Global (unscoped) permission actions — a role that has these bypasses location scoping. */
const GLOBAL_ACTIONS = new Set([
  'staff.manage',
  'config.publish',
  'lookup.manage',
  'integration.manage',
]);

@Injectable()
export class RbacService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Resolve role codes to the union of their permission action codes. */
  async resolvePermissions(roleCodes: string[]): Promise<string[]> {
    if (!roleCodes.length) return [];
    const rows = await this.db
      .select({ code: role.code, actions: role.permissionActions })
      .from(role)
      .where(inArray(role.code, roleCodes));
    const set = new Set<string>();
    for (const r of rows) for (const a of r.actions) set.add(a);
    return [...set];
  }

  has(actor: Pick<Actor, 'permissions'>, action: string): boolean {
    return actor.permissions.includes(action);
  }

  hasAny(actor: Pick<Actor, 'permissions'>, actions: string[]): boolean {
    return actions.some((a) => actor.permissions.includes(a));
  }

  /** Build the authorization scope a repository query must be constrained by (SRS-SEC-008). */
  scopeFor(actor: Actor): AuthScope {
    const global = actor.permissions.some((p) => GLOBAL_ACTIONS.has(p));
    return {
      organizationId: actor.organizationId,
      locationIds: actor.locationScope.length ? actor.locationScope : undefined,
      global,
    };
  }

  /** Whether a staff actor may act on a record at `locationId`. */
  allowsLocation(actor: Actor, locationId: string | null | undefined): boolean {
    if (this.scopeFor(actor).global) return true;
    if (!actor.locationScope.length) return true; // org-wide within their roles
    if (!locationId) return true;
    return actor.locationScope.includes(locationId);
  }
}
