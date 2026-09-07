import type { Metadata } from 'next';

import { ACTIVE_LOCALES, DEFAULT_LOCALE } from './i18n';

/** Public origin of the site — used for canonical + OG + sitemap. */
export const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export interface SeoInput {
  locale: string;
  /** path WITHOUT the locale prefix, leading slash, e.g. `/search` or `/` */
  path: string;
  title: string;
  description: string;
  /** absolute or site-relative image; defaults to the branded OG image */
  image?: string | null;
  /** override the site name in the `<title>` template */
  siteName?: string;
  noindex?: boolean;
  type?: 'website' | 'article';
}

function localizedUrl(locale: string, path: string): string {
  const clean = path === '/' ? '' : path.replace(/^\/+/, '/');
  return `${SITE_URL}/${locale}${clean}`;
}

/** Build a complete `Metadata` object: title template, canonical, hreflang alternates, OG/Twitter. */
export function buildMetadata(input: SeoInput): Metadata {
  const { locale, path, title, description, image, siteName = 'Car Rental', noindex, type } = input;
  const canonical = localizedUrl(locale, path);
  const languages: Record<string, string> = {};
  for (const l of ACTIVE_LOCALES) languages[l] = localizedUrl(l, path);
  languages['x-default'] = localizedUrl(DEFAULT_LOCALE, path);
  const ogImage = image ?? `${SITE_URL}/og-default.png`;

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical, languages },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: type ?? 'website',
      url: canonical,
      siteName,
      title,
      description,
      locale,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

/** JSON-LD script content — render inside `<script type="application/ld+json">`. */
export function jsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
