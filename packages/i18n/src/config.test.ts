import { describe, expect, it } from 'vitest';

import { buildFallbackChain, fallbackChain, resolveLocale, resolveLocaleWithin } from './config';

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

  describe('fallbackChain', () => {
    it('includes the locale itself, its declared fallback, and the default', () => {
      expect(fallbackChain('fr')).toEqual(['fr', 'en']);
      expect(fallbackChain('ar')).toEqual(['ar', 'en']);
    });

    it('the default locale collapses to a single-entry chain', () => {
      expect(fallbackChain('en')).toEqual(['en']);
    });

    it('an unknown code resolves to the default definition first', () => {
      expect(fallbackChain('xx')).toEqual(['en']);
    });
  });

  describe('buildFallbackChain (shared by config.fallbackChain and react.chainFor)', () => {
    it('builds [code, ...fallback, default], deduped', () => {
      const lookup = (c: string): { code: string; fallback?: string[] } | undefined =>
        ({ de: { code: 'de', fallback: ['en'] } })[c];
      expect(buildFallbackChain('de', lookup, 'en')).toEqual(['de', 'en']);
    });

    it('appends the default when the definition omits it', () => {
      const lookup = () => ({ code: 'de', fallback: [] });
      expect(buildFallbackChain('de', lookup, 'en')).toEqual(['de', 'en']);
    });

    it('returns undefined when the code is not found by lookup', () => {
      const lookup = () => undefined;
      expect(buildFallbackChain('xx', lookup, 'en')).toBeUndefined();
    });
  });
});
