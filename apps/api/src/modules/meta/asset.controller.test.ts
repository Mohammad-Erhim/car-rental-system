import { describe, expect, it } from 'vitest';

import { extractAssetKey } from './asset.controller';

/**
 * `extractAssetKey` strips everything up to and including the route's `/assets/` mount point to
 * recover the raw object key. A stored object key is a free-form, nanoid-derived string that
 * could in principle contain the literal substring "/assets/" itself — a greedy regex would eat
 * up to the LAST occurrence instead of the mount point, silently truncating the key.
 */
describe('extractAssetKey', () => {
  it('extracts a plain key after the /assets/ mount', () => {
    expect(extractAssetKey('/api/v1/assets/brand_logo/abc123')).toBe('brand_logo/abc123');
  });

  it('does not truncate a key that itself contains "/assets/"', () => {
    expect(extractAssetKey('/api/v1/assets/foo/assets/bar')).toBe('foo/assets/bar');
  });

  it('URL-decodes the recovered key', () => {
    expect(extractAssetKey('/api/v1/assets/brand%20logo/abc')).toBe('brand logo/abc');
  });
});
