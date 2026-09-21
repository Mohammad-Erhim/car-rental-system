import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import {
  LOCATION_PICKUP_SUFFIX,
  LOCATION_RETURN_SUFFIX,
  LOCATION_NS,
} from '../../common/i18n-namespaces';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { location, organization } from '../../database/schema/org';

import { CurrencyService } from './currency.service';
import { LocaleRepo } from './locale.repo';
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
    private readonly currencies: CurrencyService,
    private readonly locales: LocaleRepo,
  ) {}

  /** Currencies the business currently sells in, default first (DEC-036). */
  enabledCurrencyCodes() {
    return this.currencies.enabledCodes();
  }

  defaultCurrency() {
    return this.currencies.defaultCode();
  }

  listEnabledCurrencies(locale?: string) {
    return this.currencies.listEnabled(locale);
  }

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

  /** Published translations of one namespace for a locale (see `LocaleRepo.publishedText`). */
  publishedText(namespace: string, locale?: string) {
    return this.locales.publishedText(namespace, locale);
  }

  /**
   * Active locations. With a `locale`, the customer-facing text — name and the pickup / return
   * instructions — comes back in that language where a published translation exists, else in the
   * English the dashboard user typed (DEC-037). Without one, exactly the stored row.
   */
  async listLocations(organizationId: string, locale?: string) {
    const rows = await this.db
      .select()
      .from(location)
      .where(and(eq(location.organizationId, organizationId), eq(location.status, 'active')))
      .orderBy(asc(location.name));
    const text = await this.locales.publishedText(LOCATION_NS, locale);
    if (text.size === 0) return rows;
    return rows.map((l) => ({
      ...l,
      name: text.get(l.code) ?? l.name,
      pickupInstructions: l.pickupInstructions
        ? (text.get(`${l.code}${LOCATION_PICKUP_SUFFIX}`) ?? l.pickupInstructions)
        : l.pickupInstructions,
      returnInstructions: l.returnInstructions
        ? (text.get(`${l.code}${LOCATION_RETURN_SUFFIX}`) ?? l.returnInstructions)
        : l.returnInstructions,
    }));
  }

  async getLocation(id: string) {
    const [loc] = await this.db.select().from(location).where(eq(location.id, id)).limit(1);
    return loc ?? null;
  }

  lookupIntegrityIssues() {
    return this.lookups.integrityIssues();
  }
}
