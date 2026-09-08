import { DEFAULT_SEO_CONFIG, type SeoConfig, type SeoResponse } from '@carrental/contracts';

import { apiGet } from './api';

export type { SeoConfig };

/**
 * The published SEO config (SRS-ADM-006), or the built-in default when the API is unreachable or
 * nothing is published. Cached for a minute — Next dedupes the fetch across every
 * `generateMetadata` / `robots` / `sitemap` call in a single render.
 */
export async function getSeoConfig(): Promise<SeoConfig> {
  try {
    const res = await apiGet<SeoResponse>('/meta/seo', { revalidate: 60 });
    return res.config;
  } catch {
    return DEFAULT_SEO_CONFIG;
  }
}
