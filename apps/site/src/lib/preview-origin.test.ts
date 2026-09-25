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

  it('falls back to the configured dashboard origin for a foreign or missing referrer', () => {
    // Not `self` — a missing referrer is the normal case in production (Referrer-Policy:
    // no-referrer on every response), and addressing the handshake to `self` there sends it to
    // the wrong window instead of the actual dashboard parent. This file's module-level EXTRA
    // always includes the dev dashboard origin outside NODE_ENV=production, so that's what a
    // last-resort fallback resolves to here.
    expect(previewParentOrigin('https://evil.test/x', SELF)).toBe('http://localhost:3100');
    expect(previewParentOrigin('', SELF)).toBe('http://localhost:3100');
  });
});
