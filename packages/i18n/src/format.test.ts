import { describe, expect, it } from 'vitest';

import { createFormatters, minorToMajor, minorUnitDigits } from './format';

/** ASCII digits only — Intl may render `ar` amounts in Arabic-Indic digits (ICU-version dependent). */
function asciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
}

describe('i18n formatters (SRS-I18N-007)', () => {
  it('money uses integer minor units and the transaction currency, regardless of display locale', () => {
    const money = { amountMinor: 129900, currency: 'USD' };
    expect(minorUnitDigits('USD')).toBe(2);
    expect(minorToMajor(money)).toBe(1299);

    const en = createFormatters('en').money(money);
    const fr = createFormatters('fr').money(money);
    const ar = createFormatters('ar').money(money);
    // Different formatting, same currency token / amount.
    expect(en).toMatch(/\$|USD/);
    expect(fr).toMatch(/\$US|USD/);
    expect(ar).toMatch(/US\$|USD|‏/);
    for (const s of [en, fr, ar]) expect(asciiDigits(s)).toContain('1299');
  });

  it('handles zero-decimal and 3-decimal currencies', () => {
    expect(minorUnitDigits('JPY')).toBe(0);
    expect(minorToMajor({ amountMinor: 5000, currency: 'JPY' })).toBe(5000);
    expect(minorUnitDigits('KWD')).toBe(3);
    expect(minorToMajor({ amountMinor: 1234, currency: 'KWD' })).toBe(1.234);
  });

  it('zonedDateTime always names the time zone', () => {
    const s = createFormatters('en').zonedDateTime('2026-06-01T12:00:00Z', 'America/New_York');
    expect(s).toMatch(/EDT|GMT-4|-04/);
  });

  it('number formatting follows locale separators', () => {
    expect(createFormatters('en').number(1234567.89)).toBe('1,234,567.89');
    const fr = createFormatters('fr').number(1234567.89);
    // fr-FR uses narrow no-break space as grouping separator
    expect(fr.replace(/[\s\u00a0\u202f]/g, '')).toBe('1234567,89');
  });
});
