import { z } from 'zod';

/**
 * Page-builder config (ops-managed public-site content). Rides the generic `config_version`
 * workflow under kind `pages` / key `default` — draft → submit → approve → publish, exactly like
 * `branding` and `seo`. `GET /api/v1/meta/pages` serves the published revision; `apps/site`
 * renders each page from `config.pages[key].blocks` via a block renderer. Nothing is published
 * until an ops user builds and approves a revision — until then the site falls back to
 * `DEFAULT_PAGES_CONFIG`, whose blocks carry NO copy so every block component keeps using its
 * existing `site.home.*` / `site.help.faq.*` i18n keys (identical render + translation-catalogue
 * overrides still apply).
 */

/* ── localized text ─────────────────────────────────────────────────────────
 * `en` is the source of truth; `fr` / `ar` are optional overrides that fall
 * back to `en` at render time. Single-locale content is just `{ en }`. */
export function zLocalized(max: number) {
  return z.object({
    en: z.string().max(max),
    fr: z.string().max(max).optional(),
    ar: z.string().max(max).optional(),
  });
}
export type Localized = { en: string; fr?: string; ar?: string };

/** Resolve a localized field for a locale, falling back to English. */
export function pickText(v: Localized | undefined | null, locale: string): string {
  if (!v) return '';
  const hit = (v as Record<string, string | undefined>)[locale];
  return (hit && hit.trim()) || v.en || '';
}

/** An uploaded object ref (`obj:<key>`, resolved to a signed URL server-side) or an https URL. */
export const zAssetRef = z
  .string()
  .max(512)
  .regex(/^(obj:[A-Za-z0-9._/-]+|https:\/\/\S+)$/, 'must be an uploaded ref or an https URL');

/** Curated lucide icon names usable in blocks — an allowlist so the site never ships all icons. */
export const ICON_NAMES = [
  'BadgeCheck',
  'Wallet',
  'Clock',
  'MapPinned',
  'ShieldCheck',
  'Receipt',
  'Gauge',
  'RefreshCw',
  'Search',
  'ListChecks',
  'CarFront',
  'Sparkles',
  'CalendarCheck',
  'CalendarClock',
  'MapPin',
  'Star',
  'PhoneCall',
  'LifeBuoy',
  'Users',
  'Briefcase',
  'Cog',
  'Zap',
  'Gift',
  'Fuel',
  'Snowflake',
  'Baby',
  'Route',
  'Headset',
] as const;
export type IconName = (typeof ICON_NAMES)[number];
export const zIconName = z.enum(ICON_NAMES);

/** A call-to-action button: label + relative/anchor/https href. */
export const zCtaLink = z.object({
  label: zLocalized(60),
  href: z.string().max(300),
});
export type CtaLink = z.infer<typeof zCtaLink>;

export const zTone = z.enum(['default', 'muted', 'brand']);
export type Tone = z.infer<typeof zTone>;

const zIconItem = (title = 80, body = 260) =>
  z.object({ icon: zIconName, title: zLocalized(title), text: zLocalized(body) });

/* ── per-type prop shapes ──────────────────────────────────────────────────
 * Every text field is optional; when omitted the block component falls back
 * to the i18n key it already uses today. */

export const zHeroProps = z
  .object({
    eyebrow: zLocalized(120).optional(),
    title: zLocalized(200).optional(), // the page <h1>
    subtitle: zLocalized(400).optional(),
    rating: zLocalized(80).optional(),
    primaryCta: zCtaLink.optional(),
    secondaryCta: zCtaLink.nullable().optional(),
    trustItems: z.array(zLocalized(80)).max(4).default([]),
    background: zAssetRef.nullable().default(null),
    overlayOpacity: z.number().min(0).max(0.9).default(0.4),
    textAlign: z.enum(['center', 'start']).default('center'),
  })
  .default({});

export const zSearchCardProps = z
  .object({ title: zLocalized(120).optional(), hint: zLocalized(180).optional() })
  .default({});

export const zTrustBarProps = z
  .object({ items: z.array(zIconItem(80, 220)).max(6).default([]) })
  .default({});

export const zFeatureGridProps = z
  .object({
    eyebrow: zLocalized(120).optional(),
    title: zLocalized(160).optional(),
    subtitle: zLocalized(320).optional(),
    columns: z.enum(['2', '3', '4']).default('4'),
    items: z.array(zIconItem(80, 260)).max(8).default([]),
  })
  .default({});

export const zStepsProps = z
  .object({
    eyebrow: zLocalized(120).optional(),
    title: zLocalized(160).optional(),
    items: z.array(zIconItem(80, 260)).max(6).default([]),
  })
  .default({});

export const zStatsProps = z
  .object({
    title: zLocalized(160).optional(),
    autoLocations: z.boolean().default(true),
    items: z
      .array(z.object({ value: z.string().max(16), label: zLocalized(60) }))
      .max(4)
      .default([]),
  })
  .default({});

export const zTestimonialsProps = z
  .object({
    eyebrow: zLocalized(120).optional(),
    title: zLocalized(160).optional(),
    items: z
      .array(
        z.object({
          name: z.string().max(80),
          role: zLocalized(80),
          quote: zLocalized(400),
          rating: z.number().int().min(1).max(5).default(5),
        }),
      )
      .max(6)
      .default([]),
  })
  .default({});

export const zLocationsProps = z
  .object({
    eyebrow: zLocalized(120).optional(),
    title: zLocalized(160).optional(),
    subtitle: zLocalized(320).optional(),
    ctaLabel: zLocalized(60).optional(),
    limit: z.number().int().min(1).max(12).default(8),
  })
  .default({});

export const zFaqProps = z
  .object({
    eyebrow: zLocalized(120).optional(),
    title: zLocalized(160).optional(),
    ctaLabel: zLocalized(60).optional(),
    ctaHref: z.string().max(300).optional(),
    items: z
      .array(z.object({ q: zLocalized(200), a: zLocalized(1200) }))
      .max(20)
      .default([]),
  })
  .default({});

export const zCtaProps = z
  .object({
    title: zLocalized(200).optional(),
    subtitle: zLocalized(400).optional(),
    primary: zCtaLink.optional(),
    secondary: zCtaLink.nullable().optional(),
  })
  .default({});

export const zFleetProps = z
  .object({
    eyebrow: zLocalized(120).optional(),
    title: zLocalized(160).optional(),
    subtitle: zLocalized(320).optional(),
    emptyTitle: zLocalized(120).optional(),
    emptyText: zLocalized(260).optional(),
    ctaLabel: zLocalized(60).optional(),
    limit: z.number().int().min(3).max(12).default(9),
  })
  .default({});

export const zRichTextProps = z
  .object({
    eyebrow: zLocalized(120).optional(),
    heading: zLocalized(160).optional(),
    /** mini-markdown: blank-line paragraphs, **bold**, [label](href) — no raw HTML */
    body: zLocalized(6000),
    align: z.enum(['start', 'center']).default('start'),
    maxWidth: z.enum(['prose', 'wide']).default('prose'),
  })
  .default({ body: { en: '' } });

export const zImageProps = z
  .object({
    src: zAssetRef,
    alt: zLocalized(200),
    caption: zLocalized(200).optional(),
    width: z.number().int().positive().nullable().default(null),
    height: z.number().int().positive().nullable().default(null),
    maxWidth: z.enum(['prose', 'wide', 'full']).default('wide'),
    rounded: z.boolean().default(true),
    decorative: z.boolean().default(false),
  })
  .default({ src: 'obj:placeholder', alt: { en: '' } });

/* ── block envelope + discriminated union ─────────────────────────────────── */
const blockBase = {
  id: z.string().min(1).max(40),
  hidden: z.boolean().default(false),
  tone: zTone.default('default'),
};
const block = <T extends string, P extends z.ZodTypeAny>(type: T, props: P) =>
  z.object({ ...blockBase, type: z.literal(type), props });

export const zBlock = z.discriminatedUnion('type', [
  block('hero', zHeroProps),
  block('search-card', zSearchCardProps),
  block('trust-bar', zTrustBarProps),
  block('feature-grid', zFeatureGridProps),
  block('steps', zStepsProps),
  block('stats', zStatsProps),
  block('testimonials', zTestimonialsProps),
  block('locations', zLocationsProps),
  block('faq', zFaqProps),
  block('cta', zCtaProps),
  block('fleet', zFleetProps),
  block('rich-text', zRichTextProps),
  block('image', zImageProps),
]);
export type Block = z.infer<typeof zBlock>;
export type BlockType = Block['type'];
export const BLOCK_TYPES = [
  'hero',
  'search-card',
  'trust-bar',
  'feature-grid',
  'steps',
  'stats',
  'testimonials',
  'locations',
  'faq',
  'cta',
  'fleet',
  'rich-text',
  'image',
] as const;

/** Block types that can carry the page <h1> when no hero is present. */
export const H1_CAPABLE_BLOCKS: readonly BlockType[] = [
  'hero',
  'feature-grid',
  'steps',
  'stats',
  'testimonials',
  'faq',
  'cta',
  'rich-text',
];

export const zSitePage = z.object({
  blocks: z.array(zBlock).max(40),
});
export type SitePage = z.infer<typeof zSitePage>;

/** Page keys the builder manages. `home` is the flagship; others reserved for a fast-follow. */
export const PAGE_KEYS = ['home'] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const zPagesConfig = z.object({
  version: z.literal(1).default(1),
  pages: z.record(zSitePage),
});
export type PagesConfig = z.infer<typeof zPagesConfig>;

/** `GET /api/v1/meta/pages` — published page config (revision 0 = built-in default). */
export const zPagesResponse = z.object({
  config: zPagesConfig,
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().nullable(),
});
export type PagesResponse = z.infer<typeof zPagesResponse>;

/* ── default = today's homepage, structure only ──────────────────────────── */
const b = (id: string, type: BlockType, tone: Tone = 'default') =>
  ({ id, type, tone, hidden: false, props: {} }) as unknown;

export const DEFAULT_PAGES_CONFIG: PagesConfig = zPagesConfig.parse({
  version: 1,
  pages: {
    home: {
      blocks: [
        b('hero', 'hero', 'brand'),
        b('search', 'search-card'),
        b('trust', 'trust-bar'),
        b('fleet', 'fleet'),
        b('why', 'feature-grid', 'muted'),
        b('how', 'steps'),
        b('stats', 'stats', 'brand'),
        b('reviews', 'testimonials', 'muted'),
        b('locations', 'locations'),
        b('faq', 'faq', 'muted'),
        b('cta', 'cta', 'brand'),
      ],
    },
  },
});

/** Additional asset purposes for page-builder images (added to BRAND_ASSET_PURPOSES). */
export const PAGE_ASSET_PURPOSES = ['heroImage', 'pageImage'] as const;
export type PageAssetPurpose = (typeof PAGE_ASSET_PURPOSES)[number];

/** `POST /api/v1/config/pages/assets/sign` — re-sign an existing `obj:` ref for the builder. */
export const zPageAssetSignRequest = z.object({
  ref: z.string().regex(/^obj:[A-Za-z0-9._/-]+$/),
});
export const zPageAssetSignResponse = z.object({ url: z.string() });
export type PageAssetSignResponse = z.infer<typeof zPageAssetSignResponse>;
