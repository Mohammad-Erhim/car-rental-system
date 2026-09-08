import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { product } from '../../database/schema/catalogue';
import { organization } from '../../database/schema/org';

/**
 * FR-ADM-006 / FR-PRC-005-006 — extras & protection products. The server owns the price; a
 * booking snapshots the accepted code/label/price into the reservation, so a later catalogue
 * change never rewrites a past agreement. `resolveForBooking()` is the one authoritative pricing
 * path — the client only names codes.
 */
export interface ProductInput {
  code: string;
  name: string;
  kind: 'extra' | 'protection';
  unitPriceMinor: number;
  currency?: string;
  taxable?: boolean;
  maxQuantity?: number;
  categoryScope?: string[];
  locationScope?: string[];
  sortOrder?: number;
}

export interface ResolvedExtra {
  code: string;
  label: string;
  kind: string;
  quantity: number;
  unitMinor: number;
  amountMinor: number;
  taxable: boolean;
}

@Injectable()
export class ProductService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  private async orgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  /** Full list for the ops editor (includes inactive). */
  async list() {
    const org = await this.orgId();
    const rows = await this.db
      .select()
      .from(product)
      .where(eq(product.organizationId, org))
      .orderBy(asc(product.sortOrder), asc(product.code));
    return rows.map((r) => this.shape(r));
  }

  /**
   * Products a customer may select for a given category + location — active, in scope. Used by
   * the `apps/site` checkout step (SCREEN-CUS-005).
   */
  async availableFor(categoryCode: string, locationCode: string) {
    const org = await this.orgId();
    const rows = await this.db
      .select()
      .from(product)
      .where(and(eq(product.organizationId, org), eq(product.active, true)))
      .orderBy(asc(product.sortOrder), asc(product.code));
    return rows
      .filter(
        (r) =>
          this.inScope(r.categoryScope, categoryCode) &&
          this.inScope(r.locationScope, locationCode),
      )
      .map((r) => this.shape(r));
  }

  /**
   * Resolve client-selected `extraCodes` into priced lines for a booking. Unknown / inactive /
   * out-of-scope codes are rejected (no silent drop, no client price). Repeated codes are folded
   * into a quantity, capped at `maxQuantity`.
   */
  async resolveForBooking(input: {
    extraCodes: string[];
    categoryCode: string;
    pickupLocationCode: string;
    currency: string;
  }): Promise<ResolvedExtra[]> {
    if (input.extraCodes.length === 0) return [];
    const org = await this.orgId();
    const counts = new Map<string, number>();
    for (const c of input.extraCodes) counts.set(c, (counts.get(c) ?? 0) + 1);

    const out: ResolvedExtra[] = [];
    for (const [code, qty] of counts) {
      const [row] = await this.db
        .select()
        .from(product)
        .where(and(eq(product.organizationId, org), eq(product.code, code)))
        .limit(1);
      if (!row || !row.active) {
        throw AppError.businessRule(`Extra "${code}" is not available`, {
          reason: 'extra_unavailable',
          code,
        });
      }
      if (
        !this.inScope(row.categoryScope, input.categoryCode) ||
        !this.inScope(row.locationScope, input.pickupLocationCode)
      ) {
        throw AppError.businessRule(`Extra "${code}" does not apply to this booking`, {
          reason: 'extra_not_applicable',
          code,
        });
      }
      if (row.currency !== input.currency) {
        throw AppError.businessRule(`Extra "${code}" is priced in a different currency`, {
          reason: 'extra_currency_mismatch',
          code,
        });
      }
      if (qty > row.maxQuantity) {
        throw AppError.businessRule(`At most ${row.maxQuantity} of "${code}" may be added`, {
          reason: 'extra_quantity_exceeded',
          code,
        });
      }
      out.push({
        code: row.code,
        label: row.name,
        kind: row.kind,
        quantity: qty,
        unitMinor: row.unitPriceMinor,
        amountMinor: row.unitPriceMinor * qty,
        taxable: row.taxable,
      });
    }
    return out;
  }

  async upsert(actor: Actor, input: ProductInput) {
    const org = await this.orgId();
    if (input.unitPriceMinor < 0) {
      throw AppError.validation([{ path: 'unitPriceMinor', code: 'min', params: { min: 0 } }]);
    }
    if (input.maxQuantity != null && input.maxQuantity < 1) {
      throw AppError.validation([{ path: 'maxQuantity', code: 'min', params: { min: 1 } }]);
    }
    const [existing] = await this.db
      .select()
      .from(product)
      .where(and(eq(product.organizationId, org), eq(product.code, input.code)))
      .limit(1);

    const values = {
      name: input.name,
      kind: input.kind,
      unitPriceMinor: input.unitPriceMinor,
      currency: input.currency ?? existing?.currency ?? 'USD',
      taxable: input.taxable ?? existing?.taxable ?? true,
      maxQuantity: input.maxQuantity ?? existing?.maxQuantity ?? 1,
      categoryScope: input.categoryScope ?? existing?.categoryScope ?? [],
      locationScope: input.locationScope ?? existing?.locationScope ?? [],
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
    };

    const [row] = existing
      ? await this.db
          .update(product)
          .set({ ...values, updatedBy: actor.accountId, updatedAt: new Date().toISOString() })
          .where(eq(product.id, existing.id))
          .returning()
      : await this.db
          .insert(product)
          .values({ organizationId: org, code: input.code, createdBy: actor.accountId, ...values })
          .returning();

    await this.audit.record({
      action: existing ? 'catalogue.product.updated' : 'catalogue.product.created',
      targetType: 'product',
      targetId: row!.id,
      actor,
      before: existing
        ? { unitPriceMinor: existing.unitPriceMinor, active: existing.active }
        : undefined,
      after: { code: input.code, unitPriceMinor: values.unitPriceMinor },
    });
    return this.shape(row!);
  }

  async setActive(actor: Actor, code: string, active: boolean) {
    const org = await this.orgId();
    const [row] = await this.db
      .update(product)
      .set({ active, updatedBy: actor.accountId, updatedAt: new Date().toISOString() })
      .where(and(eq(product.organizationId, org), eq(product.code, code)))
      .returning();
    if (!row) throw AppError.notFound('product');
    await this.audit.record({
      action: active ? 'catalogue.product.activated' : 'catalogue.product.deactivated',
      targetType: 'product',
      targetId: row.id,
      actor,
    });
    return this.shape(row);
  }

  private inScope(scope: string[], code: string): boolean {
    return scope.length === 0 || scope.includes(code);
  }

  private shape(r: typeof product.$inferSelect) {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      kind: r.kind,
      unitPriceMinor: r.unitPriceMinor,
      currency: r.currency,
      taxable: r.taxable,
      maxQuantity: r.maxQuantity,
      categoryScope: r.categoryScope,
      locationScope: r.locationScope,
      sortOrder: r.sortOrder,
      active: r.active,
    };
  }
}
