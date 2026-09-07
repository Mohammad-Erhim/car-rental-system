import type { MetadataRoute } from 'next';

import { apiGet } from '../lib/api';
import { ACTIVE_LOCALES } from '../lib/i18n';
import { SITE_URL } from '../lib/seo';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ['', '/search', '/help', '/legal/terms', '/legal/privacy'];
  let categoryCodes: string[] = [];
  try {
    const cats = await apiGet<Array<{ code: string }>>('/catalogue/categories', {
      revalidate: 600,
    });
    categoryCodes = cats.map((c) => `/vehicles/${c.code}`);
  } catch {
    /* API unavailable at build — static paths only */
  }
  const all = [...staticPaths, ...categoryCodes];
  return all.flatMap((path) =>
    ACTIVE_LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      alternates: {
        languages: Object.fromEntries(ACTIVE_LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])),
      },
    })),
  );
}
