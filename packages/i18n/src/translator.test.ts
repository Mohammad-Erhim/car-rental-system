import { describe, expect, it, vi } from 'vitest';

import { fallbackChain, directionOf } from './config';
import { BASE_RESOURCES } from './resources';
import { createTranslator } from './translator';

describe('i18n translator (SRS-I18N-002/005)', () => {
  it('resolves a key in the active locale', () => {
    const t = createTranslator({ locale: 'fr', resources: BASE_RESOURCES });
    expect(t.t('action.search')).toBe('Rechercher');
  });

  it('falls back down the chain and reports the fallback (never a raw key)', () => {
    const onMissingKey = vi.fn();
    const t = createTranslator({
      locale: 'ar',
      resources: {
        ...BASE_RESOURCES,
        ar: { ...BASE_RESOURCES.ar, 'action.search': undefined as unknown as string },
      },
      onMissingKey,
    });
    // ar chain is ar -> en
    expect(fallbackChain('ar')).toEqual(['ar', 'en']);
    expect(t.t('action.search')).toBe('Search');
    expect(onMissingKey).toHaveBeenCalled();
  });

  it('never renders a raw key when nothing resolves — uses a humane fallback', () => {
    const onMissingKey = vi.fn();
    const t = createTranslator({ locale: 'en', resources: BASE_RESOURCES, onMissingKey });
    expect(t.t('totally.unknown.keyName')).toBe('Key name');
    expect(t.t('totally.unknown.keyName')).not.toContain('totally');
    expect(onMissingKey).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'totally.unknown.keyName', locale: 'en' }),
    );
  });

  it('formats ICU plurals per locale', () => {
    const en = createTranslator({ locale: 'en', resources: BASE_RESOURCES });
    expect(en.t('state.validation.summaryLead', { count: 1 })).toContain('is 1 problem');
    expect(en.t('state.validation.summaryLead', { count: 3 })).toContain('are 3 problems');

    const ar = createTranslator({ locale: 'ar', resources: BASE_RESOURCES });
    // Arabic has distinct one/two/few/many plural categories — just assert it renders & interpolates.
    expect(ar.t('state.validation.summaryLead', { count: 2 })).toContain('مشكلتان');
  });

  it('interpolates named params', () => {
    const t = createTranslator({ locale: 'en', resources: BASE_RESOURCES });
    expect(t.t('lang.switcher.current', { name: 'Français' })).toBe('Current language: Français');
  });

  it('reports direction correctly', () => {
    expect(directionOf('en')).toBe('ltr');
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('xx-unknown')).toBe('ltr');
  });

  it('has() is true only for the active locale, not a fallback', () => {
    const t = createTranslator({ locale: 'fr', resources: BASE_RESOURCES });
    expect(t.has('action.search')).toBe(true);
    const partial = createTranslator({
      locale: 'fr',
      resources: { ...BASE_RESOURCES, fr: {} },
    });
    expect(partial.has('action.search')).toBe(false);
    expect(partial.t('action.search')).toBe('Search'); // still resolves via en
  });
});
