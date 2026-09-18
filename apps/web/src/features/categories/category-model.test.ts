import { describe, expect, it } from 'vitest';

import {
  CATEGORY_CODE,
  categoryValues,
  digitsOnly,
  groupFeatures,
  inRange,
  LIMITS,
} from './category-model';

import type { CategoryView } from '@/lib/admin-hooks';

describe('category-model', () => {
  it('keeps only digits', () => {
    expect(digitsOnly('1e-3 4')).toBe('134');
  });

  it('checks whole numbers against the limits, empty included', () => {
    expect(inRange('5', LIMITS.passengers)).toBe(true);
    expect(inRange('0', LIMITS.passengers)).toBe(false);
    expect(inRange('61', LIMITS.passengers)).toBe(false);
    expect(inRange('0', LIMITS.luggage)).toBe(true);
    expect(inRange('', LIMITS.luggage)).toBe(false);
    expect(inRange('2.5', LIMITS.doors)).toBe(false);
  });

  it('accepts lowercase codes only', () => {
    expect(CATEGORY_CODE.test('mid_size2')).toBe(true);
    expect(CATEGORY_CODE.test('Mid')).toBe(false);
    expect(CATEGORY_CODE.test('a')).toBe(false);
  });

  it('groups features in a fixed order and drops empty groups', () => {
    const groups = groupFeatures([
      { code: 'a', group: 'tech' as const },
      { code: 'b', group: 'comfort' as const },
      { code: 'c', group: 'tech' as const },
    ]);
    expect(groups.map((g) => g.group)).toEqual(['comfort', 'tech']);
    expect(groups[1]!.features.map((f) => f.code)).toEqual(['a', 'c']);
  });

  it('turns a category into form values', () => {
    const v = categoryValues({
      code: 'suv',
      class: 'suv',
      displayName: 'SUV',
      description: null,
      passengers: 7,
      luggage: 4,
      doors: 5,
      transmission: 'manual',
      sortOrder: 3,
      features: [{ code: 'gps', label: 'GPS', group: 'tech' }],
      imageRef: null,
      imageUrl: null,
    } as CategoryView);
    expect(v).toMatchObject({ passengers: '7', description: '', featureCodes: ['gps'] });
  });
});
