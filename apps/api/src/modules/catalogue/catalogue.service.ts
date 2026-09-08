import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { CacheBus } from '../../common/cache/cache-bus';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import {
  vehicleCategory,
  vehicleCategoryFeature,
  vehicleFeature,
} from '../../database/schema/catalogue';
import { organization } from '../../database/schema/org';

const CACHE_NS = 'catalogue';

export interface CategoryView {
  id: string;
  code: string;
  class: string;
  displayName: string;
  description: string | null;
  passengers: number;
  luggage: number;
  doors: number;
  transmission: 'automatic' | 'manual';
  imageRef: string | null;
  sortOrder: number;
  isActive: boolean;
  features: Array<{ code: string; label: string; group: string }>;
}

@Injectable()
export class CatalogueService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly cache: CacheBus,
  ) {}

  private async orgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  async etag(): Promise<string> {
    const v = await this.cache.version(CACHE_NS);
    return `W/"cat-${v}"`;
  }

  async listCategories(
    opts: { includeInactive?: boolean; codes?: string[] } = {},
  ): Promise<CategoryView[]> {
    const orgId = await this.orgId();
    const where = [eq(vehicleCategory.organizationId, orgId)];
    if (!opts.includeInactive) where.push(eq(vehicleCategory.isActive, true));
    if (opts.codes?.length) where.push(inArray(vehicleCategory.code, opts.codes));

    const cats = await this.db
      .select()
      .from(vehicleCategory)
      .where(and(...where))
      .orderBy(asc(vehicleCategory.sortOrder), asc(vehicleCategory.code));
    if (cats.length === 0) return [];

    const maps = await this.db
      .select({
        categoryId: vehicleCategoryFeature.categoryId,
        code: vehicleCategoryFeature.featureCode,
        sortOrder: vehicleCategoryFeature.sortOrder,
      })
      .from(vehicleCategoryFeature)
      .where(
        inArray(
          vehicleCategoryFeature.categoryId,
          cats.map((c) => c.id),
        ),
      )
      .orderBy(asc(vehicleCategoryFeature.sortOrder));

    const feats = await this.db
      .select()
      .from(vehicleFeature)
      .where(eq(vehicleFeature.organizationId, orgId));
    const featByCode = new Map(feats.map((f) => [f.code, f]));

    return cats.map((c) => ({
      id: c.id,
      code: c.code,
      class: c.class,
      displayName: c.displayName,
      description: c.description,
      passengers: c.passengers,
      luggage: c.luggage,
      doors: c.doors,
      transmission: c.transmission as 'automatic' | 'manual',
      imageRef: c.imageRef,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      features: maps
        .filter((m) => m.categoryId === c.id)
        .map((m) => {
          const f = featByCode.get(m.code);
          return { code: m.code, label: f?.label ?? m.code, group: f?.group ?? 'comfort' };
        }),
    }));
  }

  async getCategory(code: string): Promise<CategoryView> {
    const [row] = await this.listCategories({ includeInactive: true, codes: [code] });
    if (!row) throw AppError.notFound('category');
    return row;
  }

  async listFeatures(): Promise<Array<{ code: string; label: string; group: string }>> {
    const orgId = await this.orgId();
    const rows = await this.db
      .select()
      .from(vehicleFeature)
      .where(and(eq(vehicleFeature.organizationId, orgId), eq(vehicleFeature.isActive, true)))
      .orderBy(asc(vehicleFeature.sortOrder), asc(vehicleFeature.code));
    return rows.map((r) => ({ code: r.code, label: r.label, group: r.group }));
  }

  async upsertCategory(
    actor: Actor,
    input: {
      code: string;
      class: string;
      displayName: string;
      description?: string;
      passengers: number;
      luggage: number;
      doors: number;
      transmission?: 'automatic' | 'manual';
      imageRef?: string;
      sortOrder?: number;
      featureCodes?: string[];
    },
    expectedVersion?: number,
  ): Promise<CategoryView> {
    const orgId = await this.orgId();
    const [existing] = await this.db
      .select()
      .from(vehicleCategory)
      .where(and(eq(vehicleCategory.organizationId, orgId), eq(vehicleCategory.code, input.code)))
      .limit(1);

    if (existing && expectedVersion !== undefined && expectedVersion !== existing.version) {
      throw AppError.conflict(existing.version);
    }

    const values = {
      organizationId: orgId,
      code: input.code,
      class: input.class,
      displayName: input.displayName,
      description: input.description ?? null,
      passengers: input.passengers,
      luggage: input.luggage,
      doors: input.doors,
      transmission: input.transmission ?? 'automatic',
      imageRef: input.imageRef ?? null,
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
    };

    let categoryId: string;
    if (existing) {
      await this.db
        .update(vehicleCategory)
        .set({
          ...values,
          version: existing.version + 1,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(eq(vehicleCategory.id, existing.id));
      categoryId = existing.id;
    } else {
      const [row] = await this.db
        .insert(vehicleCategory)
        .values({ ...values, createdBy: actor.accountId })
        .returning();
      categoryId = row!.id;
    }

    if (input.featureCodes) {
      await this.db
        .delete(vehicleCategoryFeature)
        .where(eq(vehicleCategoryFeature.categoryId, categoryId));
      if (input.featureCodes.length) {
        await this.db.insert(vehicleCategoryFeature).values(
          input.featureCodes.map((code, i) => ({
            categoryId,
            featureCode: code,
            sortOrder: i,
          })),
        );
      }
    }

    await this.afterMutation(
      actor,
      existing ? 'catalogue.category.updated' : 'catalogue.category.created',
      categoryId,
      values,
    );
    return this.getCategory(input.code);
  }

  async setCategoryActive(actor: Actor, code: string, active: boolean): Promise<CategoryView> {
    const orgId = await this.orgId();
    const [existing] = await this.db
      .select()
      .from(vehicleCategory)
      .where(and(eq(vehicleCategory.organizationId, orgId), eq(vehicleCategory.code, code)))
      .limit(1);
    if (!existing) throw AppError.notFound('category');
    await this.db
      .update(vehicleCategory)
      .set({
        isActive: active,
        version: existing.version + 1,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(eq(vehicleCategory.id, existing.id));
    await this.afterMutation(
      actor,
      active ? 'catalogue.category.restored' : 'catalogue.category.deactivated',
      existing.id,
      { code, active },
    );
    return this.getCategory(code);
  }

  private async afterMutation(
    actor: Actor,
    action: string,
    targetId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({ action, targetType: 'vehicle_category', targetId, actor, after });
    await this.outbox.emit({
      type: 'catalogue.changed.v1',
      aggregateType: 'vehicle_category',
      aggregateId: targetId,
      payload: { action },
    });
    await this.cache.invalidate(CACHE_NS, { action });
  }
}
