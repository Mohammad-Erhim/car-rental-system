import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { location, organization } from '../../database/schema/org';

import { LookupService } from './lookup.service';

/**
 * Config's public surface for other domain modules (SRS-ARC-001). Resolve lookup values,
 * organizations, and locations without touching config internals.
 */
@Injectable()
export class ConfigPublic {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly lookups: LookupService,
  ) {}

  getLookupValues(
    typeCode: string,
    opts?: { locale?: string; scopeKey?: string; activeAt?: string },
  ) {
    return this.lookups.getValues(typeCode, opts);
  }

  resolveHistoricalLookup(typeCode: string, code: string, locale = 'en') {
    return this.lookups.resolveHistorical(typeCode, code, locale);
  }

  /** Throw `VALIDATION_FAILED` on `field` unless `code` is a currently-active value of `typeCode`. */
  assertLookupCode(typeCode: string, code: string, field = 'code') {
    return this.lookups.assertActiveCode(typeCode, code, field);
  }

  async defaultOrganization() {
    const [org] = await this.db
      .select()
      .from(organization)
      .orderBy(asc(organization.createdAt))
      .limit(1);
    return org ?? null;
  }

  async listLocations(organizationId: string) {
    return this.db
      .select()
      .from(location)
      .where(and(eq(location.organizationId, organizationId), eq(location.status, 'active')))
      .orderBy(asc(location.name));
  }

  async getLocation(id: string) {
    const [loc] = await this.db.select().from(location).where(eq(location.id, id)).limit(1);
    return loc ?? null;
  }

  lookupIntegrityIssues() {
    return this.lookups.integrityIssues();
  }
}
