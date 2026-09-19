import { and, eq, isNull, or, sql } from 'drizzle-orm';

import type { Database } from '../drizzle';
import { role, staffRoleAssignment } from '../schema/iam';

/**
 * Seed helper: make `codes` the staff member's permanent roles. An organisation's own role wins over
 * a system role of the same code; an unknown code throws (a seed typo must not silently grant
 * nothing).
 */
export async function setStaffRoles(
  db: Database,
  staffProfileId: string,
  organizationId: string,
  codes: string[],
): Promise<void> {
  await db
    .delete(staffRoleAssignment)
    .where(eq(staffRoleAssignment.staffProfileId, staffProfileId));
  for (const code of codes) {
    const rows = await db
      .select({ id: role.id, organizationId: role.organizationId })
      .from(role)
      .where(
        and(
          eq(role.code, code),
          or(isNull(role.organizationId), eq(role.organizationId, organizationId)),
        ),
      )
      .orderBy(sql`${role.organizationId} nulls last`)
      .limit(1);
    if (!rows[0]) throw new Error(`seed: unknown role "${code}"`);
    await db.insert(staffRoleAssignment).values({
      staffProfileId,
      roleId: rows[0].id,
      reason: 'seed',
    });
  }
}
