import {
  DEFAULT_CONSENT_CONFIG,
  type ConsentConfig,
  type ConsentConfigResponse,
} from '@carrental/contracts';

import { apiGet } from './api';

export type { ConsentConfig };

/**
 * The published cookie-consent config (banner copy, categories, layout, cookie declaration), or
 * the built-in default. Cached for a minute. Mirror of `lib/branding.ts` / `lib/pages-config.ts`.
 */
export async function getConsentConfig(): Promise<ConsentConfig> {
  try {
    const res = await apiGet<ConsentConfigResponse>('/meta/consent', { revalidate: 60 });
    return res.config;
  } catch {
    return DEFAULT_CONSENT_CONFIG;
  }
}
