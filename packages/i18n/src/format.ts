/**
 * Locale-aware formatting (SRS-I18N-007). All formatters take machine values (ISO strings,
 * integer minor units + currency code) and never mutate the underlying data.
 */

import { resolveLocale } from './config';
import { minorUnitDigits } from './currency';

export { minorUnitDigits };

export interface Money {
  /** Integer minor units (SRS-DAT-003). e.g. 1299 = 12.99 for a 2-decimal currency. */
  amountMinor: number;
  /** ISO 4217 code, e.g. "USD". Stable; display locale never changes it. */
  currency: string;
}

export function minorToMajor(money: Money): number {
  return money.amountMinor / 10 ** minorUnitDigits(money.currency);
}

export interface Formatters {
  date(iso: string | Date, opts?: Intl.DateTimeFormatOptions): string;
  time(iso: string | Date, opts?: Intl.DateTimeFormatOptions): string;
  dateTime(iso: string | Date, opts?: Intl.DateTimeFormatOptions): string;
  /** Formats a wall-clock instant in a specific IANA zone, and always names the zone. */
  zonedDateTime(iso: string | Date, timeZone: string, opts?: Intl.DateTimeFormatOptions): string;
  number(value: number, opts?: Intl.NumberFormatOptions): string;
  /** Formats integer-minor-unit money in its own currency. */
  money(money: Money, opts?: Intl.NumberFormatOptions): string;
  percent(fraction: number, opts?: Intl.NumberFormatOptions): string;
  list(items: string[], opts?: Intl.ListFormatOptions): string;
  relativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): string;
}

/** A dashboard-added locale (DEC-024) isn't in the static `LOCALES` table `resolveLocale` checks
 *  against, but the JS engine's own ICU data can format it perfectly well — collapsing every
 *  runtime-enabled locale beyond the compile-time en/fr/ar down to `en`'s date/number/currency
 *  conventions would silently misformat for every one of them. Trust the caller's locale (in
 *  `react.tsx` it has already been resolved against the runtime-enabled set) as long as it's a
 *  well-formed BCP-47 tag the runtime actually recognizes; only genuinely invalid input falls
 *  back to the static resolver.
 */
function resolveFormattingLocale(localeInput: string): string {
  try {
    const [canonical] = Intl.getCanonicalLocales(localeInput);
    if (canonical) return canonical;
  } catch {
    // not a well-formed BCP-47 tag — fall through to the static default below
  }
  return resolveLocale(localeInput);
}

export function createFormatters(localeInput: string): Formatters {
  const locale = resolveFormattingLocale(localeInput);
  const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

  return {
    date: (v, opts) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', ...opts }).format(toDate(v)),
    time: (v, opts) =>
      new Intl.DateTimeFormat(locale, { timeStyle: 'short', ...opts }).format(toDate(v)),
    dateTime: (v, opts) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', ...opts }).format(
        toDate(v),
      ),
    zonedDateTime: (v, timeZone, opts) => {
      // Explicit components: `dateStyle`/`timeStyle` cannot be combined with `timeZoneName`.
      const base: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone,
        timeZoneName: 'short',
        ...opts,
      };
      return new Intl.DateTimeFormat(locale, base).format(toDate(v));
    },
    number: (value, opts) => new Intl.NumberFormat(locale, opts).format(value),
    money: (money, opts) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: money.currency,
        ...opts,
      }).format(minorToMajor(money)),
    percent: (fraction, opts) =>
      new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1, ...opts }).format(
        fraction,
      ),
    list: (items, opts) =>
      new Intl.ListFormat(locale, { style: 'long', type: 'conjunction', ...opts }).format(items),
    relativeTime: (value, unit) =>
      new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit),
  };
}
