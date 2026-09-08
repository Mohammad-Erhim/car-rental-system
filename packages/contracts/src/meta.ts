import { brandConfigSchema } from '@carrental/theme';
import { z } from 'zod';

import { zLocale } from './primitives';

/** `GET /api/v1/meta/locales` — enabled locales come from the DB (SRS-I18N-001, FR-GBL-002). */
export const zLocaleInfo = z.object({
  code: zLocale,
  nativeName: z.string(),
  englishName: z.string(),
  direction: z.enum(['ltr', 'rtl']),
  isDefault: z.boolean(),
  fallback: z.array(zLocale),
  testOnly: z.boolean(),
});
export type LocaleInfo = z.infer<typeof zLocaleInfo>;

export const zLocalesResponse = z.object({
  defaultLocale: zLocale,
  locales: z.array(zLocaleInfo),
});
export type LocalesResponse = z.infer<typeof zLocalesResponse>;

/** `GET /api/v1/meta/build` */
export const zBuildInfo = z.object({
  name: z.string(),
  version: z.string(),
  gitSha: z.string().nullable(),
  builtAt: z.string(),
  nodeEnv: z.string(),
  schemaVersion: z.string().nullable(),
});
export type BuildInfo = z.infer<typeof zBuildInfo>;

/** `GET /api/v1/meta/health-summary` — safe, coarse status for the UI status bar (FR-GBL-005). */
export const zHealthSummary = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  checkedAt: z.string(),
  components: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['ok', 'degraded', 'down']),
    }),
  ),
});
export type HealthSummary = z.infer<typeof zHealthSummary>;

/**
 * `GET /api/v1/meta/branding` — the published brand/theme config (DEC-025). Public + cacheable;
 * both frontends apply it as a CSS-variable overlay. `revision` is the config-version number
 * (0 = built-in default, nothing published yet).
 */
export const zBrandingResponse = z.object({
  config: brandConfigSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().nullable(),
});
export type BrandingResponse = z.infer<typeof zBrandingResponse>;

/**
 * `POST /api/v1/config/branding/assets` (staff, `config.publish`) — upload one brand image and
 * get back an opaque `obj:` ref to store in the branding config's `assets`. Body is base64 (no
 * multipart) so it validates like any other DTO; the server sniffs the real media type, caps
 * the size, checks raster dimensions, and sanitises SVG (STAGE-009, DEC-025).
 */
export const BRAND_ASSET_PURPOSES = ['logo', 'logoDark', 'favicon', 'ogImage'] as const;
export type BrandAssetPurpose = (typeof BRAND_ASSET_PURPOSES)[number];

export const zBrandAssetUploadRequest = z.object({
  purpose: z.enum(BRAND_ASSET_PURPOSES),
  /** declared media type — must match the sniffed bytes and the accepted set */
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon']),
  /** raw file bytes, base64 (with or without a `data:` prefix) — capped server-side */
  dataBase64: z.string().min(1).max(4_000_000),
});
export type BrandAssetUploadRequest = z.infer<typeof zBrandAssetUploadRequest>;

export const zBrandAssetUploadResponse = z.object({
  ref: z.string(), // `obj:<key>` — persist this in brandConfig.assets
  url: z.string(), // signed, short-lived preview URL
  mediaType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export type BrandAssetUploadResponse = z.infer<typeof zBrandAssetUploadResponse>;

/**
 * SEO configuration managed from the dashboard (SRS-ADM-006, technical-SEO mandate). Rides the
 * config-version workflow under kind `seo` / key `default`; `GET /api/v1/meta/seo` serves the
 * published revision and `apps/site` folds it into every route's metadata, `robots`, and JSON-LD.
 */
const zHttpsUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be an https:// URL');

export const seoConfigSchema = z.object({
  /** brand/site name — used in the title template and JSON-LD Organization */
  siteName: z.string().trim().min(1).max(80),
  /** page-title template; `%s` is replaced by the page title (blank → just the page title) */
  titleTemplate: z.string().trim().max(80).default('%s'),
  /** title for routes that provide none (the home page) */
  defaultTitle: z.string().trim().min(1).max(120),
  /** meta description fallback (≤ ~160 chars renders fully in results) */
  defaultDescription: z.string().trim().min(1).max(320),
  /** absolute site origin used to build canonical + hreflang URLs */
  canonicalBaseUrl: zHttpsUrl,
  /** default Open Graph / Twitter card image */
  ogImageUrl: zHttpsUrl.nullable().default(null),
  /** `@handle` for Twitter card attribution */
  twitterHandle: z
    .string()
    .trim()
    .regex(/^@[A-Za-z0-9_]{1,15}$/, 'must look like @handle')
    .nullable()
    .default(null),
  /** master switch — false emits `noindex, nofollow` everywhere and an empty sitemap */
  indexable: z.boolean().default(true),
  /** search-console ownership tokens (rendered as <meta> when set) */
  googleSiteVerification: z.string().trim().max(200).nullable().default(null),
  bingSiteVerification: z.string().trim().max(200).nullable().default(null),
  /** JSON-LD Organization logo */
  organizationLogoUrl: zHttpsUrl.nullable().default(null),
});
export type SeoConfig = z.infer<typeof seoConfigSchema>;

export const DEFAULT_SEO_CONFIG: SeoConfig = seoConfigSchema.parse({
  siteName: 'Car Rental',
  titleTemplate: '%s · Car Rental',
  defaultTitle: 'Car Rental — book a vehicle in minutes',
  defaultDescription:
    'Reserve a car from a modern fleet with transparent pricing, flexible pickup, and 24/7 support.',
  canonicalBaseUrl: 'https://example.com',
});

/** `GET /api/v1/meta/seo` — published SEO config (revision 0 = built-in default). */
export const zSeoResponse = z.object({
  config: seoConfigSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().nullable(),
});
export type SeoResponse = z.infer<typeof zSeoResponse>;

/** `/health/ready` — richer, used by ops + load balancers (SRS §16.3). */
export const zReadiness = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  checks: z.record(
    z.object({
      status: z.enum(['ok', 'degraded', 'down']),
      detail: z.string().optional(),
      durationMs: z.number().optional(),
    }),
  ),
});
export type Readiness = z.infer<typeof zReadiness>;
