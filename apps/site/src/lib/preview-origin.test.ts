import { describe, expect, it } from 'vitest';

import { isAllowedPreviewOrigin, previewParentOrigin } from './preview-origin';

const SELF = 'http://localhost:3000';

describe('preview origins', () => {
  it('allows its own origin and the dashboard dev server, nothing else', () => {
    expect(isAllowedPreviewOrigin(SELF, SELF)).toBe(true);
    expect(isAllowedPreviewOrigin('http://localhost:3100', SELF)).toBe(true);
    expect(isAllowedPreviewOrigin('https://evil.test', SELF)).toBe(false);
  });

  it('addresses the parent by its referrer when that is allowed', () => {
    expect(previewParentOrigin('http://localhost:3100/ops/config/pages', SELF)).toBe(
      'http://localhost:3100',
    );
  });

  it('falls back to its own origin for a foreign or missing referrer', () => {
    expect(previewParentOrigin('https://evil.test/x', SELF)).toBe(SELF);
    expect(previewParentOrigin('', SELF)).toBe(SELF);
  });
});
