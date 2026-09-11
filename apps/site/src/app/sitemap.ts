import type { MetadataRoute } from 'next';

import { apiGet } from '../lib/api';
import { getRuntimeLocales } from '../lib/i18n';
import { seoOrigin } from '../lib/seo';
import { getSeoConfig } from '../lib/seo-config';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [origin, seo, runtime] = await Promise.all([
    seoOrigin(),
    getSeoConfig(),
    getRuntimeLocales(), // live enabled-locale set (DEC-024) — no redeploy for a new language
  ]);
  if (!seo.indexable) return []; // master switch off (SRS-ADM-006)

  const staticPaths = ['', '/search', '/locations', '/help', '/legal/terms', '/legal/privacy'];
  let categoryCodes: string[] = [];
  try {
    const cats = await apiGet<Array<{ code: string }>>('/catalogue/categories', {
      revalidate: 600,
    });
    categoryCodes = cats.map((c) => `/vehicles/${c.code}`);
  } catch {
    /* API unavailable at build — static paths only */
  }
  const codes = runtime.locales.map((l) => l.code);
  const all = [...staticPaths, ...categoryCodes];
  return all.flatMap((path) =>
    codes.map((locale) => ({
      url: `${origin}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      alternates: {
        languages: Object.fromEntries(codes.map((l) => [l, `${origin}/${l}${path}`])),
      },
    })),
  );
}
