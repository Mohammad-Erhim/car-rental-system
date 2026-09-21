import { describe, expect, it } from 'vitest';

import {
  SUPPORTED_CURRENCIES,
  formatMinorPlain,
  fromStripeAmount,
  getCurrency,
  isSupportedCurrency,
  minorToDecimalString,
  minorUnitDigits,
  parseDecimalToMinor,
  pickCurrency,
  stripeCurrency,
  toStripeAmount,
} from './currency';
import { createFormatters } from './format';

describe('currency catalogue (DEC-036)', () => {
  it('has unique upper-case ISO codes', () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{3}$/);
  });

  it('agrees with the runtime ICU data on every currency it lists', () => {
    // guards the hand-written digits column against a typo — Intl is the independent source
    for (const c of SUPPORTED_CURRENCIES) {
      const icu = new Intl.NumberFormat('en', {
        style: 'currency',
        currency: c.code,
      }).resolvedOptions().maximumFractionDigits;
      expect({ code: c.code, digits: c.digits }).toEqual({ code: c.code, digits: icu });
    }
  });

  it('leaves out currencies Stripe cannot take at our minor unit', () => {
    for (const c of ['KWD', 'BHD', 'JOD', 'OMR', 'TND', 'ISK', 'UGX', 'HUF', 'TWD']) {
      expect(isSupportedCurrency(c)).toBe(false);
    }
  });

  it('looks codes up case-insensitively', () => {
    expect(getCurrency('jpy')?.digits).toBe(0);
    expect(isSupportedCurrency(' eur ')).toBe(true);
    expect(isSupportedCurrency('XXX')).toBe(false);
  });
});

describe('minor-unit arithmetic without floats', () => {
  it('knows the digits of catalogue and non-catalogue currencies', () => {
    expect(minorUnitDigits('USD')).toBe(2);
    expect(minorUnitDigits('jpy')).toBe(0);
    expect(minorUnitDigits('KWD')).toBe(3); // not in the catalogue — still not guessed as 2
    expect(minorUnitDigits('???')).toBe(2);
  });

  it('renders minor units as a plain decimal string', () => {
    expect(minorToDecimalString(1299, 'USD')).toBe('12.99');
    expect(minorToDecimalString(5, 'USD')).toBe('0.05');
    expect(minorToDecimalString(0, 'USD')).toBe('0.00');
    expect(minorToDecimalString(1299, 'JPY')).toBe('1299');
    expect(minorToDecimalString(-250, 'EUR')).toBe('-2.50');
    expect(minorToDecimalString(1234, 'KWD')).toBe('1.234');
    expect(formatMinorPlain(1299, 'usd')).toBe('12.99 USD');
    expect(formatMinorPlain(1299, 'JPY')).toBe('1299 JPY');
  });

  it('parses what a person types, strictly', () => {
    expect(parseDecimalToMinor('12', 'USD')).toBe(1200);
    expect(parseDecimalToMinor('12.5', 'USD')).toBe(1250);
    expect(parseDecimalToMinor(' 12.50 ', 'USD')).toBe(1250);
    expect(parseDecimalToMinor('0.07', 'USD')).toBe(7);
    expect(parseDecimalToMinor('1299', 'JPY')).toBe(1299);
    // too many decimals is rejected, not rounded
    expect(parseDecimalToMinor('12.505', 'USD')).toBeNull();
    expect(parseDecimalToMinor('12.5', 'JPY')).toBeNull();
    expect(parseDecimalToMinor('', 'USD')).toBeNull();
    expect(parseDecimalToMinor('-1', 'USD')).toBeNull();
    expect(parseDecimalToMinor('1e3', 'USD')).toBeNull();
    expect(parseDecimalToMinor('12,5', 'USD')).toBeNull();
  });

  it('round-trips every amount for every catalogue currency', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      for (const minor of [0, 1, 9, 10, 99, 100, 101, 12345, 99999999]) {
        expect(parseDecimalToMinor(minorToDecimalString(minor, c.code), c.code)).toBe(minor);
      }
    }
  });

  it('does not drift where floating point would (0.1 + 0.2 style)', () => {
    expect(parseDecimalToMinor('1.15', 'USD')).toBe(115); // 1.15 * 100 === 114.99999999999999
    expect(parseDecimalToMinor('8.2', 'USD')).toBe(820);
    expect(parseDecimalToMinor('19.99', 'USD')).toBe(1999);
  });
});

describe('Stripe boundary', () => {
  it('lower-cases the currency', () => {
    expect(stripeCurrency('USD')).toBe('usd');
  });

  it('passes a valid amount through unchanged in both directions', () => {
    expect(toStripeAmount(12345, 'USD')).toBe(12345);
    expect(toStripeAmount(5000, 'JPY')).toBe(5000);
    expect(fromStripeAmount(5000, 'JPY')).toBe(5000);
  });

  it('refuses what Stripe would reject or mis-scale', () => {
    expect(() => toStripeAmount(1000, 'KWD')).toThrow(RangeError);
    expect(() => toStripeAmount(0, 'USD')).toThrow(RangeError);
    expect(() => toStripeAmount(-5, 'USD')).toThrow(RangeError);
    expect(() => toStripeAmount(10.5, 'USD')).toThrow(RangeError);
  });
});

describe('display formatting follows the same digits', () => {
  it('shows a zero-decimal amount without inventing cents', () => {
    const s = createFormatters('en').money({ amountMinor: 5000, currency: 'JPY' });
    expect(s).toMatch(/5,000/);
    expect(s).not.toMatch(/\./);
  });
});

describe('pickCurrency', () => {
  it('keeps a still-offered choice, whatever its case', () => {
    expect(pickCurrency('eur', ['USD', 'EUR'], 'USD')).toBe('EUR');
    expect(pickCurrency('EUR', ['USD', 'EUR'], 'USD')).toBe('EUR');
  });

  it('falls back to the default when the choice is gone, unknown or absent', () => {
    expect(pickCurrency('GBP', ['USD', 'EUR'], 'USD')).toBe('USD');
    expect(pickCurrency(null, ['USD', 'EUR'], 'USD')).toBe('USD');
    expect(pickCurrency(undefined, [], 'USD')).toBe('USD');
    expect(pickCurrency('  ', ['USD'], 'USD')).toBe('USD');
  });
});
