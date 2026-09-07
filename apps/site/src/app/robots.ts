import type { MetadataRoute } from 'next';

import { seoOrigin } from '../lib/seo';
import { getSeoConfig } from '../lib/seo-config';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [origin, seo] = await Promise.all([seoOrigin(), getSeoConfig()]);
  if (!seo.indexable) {
    // Master switch off (SRS-ADM-006): keep everyone out, no sitemap reference.
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/*/account', '/*/checkout'] },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
