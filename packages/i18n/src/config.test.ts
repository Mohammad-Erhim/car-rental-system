import { describe, expect, it } from 'vitest';

import { resolveLocale, resolveLocaleWithin } from './config';

describe('locale resolution', () => {
  it('resolveLocale clamps to the compile-time set', () => {
    expect(resolveLocale('fr')).toBe('fr');
    expect(resolveLocale('en-GB')).toBe('en');
    expect(resolveLocale('de')).toBe('en');
    expect(resolveLocale(null)).toBe('en');
  });

  describe('resolveLocaleWithin (runtime allow-list, DEC-024)', () => {
    const enabled = ['en', 'fr', 'ar', 'de'];

    it('accepts a runtime-added locale that resolveLocale would reject', () => {
      expect(resolveLocaleWithin('de', enabled)).toBe('de');
    });

    it('strips a region tag to its language part', () => {
      expect(resolveLocaleWithin('de-AT', enabled)).toBe('de');
    });

    it('falls back to the runtime default when the request is not enabled', () => {
      expect(resolveLocaleWithin('es', enabled, 'fr')).toBe('fr');
    });

    it('falls back past a default that is itself not enabled', () => {
      expect(resolveLocaleWithin('es', ['fr', 'ar'], 'de')).toBe('fr');
    });

    it('an empty allow-list behaves like the compile-time set', () => {
      expect(resolveLocaleWithin('de', [])).toBe('en');
      expect(resolveLocaleWithin('fr', [])).toBe('fr');
    });
  });
});
