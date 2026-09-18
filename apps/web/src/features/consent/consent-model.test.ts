import type { Localized } from '@carrental/contracts';
import { describe, expect, it } from 'vitest';

import { clone, issueLines, localizedGet, localizedSet, translatedCount } from './consent-model';

const loc = (v: Record<string, string>) => v as unknown as Localized;

describe('consent-model', () => {
  it('reads a language, empty when absent', () => {
    expect(localizedGet(loc({ en: 'Hi', fr: 'Salut' }), 'fr')).toBe('Salut');
    expect(localizedGet(loc({ en: 'Hi' }), 'ar')).toBe('');
    expect(localizedGet(undefined, 'en')).toBe('');
  });

  it('keeps English even when empty, and drops other languages that are emptied', () => {
    expect(localizedSet(loc({ en: 'Hi', fr: 'Salut' }), 'en', '')).toEqual({ en: '', fr: 'Salut' });
    expect(localizedSet(loc({ en: 'Hi', fr: 'Salut' }), 'fr', '')).toEqual({ en: 'Hi' });
    expect(localizedSet(undefined, 'ar', 'مرحبا')).toEqual({ en: '', ar: 'مرحبا' });
  });

  it('does not mutate its input', () => {
    const v = loc({ en: 'Hi' });
    localizedSet(v, 'fr', 'Salut');
    expect(v).toEqual({ en: 'Hi' });
  });

  it('counts filled languages', () => {
    expect(translatedCount(loc({ en: 'a', fr: 'b' }), ['en', 'fr', 'ar'])).toBe(2);
  });

  it('formats issues as path: message', () => {
    expect(
      issueLines([
        { path: ['text', 'bannerTitle', 'en'], message: 'Required' },
        { path: [], message: 'x' },
      ]),
    ).toEqual(['text.bannerTitle.en: Required', '(root): x']);
  });

  it('deep-clones', () => {
    const a = { x: { y: 1 } };
    const b = clone(a);
    b.x.y = 2;
    expect(a.x.y).toBe(1);
  });
});
