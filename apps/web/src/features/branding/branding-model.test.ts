import { DEFAULT_BRAND_CONFIG } from '@carrental/theme';
import { describe, expect, it } from 'vitest';

import { acceptFor, readableOn, setToken } from './branding-model';

describe('branding-model', () => {
  it('picks white on dark backgrounds and near-black on light ones', () => {
    expect(readableOn('0 0% 5%')).toBe('0 0% 100%');
    expect(readableOn('0 0% 95%')).toBe('0 0% 9%');
  });

  it('sets a colour, recomputes its foreground and leaves the original untouched', () => {
    const before = structuredClone(DEFAULT_BRAND_CONFIG);
    const next = setToken(DEFAULT_BRAND_CONFIG, 'light', 'primary', '0 0% 95%');
    expect(next.colors.light.primary).toBe('0 0% 95%');
    expect(next.colors.light.primaryForeground).toBe('0 0% 9%');
    expect(DEFAULT_BRAND_CONFIG).toEqual(before);
  });

  it('offers only raster formats for the social image', () => {
    expect(acceptFor('ogImage')).not.toContain('svg');
    expect(acceptFor('logo')).toContain('svg');
  });
});
