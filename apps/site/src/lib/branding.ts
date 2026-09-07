import { DEFAULT_BRAND_CONFIG, brandConfigToCss, type BrandConfig } from '@carrental/theme';

import { apiGet } from './api';

export interface Branding {
  config: BrandConfig;
  revision: number;
  updatedAt: string | null;
}

const FALLBACK: Branding = { config: DEFAULT_BRAND_CONFIG, revision: 0, updatedAt: null };

/** The published brand/theme config (DEC-025), or the built-in default. Cached for a minute. */
export async function getBranding(): Promise<Branding> {
  try {
    return await apiGet<Branding>('/meta/branding', { revalidate: 60 });
  } catch {
    return FALLBACK;
  }
}

/** `:root { … } .dark { … }` token CSS for inlining in `<head>` (SSR — no FOUC). */
export function brandingCss(b: Branding): string {
  return brandConfigToCss(b.config);
}
