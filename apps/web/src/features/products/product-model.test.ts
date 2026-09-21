import { describe, expect, it } from 'vitest';

import {
  fromMinor,
  overPrecise,
  PRICE,
  PRODUCT_CODE,
  productValues,
  toMinor,
  validQuantity,
} from './product-model';

import type { CatalogueProduct } from '@/lib/admin-hooks';

describe('product-model', () => {
  it('converts money without floating point drift', () => {
    expect(toMinor('9.99', 'USD')).toBe(999);
    expect(toMinor('1.15', 'USD')).toBe(115);
    expect(fromMinor(1250, 'USD')).toBe('12.50');
    // a zero-decimal currency has no cents to show or accept
    expect(fromMinor(1250, 'JPY')).toBe('1250');
    expect(toMinor('1250', 'JPY')).toBe(1250);
    expect(overPrecise('12.5', 'JPY')).toBe(true);
    expect(overPrecise('12.50', 'USD')).toBe(false);
    expect(overPrecise('12.505', 'USD')).toBe(true);
  });

  it('accepts prices with at most two decimals', () => {
    expect(PRICE.test('9')).toBe(true);
    expect(PRICE.test('9.5')).toBe(true);
    expect(PRICE.test('9.555')).toBe(false);
    expect(PRICE.test('-1')).toBe(false);
  });

  it('accepts lowercase codes only', () => {
    expect(PRODUCT_CODE.test('child_seat')).toBe(true);
    expect(PRODUCT_CODE.test('Child Seat')).toBe(false);
  });

  it('limits quantity to 1–20', () => {
    expect(validQuantity('1')).toBe(true);
    expect(validQuantity('20')).toBe(true);
    expect(validQuantity('0')).toBe(false);
    expect(validQuantity('21')).toBe(false);
    expect(validQuantity('')).toBe(false);
  });

  it('turns a product into form values', () => {
    const v = productValues({
      id: '1',
      code: 'gps',
      name: 'GPS',
      kind: 'extra',
      unitPriceMinor: 700,
      currency: 'USD',
      pricingUnit: 'per_day',
      taxable: false,
      maxQuantity: 2,
      categoryScope: ['suv'],
      locationScope: [],
      sortOrder: 4,
      active: true,
    } as CatalogueProduct);
    expect(v).toMatchObject({
      price: '7.00',
      taxable: false,
      categoryScope: ['suv'],
      sortOrder: '4',
    });
  });
});
