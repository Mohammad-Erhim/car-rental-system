import { beforeEach, describe, expect, it } from 'vitest';

import { peekReturnTo, stashReturnTo, takeReturnTo } from './return-to';

describe('return-to', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips a genuine same-origin relative path', () => {
    stashReturnTo('/ops/dashboard?tab=fleet');
    expect(takeReturnTo()).toBe('/ops/dashboard?tab=fleet');
  });

  it('consumes the stashed value once — a second read falls back', () => {
    stashReturnTo('/account');
    expect(takeReturnTo()).toBe('/account');
    expect(takeReturnTo('/fallback')).toBe('/fallback');
  });

  it('falls back to the default for a protocol-relative off-site value', () => {
    stashReturnTo('//evil.example/phish');
    expect(takeReturnTo('/')).toBe('/');
  });

  it('falls back to the default for the backslash variant browsers resolve the same way', () => {
    // WHATWG URL parsing treats a leading backslash the same as a forward slash against an
    // http(s) base — this is exactly the open-redirect bypass a plain `startsWith('//')` check
    // misses. See the comment on `isSafeRelativePath` in return-to.ts.
    stashReturnTo('/\\evil.example');
    expect(takeReturnTo('/')).toBe('/');
    stashReturnTo('/\\/evil.example');
    expect(takeReturnTo('/')).toBe('/');
  });

  it('falls back to the default for an absolute or scheme-prefixed URL', () => {
    stashReturnTo('https://evil.example/');
    expect(takeReturnTo('/')).toBe('/');
    stashReturnTo('javascript:alert(1)');
    expect(takeReturnTo('/')).toBe('/');
  });

  it('peekReturnTo does not consume the stashed value', () => {
    stashReturnTo('/checkout');
    expect(peekReturnTo()).toBe('/checkout');
    expect(peekReturnTo()).toBe('/checkout');
    expect(takeReturnTo()).toBe('/checkout');
  });
});
