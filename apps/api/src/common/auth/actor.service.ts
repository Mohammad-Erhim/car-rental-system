import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { account, staffProfile } from '../../database/schema/iam';

import { RbacService } from './rbac.service';
import type { AccessClaims } from './token.service';
import type { Actor } from './types';

/** Loads the full Actor (permissions, scope) for a verified access token. */
@Injectable()
export class ActorService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rbac: RbacService,
  ) {}

  async fromClaims(claims: AccessClaims): Promise<Actor | null> {
    const [acc] = await this.db.select().from(account).where(eq(account.id, claims.sub)).limit(1);
    if (!acc || acc.status === 'suspended' || acc.status === 'closed') return null;

    const base: Actor = {
      accountId: acc.id,
      kind: acc.kind as 'customer' | 'staff',
      audience: (claims.kind as 'customer' | 'staff') ?? (acc.kind as 'customer' | 'staff'),
      displayName: acc.displayName,
      localeCode: acc.localeCode,
      permissions: [],
      roleCodes: [],
      locationScope: [],
      approvalLimitMinor: 0,
      lastFullAuthAt: acc.lastFullAuthAt ?? undefined,
      tokenId: claims.jti,
    };

    if (acc.kind !== 'staff') return base;

    const [profile] = await this.db
      .select()
      .from(staffProfile)
      .where(eq(staffProfile.accountId, acc.id))
      .limit(1);
    // 'invited' means the staffer has not accepted yet — sign-in already rejects a still-pending
    // account, but this is the defense-in-depth check: a real session must never resolve real
    // permissions for a profile that hasn't been activated, regardless of how it got a token.
    if (
      !profile ||
      profile.status === 'suspended' ||
      profile.status === 'deactivated' ||
      profile.status === 'invited'
    ) {
      return { ...base, kind: 'staff' };
    }

    const permissions = await this.rbac.resolvePermissions(profile.roleCodes);
    return {
      ...base,
      staffProfileId: profile.id,
      organizationId: profile.organizationId,
      permissions,
      roleCodes: profile.roleCodes,
      locationScope: profile.locationScope,
      approvalLimitMinor: profile.approvalLimitMinor,
    };
  }
}
