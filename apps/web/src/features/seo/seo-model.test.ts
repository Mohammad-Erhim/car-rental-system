import { DEFAULT_SEO_CONFIG } from '@carrental/contracts';
import { describe, expect, it } from 'vitest';

import { fieldIssues, resultTitle, seoValues, toSeoConfig } from './seo-model';

describe('seo-model', () => {
  it('round-trips the default config', () => {
    const parsed = toSeoConfig(seoValues(DEFAULT_SEO_CONFIG));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(DEFAULT_SEO_CONFIG);
  });

  it('turns empty optional fields into null', () => {
    const parsed = toSeoConfig({
      ...seoValues(DEFAULT_SEO_CONFIG),
      twitterHandle: '  ',
      ogImageUrl: '',
    });
    expect(parsed.success && parsed.data.twitterHandle).toBeNull();
    expect(parsed.success && parsed.data.ogImageUrl).toBeNull();
  });

  it('rejects a non-https canonical URL and a bad handle, by field', () => {
    const parsed = toSeoConfig({
      ...seoValues(DEFAULT_SEO_CONFIG),
      canonicalBaseUrl: 'http://x.test',
      twitterHandle: 'brand',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issues = fieldIssues(parsed.error);
      expect(Object.keys(issues).sort()).toEqual(['canonicalBaseUrl', 'twitterHandle']);
    }
  });

  it('builds the result title from the template', () => {
    expect(resultTitle({ titleTemplate: '%s · Brand', defaultTitle: 'Home' })).toBe('Home · Brand');
    expect(resultTitle({ titleTemplate: '', defaultTitle: 'Home' })).toBe('Home');
  });
});
