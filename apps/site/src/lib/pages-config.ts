import { DEFAULT_PAGES_CONFIG, type PagesConfig, type PagesResponse } from '@carrental/contracts';

import { apiGet } from './api';

export type { PagesConfig };

/**
 * The published page-builder config, or the built-in default (which mirrors the hand-coded
 * homepage). Cached for a minute. `obj:` image refs are already resolved to signed URLs by the
 * API. Mirror of `lib/branding.ts` / `lib/seo-config.ts`.
 */
export async function getPagesConfig(): Promise<PagesConfig> {
  try {
    const res = await apiGet<PagesResponse>('/meta/pages', { revalidate: 60 });
    return res.config;
  } catch {
    return DEFAULT_PAGES_CONFIG;
  }
}

/** Blocks for a page key, falling back to the built-in default's blocks. */
export function pageBlocks(config: PagesConfig, key: string) {
  return config.pages[key]?.blocks ?? DEFAULT_PAGES_CONFIG.pages[key]?.blocks ?? [];
}
