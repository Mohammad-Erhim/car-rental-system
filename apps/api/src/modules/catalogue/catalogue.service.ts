import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { CacheBus } from '../../common/cache/cache-bus';
import { ObjectStorageService } from '../../common/object-storage/object-storage.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import {
  vehicleCategory,
  vehicleCategoryFeature,
  vehicleFeature,
} from '../../database/schema/catalogue';
import { translation } from '../../database/schema/i18n';
import { organization } from '../../database/schema/org';
import { LocaleRepo } from '../config/locale.repo';

const CACHE_NS = 'catalogue';

/** Translation namespaces for category/feature display text (SRS-I18N-003) — the exact same
 *  mechanism `lookup:*` namespaces use: the DB row's own field is the English source, a
 *  `translation` row under this namespace carries every other locale, and staff translate it
 *  through the existing Translations screen with zero new UI (that screen's namespace list is
 *  fully generic — see `TranslationService.allSourceCatalogues`). `${code}.description` is a
 *  second key under the category namespace so the description can be translated independently
 *  of the display name. */
const CATEGORY_NS = 'catalogue:category';
const FEATURE_NS = 'catalogue:feature';
const DESCRIPTION_SUFFIX = '.description';

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
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  features: Array<{ code: string; label: string; group: string }>;
  /** For `upsertCategory`'s optimistic-concurrency `If-Match` — without this, an editor has no
   *  way to send back the version it read, the same way rate plans already do it. */
  version: number;
}

export interface FeatureView {
  code: string;
  label: string;
  group: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  version: number;
}

// ARCH-GAP (2026-09-15 audit, finding #3): `catalogue` has no catalogue.public.ts facade, even
// though CLAUDE.md documents that a sub-domain folded into a parent module (no .module.ts of its
// own — `catalogue` and `product.service.ts` are exactly this) "must still expose its
// cross-module surface through the parent's .public.ts". CatalogueService is imported directly,
// top-level, by availability/availability.service.ts, pricing/pricing.service.ts, and discovery's
// own controllers instead. The `apiModuleBoundaries` ESLint rule only blocks imports into a
// *subdirectory* of another module, not a top-level service file like this one, so this currently
// lints clean despite violating the documented convention. Left as-is rather than a partial
// migration — see the identical note on fleet.service.ts and pricing.service.ts: a real fix spans
// fleet, pricing, catalogue, availability, and discovery together (~15 call sites) and deserves a
// dedicated PR with its own DI-wiring verification. Follow-up: add catalogue.public.ts (+ the
// other four) re-exporting only what's actually consumed cross-module.
@Injectable()
export class CatalogueService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly cache: CacheBus,
    private readonly locales: LocaleRepo,
    private readonly storage: ObjectStorageService,
  ) {}

  /** Every published translation in `namespace` for `locale`'s runtime fallback chain, keyed by
   *  translation key, overlaid least-specific first so the most specific locale in the chain
   *  wins — the identical technique `LookupService.getValues` uses for reference-data labels.
   *  Returns an empty map for `locale` undefined or `'en'`: the DB row's own field already *is*
   *  the English source, nothing to overlay. */
  private async translatedText(
    namespace: string,
    locale: string | undefined,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!locale || locale === 'en') return out;
    const chain = await this.locales.fallbackChain(locale);
    const rows = (
      await this.db
        .select({
          key: translation.key,
          localeCode: translation.localeCode,
          publishedValue: translation.publishedValue,
        })
        .from(translation)
        .where(and(eq(translation.namespace, namespace), isNotNull(translation.publishedValue)))
    ).filter((r): r is typeof r & { publishedValue: string } => r.publishedValue != null);
    for (const loc of [...chain].reverse()) {
      for (const r of rows.filter((r) => r.localeCode === loc)) out.set(r.key, r.publishedValue);
    }
    return out;
  }

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
    opts: { includeInactive?: boolean; codes?: string[]; locale?: string } = {},
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

    const [categoryText, featureText] = await Promise.all([
      this.translatedText(CATEGORY_NS, opts.locale),
      this.translatedText(FEATURE_NS, opts.locale),
    ]);

    return cats.map((c) => ({
      id: c.id,
      code: c.code,
      class: c.class,
      displayName: categoryText.get(c.code) ?? c.displayName,
      description: c.description
        ? (categoryText.get(`${c.code}${DESCRIPTION_SUFFIX}`) ?? c.description)
        : null,
      passengers: c.passengers,
      luggage: c.luggage,
      doors: c.doors,
      transmission: c.transmission as 'automatic' | 'manual',
      imageRef: c.imageRef,
      imageUrl: c.imageRef ? this.storage.signRef(c.imageRef, 7 * 24 * 3600) : null,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      features: maps
        .filter((m) => m.categoryId === c.id)
        .map((m) => {
          const f = featByCode.get(m.code);
          return {
            code: m.code,
            label: featureText.get(m.code) ?? f?.label ?? m.code,
            group: f?.group ?? 'comfort',
          };
        }),
      version: c.version,
    }));
  }

  async getCategory(code: string, locale?: string): Promise<CategoryView> {
    const [row] = await this.listCategories({ includeInactive: true, codes: [code], locale });
    if (!row) throw AppError.notFound('category');
    return row;
  }

  async listFeatures(
    opts: { includeInactive?: boolean; locale?: string } = {},
  ): Promise<FeatureView[]> {
    const orgId = await this.orgId();
    const where = [eq(vehicleFeature.organizationId, orgId)];
    if (!opts.includeInactive) where.push(eq(vehicleFeature.isActive, true));
    const rows = await this.db
      .select()
      .from(vehicleFeature)
      .where(and(...where))
      .orderBy(asc(vehicleFeature.sortOrder), asc(vehicleFeature.code));
    const featureText = await this.translatedText(FEATURE_NS, opts.locale);
    return rows.map((r) => ({
      code: r.code,
      label: featureText.get(r.code) ?? r.label,
      group: r.group,
      icon: r.icon,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      version: r.version,
    }));
  }

  async upsertFeature(
    actor: Actor,
    input: {
      code: string;
      label: string;
      group?: string;
      icon?: string;
      sortOrder?: number;
    },
    expectedVersion?: number,
  ): Promise<FeatureView> {
    const orgId = await this.orgId();
    const [existing] = await this.db
      .select()
      .from(vehicleFeature)
      .where(and(eq(vehicleFeature.organizationId, orgId), eq(vehicleFeature.code, input.code)))
      .limit(1);

    if (existing && expectedVersion !== undefined && expectedVersion !== existing.version) {
      throw AppError.conflict(existing.version);
    }

    const values = {
      organizationId: orgId,
      code: input.code,
      label: input.label,
      group: input.group ?? existing?.group ?? 'comfort',
      icon: input.icon ?? existing?.icon ?? null,
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
    };

    let featureId: string;
    if (existing) {
      await this.db
        .update(vehicleFeature)
        .set({
          ...values,
          version: existing.version + 1,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(eq(vehicleFeature.id, existing.id));
      featureId = existing.id;
    } else {
      const [row] = await this.db
        .insert(vehicleFeature)
        .values({ ...values, createdBy: actor.accountId })
        .returning();
      featureId = row!.id;
    }

    await this.afterMutation(
      actor,
      existing ? 'catalogue.feature.updated' : 'catalogue.feature.created',
      featureId,
      values,
      'vehicle_feature',
    );
    const created = (await this.listFeatures({ includeInactive: true })).find(
      (f) => f.code === input.code,
    );
    if (!created) throw AppError.notFound('feature');
    return created;
  }

  async setFeatureActive(actor: Actor, code: string, active: boolean): Promise<FeatureView> {
    const orgId = await this.orgId();
    const [existing] = await this.db
      .select()
      .from(vehicleFeature)
      .where(and(eq(vehicleFeature.organizationId, orgId), eq(vehicleFeature.code, code)))
      .limit(1);
    if (!existing) throw AppError.notFound('feature');
    await this.db
      .update(vehicleFeature)
      .set({
        isActive: active,
        version: existing.version + 1,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(eq(vehicleFeature.id, existing.id));
    await this.afterMutation(
      actor,
      active ? 'catalogue.feature.restored' : 'catalogue.feature.deactivated',
      existing.id,
      { code, active },
      'vehicle_feature',
    );
    const found = (await this.listFeatures({ includeInactive: true })).find((f) => f.code === code);
    if (!found) throw AppError.notFound('feature');
    return found;
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
    targetType: 'vehicle_category' | 'vehicle_feature' = 'vehicle_category',
  ): Promise<void> {
    await this.audit.record({ action, targetType, targetId, actor, after });
    await this.outbox.emit({
      type: 'catalogue.changed.v1',
      aggregateType: targetType,
      aggregateId: targetId,
      payload: { action },
    });
    await this.cache.invalidate(CACHE_NS, { action });
  }
}
