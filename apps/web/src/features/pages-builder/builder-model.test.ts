import { describe, expect, it } from 'vitest';

import {
  ASSET_URL_RE,
  emptyItem,
  fitScale,
  isLocalized,
  mapStrings,
  moveById,
  swap,
  toStorageRef,
} from './builder-model';

describe('builder-model', () => {
  it('turns a served asset URL back into its storage ref', () => {
    expect(toStorageRef('/api/v1/assets/hero/abc.png?exp=1&sig=x')).toBe('obj:hero/abc.png');
    expect(toStorageRef('https://cdn.test/api/v1/assets/a/b.webp?x=1')).toBe('obj:a/b.webp');
    expect(toStorageRef('https://example.com/pic.png')).toBe('https://example.com/pic.png');
    expect(ASSET_URL_RE.test('plain text')).toBe(false);
  });

  it('maps every string in a tree without touching other values', () => {
    expect(mapStrings({ a: 'x', b: [1, 'y'], c: { d: true } }, (s) => s.toUpperCase())).toEqual({
      a: 'X',
      b: [1, 'Y'],
      c: { d: true },
    });
  });

  it('recognises a localized value by its English text', () => {
    expect(isLocalized({ en: '', fr: 'x' })).toBe(true);
    expect(isLocalized({ fr: 'x' })).toBe(false);
    expect(isLocalized(null)).toBe(false);
  });

  it('swaps and moves without mutating, stopping at the ends', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(swap([1, 2, 3], 0, 2)).toEqual([3, 2, 1]);
    expect(moveById(list, 'b', -1).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(moveById(list, 'a', -1)).toBe(list);
    expect(moveById(list, 'c', 1)).toBe(list);
    expect(list.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('builds a blank item from a field list', () => {
    const item = emptyItem([
      { kind: 'ltext', key: 'title', label: '' },
      { kind: 'num', key: 'n', label: '', min: 3 },
      { kind: 'bool', key: 'on', label: '' },
      { kind: 'text', key: 'href', label: '' },
    ]);
    expect(item).toEqual({ title: { en: '' }, n: 3, on: false, href: '' });
  });

  it('fits a device into its container, never enlarging', () => {
    expect(fitScale(2000, 1280)).toBe(1);
    expect(fitScale(644, 1280)).toBeCloseTo(0.5, 2);
    expect(fitScale(10, 1280)).toBe(0.2);
  });
});
