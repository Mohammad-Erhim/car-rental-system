import type { Metadata } from 'next';

import { getRuntimeLocales } from './i18n';
import { getSeoConfig } from './seo-config';

/** Env-configured origin — the fallback when the dashboard SEO config has no canonical base. */
export const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export interface SeoInput {
  locale: string;
  /** path WITHOUT the locale prefix, leading slash, e.g. `/search` or `/` */
  path: string;
  title: string;
  description?: string;
  /** absolute or site-relative image; defaults to the branded OG image */
  image?: string | null;
  noindex?: boolean;
  type?: 'website' | 'article';
}

/** Origin used to build canonical + hreflang + sitemap URLs (dashboard config wins over env). */
export async function seoOrigin(): Promise<string> {
  const cfg = await getSeoConfig();
  return (cfg.canonicalBaseUrl || SITE_URL).replace(/\/$/, '');
}

function localizedUrl(origin: string, locale: string, path: string): string {
  const clean = path === '/' ? '' : path.replace(/^\/+/, '/');
  return `${origin}/${locale}${clean}`;
}

/**
 * Build a complete `Metadata` object — title template, canonical, hreflang alternates, OG/Twitter,
 * robots, and search-console verification — merging the page's own title/description with the
 * dashboard-managed SEO config (SRS-ADM-006).
 */
export async function buildMetadata(input: SeoInput): Promise<Metadata> {
  const cfg = await getSeoConfig();
  const origin = (cfg.canonicalBaseUrl || SITE_URL).replace(/\/$/, '');
  const { locale, path, title, image, noindex, type } = input;
  const description = input.description ?? cfg.defaultDescription;

  const canonical = localizedUrl(origin, locale, path);
  // the live enabled-locale set (DEC-024) — a dashboard-added language gets an hreflang
  // alternate here with no redeploy
  const runtime = await getRuntimeLocales();
  const languages: Record<string, string> = {};
  for (const l of runtime.locales) languages[l.code] = localizedUrl(origin, l.code, path);
  languages['x-default'] = localizedUrl(origin, runtime.defaultLocale, path);

  const ogImage = image ?? cfg.ogImageUrl ?? `${origin}/og-default.png`;
  const hidden = noindex || !cfg.indexable;
  const twitterHandle = cfg.twitterHandle ?? undefined;

  return {
    title: {
      absolute: cfg.titleTemplate.includes('%s') ? cfg.titleTemplate.replace('%s', title) : title,
    },
    description,
    metadataBase: new URL(origin),
    applicationName: cfg.siteName,
    alternates: { canonical, languages },
    robots: hidden
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : { index: true, follow: true },
    verification: {
      google: cfg.googleSiteVerification ?? undefined,
      other: cfg.bingSiteVerification ? { 'msvalidate.01': cfg.bingSiteVerification } : undefined,
    },
    openGraph: {
      type: type ?? 'website',
      url: canonical,
      siteName: cfg.siteName,
      title,
      description,
      locale,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
      site: twitterHandle,
      creator: twitterHandle,
    },
  };
}

/** JSON-LD script content — render inside `<script type="application/ld+json">`. */
export function jsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
