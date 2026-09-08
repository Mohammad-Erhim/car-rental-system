import {
  DEFAULT_PAGES_CONFIG,
  DEFAULT_SEO_CONFIG,
  seoConfigSchema,
  zPagesConfig,
  type BrandingResponse,
  type HealthSummary,
  type LocalesResponse,
  type PagesResponse,
  type SeoResponse,
} from '@carrental/contracts';
import { DEFAULT_BRAND_CONFIG, brandConfigSchema } from '@carrental/theme';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { ObjectStorageService } from '../../common/object-storage/object-storage.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { locale } from '../../database/schema/i18n';
import { HealthService } from '../../observability/health.service';
import { ConfigVersionService } from '../config/config-version.service';
import { TranslationService } from '../config/translation.service';

/** kind/key the branding config lives under in `config_version` (DEC-025). */
export const BRANDING_KIND = 'branding';
export const BRANDING_KEY = 'default';

/** kind/key the SEO config lives under in `config_version` (SRS-ADM-006). */
export const SEO_KIND = 'seo';
export const SEO_KEY = 'default';

/** kind/key the page-builder config lives under in `config_version`. */
export const PAGES_KIND = 'pages';
export const PAGES_KEY = 'default';

@Injectable()
export class MetaService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly health: HealthService,
    private readonly configVersions: ConfigVersionService,
    private readonly storage: ObjectStorageService,
    private readonly translations: TranslationService,
  ) {}

  /** Published translation overrides for a namespace + locale (public). Empty when none. */
  translationsBundle(namespace: string, locale: string) {
    return this.translations.publishedBundle(namespace || 'common', locale);
  }

  /** Enabled locales come from the DB, not a bundled array (FR-GBL-004, SRS-I18N-001). */
  async locales(): Promise<LocalesResponse> {
    const rows = await this.db
      .select()
      .from(locale)
      .where(eq(locale.isActive, true))
      .orderBy(asc(locale.sortOrder), asc(locale.code));

    const defaultRow = rows.find((r) => r.isDefault) ?? rows[0];

    return {
      defaultLocale: defaultRow?.code ?? 'en',
      locales: rows.map((r) => ({
        code: r.code,
        nativeName: r.nativeName,
        englishName: r.englishName,
        direction: r.direction === 'rtl' ? 'rtl' : 'ltr',
        isDefault: r.isDefault,
        fallback: r.fallbackChain,
        testOnly: r.testOnly,
      })),
    };
  }

  build() {
    return this.health.version();
  }

  /**
   * The published brand/theme config (DEC-025). Falls back to the built-in default when nothing
   * is published. Public + cacheable — both frontends apply it as a CSS-variable overlay.
   */
  async branding(): Promise<BrandingResponse> {
    const rows = await this.configVersions.list(BRANDING_KIND, BRANDING_KEY);
    const published = rows.find((r) => r.state === 'published');
    if (!published) {
      return { config: DEFAULT_BRAND_CONFIG, revision: 0, updatedAt: null };
    }
    const parsed = brandConfigSchema.safeParse(published.payload);
    return {
      config: parsed.success ? this.resolveAssetRefs(parsed.data) : DEFAULT_BRAND_CONFIG,
      revision: parsed.success ? published.revision : 0,
      updatedAt: published.effectiveFrom ?? published.createdAt,
    };
  }

  /** Turn `obj:<key>` asset refs into signed, time-limited URLs; leave external/data URLs alone. */
  private resolveAssetRefs<T extends BrandingResponse['config']>(config: T): T {
    const assets = { ...config.assets };
    for (const k of ['logo', 'logoDark', 'favicon', 'ogImage'] as const) {
      const v = assets[k];
      if (typeof v === 'string' && v.startsWith('obj:')) {
        // long TTL — brand assets are immutable per key and the URL is cacheable
        assets[k] = this.storage.signRef(v, 7 * 24 * 3600);
      }
    }
    return { ...config, assets };
  }

  /**
   * The published SEO config (SRS-ADM-006). Falls back to the built-in default when nothing is
   * published. Public + cacheable — `apps/site` folds it into route metadata / robots / JSON-LD.
   */
  async seo(): Promise<SeoResponse> {
    const rows = await this.configVersions.list(SEO_KIND, SEO_KEY);
    const published = rows.find((r) => r.state === 'published');
    if (!published) {
      return { config: DEFAULT_SEO_CONFIG, revision: 0, updatedAt: null };
    }
    const parsed = seoConfigSchema.safeParse(published.payload);
    return {
      config: parsed.success ? parsed.data : DEFAULT_SEO_CONFIG,
      revision: parsed.success ? published.revision : 0,
      updatedAt: published.effectiveFrom ?? published.createdAt,
    };
  }

  /**
   * The published page-builder config. Falls back to the built-in default (which mirrors the
   * hand-coded homepage) when nothing is published. Public + cacheable — `apps/site` renders
   * each page's blocks from it. `obj:` image refs are resolved to signed URLs.
   */
  async pages(): Promise<PagesResponse> {
    const rows = await this.configVersions.list(PAGES_KIND, PAGES_KEY);
    const published = rows.find((r) => r.state === 'published');
    if (!published) {
      return { config: DEFAULT_PAGES_CONFIG, revision: 0, updatedAt: null };
    }
    const parsed = zPagesConfig.safeParse(published.payload);
    if (!parsed.success) {
      return { config: DEFAULT_PAGES_CONFIG, revision: 0, updatedAt: null };
    }
    return {
      config: this.signPageAssets(parsed.data),
      revision: published.revision,
      updatedAt: published.effectiveFrom ?? published.createdAt,
    };
  }

  /** Deep-walk the config and swap any `obj:<key>` string for a signed, time-limited URL. */
  private signPageAssets<T>(config: T): T {
    const walk = (v: unknown): unknown => {
      if (typeof v === 'string') {
        return v.startsWith('obj:') ? this.storage.signRef(v, 7 * 24 * 3600) : v;
      }
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
        return out;
      }
      return v;
    };
    return walk(config) as T;
  }

  /** Coarse, safe status for the UI status bar (FR-GBL-005). */
  async healthSummary(): Promise<HealthSummary> {
    const readiness = await this.health.readiness();
    return {
      status: readiness.status,
      checkedAt: new Date().toISOString(),
      components: Object.entries(readiness.checks).map(([name, c]) => ({
        name,
        status: c.status,
      })),
    };
  }
}
