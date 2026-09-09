import {
  DEFAULT_CONSENT_CONFIG,
  DEFAULT_PAGES_CONFIG,
  DEFAULT_SEO_CONFIG,
  seoConfigSchema,
  zConsentConfig,
  zPagesConfig,
  type BrandingResponse,
  type ConsentConfigResponse,
  type HealthSummary,
  type LocalesResponse,
  type PagesResponse,
  type SeoResponse,
} from '@carrental/contracts';
import {
  DEFAULT_BRAND_CONFIG,
  brandConfigSchema,
  brandConfigToCss,
  hslTripleToHex,
} from '@carrental/theme';
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

/** kind/key the cookie-consent config lives under in `config_version`. */
export const CONSENT_KIND = 'consent';
export const CONSENT_KEY = 'default';

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

  /**
   * The published brand config as a ready-to-serve CSS stylesheet (DEC-025). A render-blocking
   * `<link>` to this in a client-only app (apps/web) means zero brand flash on the first visit,
   * without shipping the theme runtime into a pre-paint script.
   */
  async brandingCss(): Promise<{ css: string; revision: number }> {
    const { config, revision } = await this.branding();
    return { css: brandConfigToCss(config), revision };
  }

  /**
   * A favicon that follows the published brand (DEC-025) — the app "car" glyph on a gradient
   * derived from `--primary`. If the admin uploaded a favicon asset, that URL wins (the caller
   * redirects). Returns `{ redirect }` or `{ svg }`.
   */
  async icon(): Promise<{ redirect: string } | { svg: string; revision: number }> {
    const { config, revision } = await this.branding();
    const uploaded = config.assets.favicon;
    if (typeof uploaded === 'string' && uploaded.length > 0) return { redirect: uploaded };

    const primary = config.colors.light.primary;
    const [h, s, l] = primary.split(/\s+/);
    const lightness = Number(String(l ?? '30%').replace('%', '')) || 30;
    const deep = hslTripleToHex(`${h} ${s} ${Math.max(6, Math.round(lightness - 12))}%`);
    const mid = hslTripleToHex(primary);

    const svg = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="${deep}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs>
  <rect width="32" height="32" rx="8" fill="url(#g)"/>
  <path d="M7 19.5c0-1.3.7-2 2.2-2.3l1.7-3.6c.5-1 1.3-1.6 2.5-1.6h5.2c1.4 0 2.3.6 3 1.9l1.4 2.9c1.4.4 2 1.1 2 2.4v1.3c0 .5-.3.8-.8.8h-1.1a2.4 2.4 0 0 1-4.8 0h-4.6a2.4 2.4 0 0 1-4.8 0H7.9c-.6 0-.9-.3-.9-.9v-.8Z" fill="#fff"/>
  <path d="M12.7 13.7c.3-.6.7-.9 1.4-.9h1.9v3.4h-4.9l1.6-2.5ZM17 12.8h2.1c.8 0 1.3.3 1.7 1.1l1.2 2.3H17v-3.4Z" fill="${mid}" fill-opacity="0.55"/>
</svg>`;
    return { svg, revision };
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

  /**
   * The published cookie-consent config (banner copy, categories, layout, cookie declaration).
   * Public + cacheable; falls back to the built-in default until a revision is published.
   */
  async consent(): Promise<ConsentConfigResponse> {
    const rows = await this.configVersions.list(CONSENT_KIND, CONSENT_KEY);
    const published = rows.find((r) => r.state === 'published');
    if (!published) {
      return { config: DEFAULT_CONSENT_CONFIG, revision: 0, updatedAt: null };
    }
    const parsed = zConsentConfig.safeParse(published.payload);
    return {
      config: parsed.success ? parsed.data : DEFAULT_CONSENT_CONFIG,
      revision: parsed.success ? published.revision : 0,
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
