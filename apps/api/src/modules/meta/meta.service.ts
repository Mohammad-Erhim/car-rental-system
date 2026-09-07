import {
  DEFAULT_SEO_CONFIG,
  seoConfigSchema,
  type BrandingResponse,
  type HealthSummary,
  type LocalesResponse,
  type SeoResponse,
} from '@carrental/contracts';
import { DEFAULT_BRAND_CONFIG, brandConfigSchema } from '@carrental/theme';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { locale } from '../../database/schema/i18n';
import { HealthService } from '../../observability/health.service';
import { ConfigVersionService } from '../config/config-version.service';

/** kind/key the branding config lives under in `config_version` (DEC-025). */
export const BRANDING_KIND = 'branding';
export const BRANDING_KEY = 'default';

/** kind/key the SEO config lives under in `config_version` (SRS-ADM-006). */
export const SEO_KIND = 'seo';
export const SEO_KEY = 'default';

@Injectable()
export class MetaService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly health: HealthService,
    private readonly configVersions: ConfigVersionService,
  ) {}

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
      config: parsed.success ? parsed.data : DEFAULT_BRAND_CONFIG,
      revision: parsed.success ? published.revision : 0,
      updatedAt: published.effectiveFrom ?? published.createdAt,
    };
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
