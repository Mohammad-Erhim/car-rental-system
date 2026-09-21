import { describe, expect, it } from 'vitest';

import { CURRENCY_COOKIE, parseCurrencyCookie } from './currency-cookie';

describe('parseCurrencyCookie', () => {
  it('reads the currency out of a cookie string, upper-cased', () => {
    expect(parseCurrencyCookie(`a=1; ${CURRENCY_COOKIE}=eur; b=2`)).toBe('EUR');
    expect(parseCurrencyCookie(`${CURRENCY_COOKIE}=GBP`)).toBe('GBP');
  });

  it('ignores anything that is not a three-letter code', () => {
    for (const bad of ['', 'EURO', 'E1R', '12', '<script>']) {
      expect(parseCurrencyCookie(`${CURRENCY_COOKIE}=${bad}`)).toBeUndefined();
    }
  });

  it('survives a malformed cookie instead of throwing', () => {
    expect(parseCurrencyCookie(`${CURRENCY_COOKIE}=%E0%A4%A`)).toBeUndefined();
  });

  it('is undefined when there is no cookie, or a different one', () => {
    expect(parseCurrencyCookie(undefined)).toBeUndefined();
    expect(parseCurrencyCookie('')).toBeUndefined();
    expect(parseCurrencyCookie('carrental.locale=fr')).toBeUndefined();
  });
});
