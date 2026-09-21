import { minorToDecimalString, parseDecimalToMinor } from '@carrental/i18n';

import type { CatalogueProduct, ProductPricingUnit } from '@/lib/admin-hooks';

export type ProductKind = CatalogueProduct['kind'];

export const PRODUCT_CODE = /^[a-z0-9_]{2,60}$/;
export const PRICE = /^\d+(\.\d{1,2})?$/;

/** What was typed → integer minor units, by the product's own currency (¥ has no cents). */
export const toMinor = (s: string, currency: string) => parseDecimalToMinor(s, currency) ?? 0;
export const fromMinor = (m: number, currency: string) => minorToDecimalString(m, currency);
/** more decimals than the currency has (12.505 USD, 12.5 JPY) — refused, never silently rounded */
export const overPrecise = (price: string, currency: string) =>
  price.trim() !== '' && parseDecimalToMinor(price, currency) === null;

export interface ProductValues {
  code: string;
  name: string;
  kind: ProductKind;
  price: string;
  currency: string;
  pricingUnit: ProductPricingUnit;
  maxQuantity: string;
  taxable: boolean;
  categoryScope: string[];
  locationScope: string[];
  sortOrder: string;
}

export const emptyProduct = (): ProductValues => ({
  code: '',
  name: '',
  kind: 'extra',
  price: '',
  // empty: the currency picker fills in the business's default currency once it has loaded
  currency: '',
  pricingUnit: 'per_rental',
  maxQuantity: '1',
  taxable: true,
  categoryScope: [],
  locationScope: [],
  sortOrder: '0',
});

export const productValues = (p: CatalogueProduct): ProductValues => ({
  code: p.code,
  name: p.name,
  kind: p.kind,
  price: fromMinor(p.unitPriceMinor, p.currency),
  currency: p.currency,
  pricingUnit: p.pricingUnit,
  maxQuantity: String(p.maxQuantity),
  taxable: p.taxable,
  categoryScope: [...p.categoryScope],
  locationScope: [...p.locationScope],
  sortOrder: String(p.sortOrder),
});

/** a customer may add between 1 and 20 of a product */
export const validQuantity = (v: string) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 20;
