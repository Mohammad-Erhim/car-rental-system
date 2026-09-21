/**
 * The one place that knows how a currency behaves (SRS-DAT-003, DEC-036).
 *
 * Money everywhere in the system is an integer in the currency's *minor unit*. How many decimal
 * digits that minor unit has is a property of the currency, not of the system: 1299 is 12.99 USD
 * but 1299 JPY. Every "÷ 100" in the code base is a bug the day a zero-decimal currency is
 * enabled, so every conversion — display, form input, server message, the amount sent to Stripe —
 * goes through this module instead.
 *
 * `SUPPORTED_CURRENCIES` is the curated catalogue an operator picks from when enabling a currency
 * in the dashboard (Settings → Currencies). It is deliberately limited to currencies where
 * our minor unit and Stripe's smallest unit are the same number, so an amount never needs
 * rescaling on its way to the processor. Left out on purpose:
 *   - three-decimal currencies (BHD, JOD, KWD, OMR, TND) — Stripe only accepts amounts that are a
 *     multiple of 10 there, which would need rounding at price time;
 *   - Stripe's special cases (ISK, UGX, HUF, TWD) — quoted in two decimals on Stripe's side even
 *     though ISO says otherwise.
 * Adding one later is a catalogue edit plus a rounding rule, not a hunt through the app.
 */

export interface CurrencyDefinition {
  /** ISO-4217 alphabetic code, upper case — the stable key stored everywhere. */
  code: string;
  /** English name, the default label when the currency is first enabled. Localised names come
   *  from the reference-data translations (server) or `Intl.DisplayNames` (clients). */
  name: string;
  /** decimal digits in the minor unit: 0 for JPY, 2 for USD */
  digits: 0 | 2;
}

const two = (code: string, name: string): CurrencyDefinition => ({ code, name, digits: 2 });
const zero = (code: string, name: string): CurrencyDefinition => ({ code, name, digits: 0 });

export const SUPPORTED_CURRENCIES: readonly CurrencyDefinition[] = [
  two('USD', 'US Dollar'),
  two('EUR', 'Euro'),
  two('GBP', 'Pound Sterling'),
  two('AED', 'UAE Dirham'),
  two('CAD', 'Canadian Dollar'),
  two('AUD', 'Australian Dollar'),
  two('NZD', 'New Zealand Dollar'),
  two('CHF', 'Swiss Franc'),
  two('SEK', 'Swedish Krona'),
  two('NOK', 'Norwegian Krone'),
  two('DKK', 'Danish Krone'),
  two('PLN', 'Polish Zloty'),
  two('CZK', 'Czech Koruna'),
  two('RON', 'Romanian Leu'),
  two('BGN', 'Bulgarian Lev'),
  two('TRY', 'Turkish Lira'),
  two('ZAR', 'South African Rand'),
  two('SAR', 'Saudi Riyal'),
  two('QAR', 'Qatari Riyal'),
  two('EGP', 'Egyptian Pound'),
  two('MAD', 'Moroccan Dirham'),
  two('ILS', 'Israeli New Shekel'),
  two('INR', 'Indian Rupee'),
  two('MXN', 'Mexican Peso'),
  two('BRL', 'Brazilian Real'),
  two('SGD', 'Singapore Dollar'),
  two('HKD', 'Hong Kong Dollar'),
  two('MYR', 'Malaysian Ringgit'),
  two('THB', 'Thai Baht'),
  two('PHP', 'Philippine Peso'),
  two('CNY', 'Chinese Yuan'),
  zero('JPY', 'Japanese Yen'),
  zero('KRW', 'South Korean Won'),
  zero('VND', 'Vietnamese Dong'),
  zero('CLP', 'Chilean Peso'),
];

const BY_CODE = new Map(SUPPORTED_CURRENCIES.map((c) => [c.code, c]));

const normalise = (code: string) => code.trim().toUpperCase();

export function getCurrency(code: string): CurrencyDefinition | undefined {
  return BY_CODE.get(normalise(code));
}

/** Whether `code` is one an operator may enable (and Stripe can charge without rescaling). */
export function isSupportedCurrency(code: string): boolean {
  return BY_CODE.has(normalise(code));
}

/**
 * Decimal digits in a currency's minor unit. Catalogue currencies answer from the table; any
 * other ISO code that already exists in old data (a currency retired from the catalogue, an
 * imported plan) asks the runtime's ICU data rather than guessing 2 — a wrong guess would show
 * a Kuwaiti dinar amount off by a factor of ten.
 */
export function minorUnitDigits(currency: string): number {
  const known = BY_CODE.get(normalise(currency));
  if (known) return known.digits;
  try {
    const d = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: normalise(currency),
    }).resolvedOptions().maximumFractionDigits;
    return d ?? 2;
  } catch {
    return 2;
  }
}

/**
 * An integer amount in minor units as a plain decimal string — "12.99", "1299" for JPY — using
 * integer arithmetic only (no float rounding, no `toFixed`). For form inputs, CSV cells and
 * server-side sentences; use the locale formatters for anything a customer reads.
 */
export function minorToDecimalString(amountMinor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  const negative = amountMinor < 0;
  const abs = Math.abs(Math.trunc(amountMinor));
  if (digits === 0) return `${negative ? '-' : ''}${abs}`;
  const factor = 10 ** digits;
  const whole = Math.floor(abs / factor);
  const frac = String(abs % factor).padStart(digits, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** "12.99 USD" — the plain sentence form used in server messages and audit summaries. */
export function formatMinorPlain(amountMinor: number, currency: string): string {
  return `${minorToDecimalString(amountMinor, currency)} ${normalise(currency)}`;
}

/**
 * Parses what a person typed into a money field ("12", "12.5", "12.50") into integer minor units,
 * or `null` when it is not a valid non-negative amount for that currency — including more
 * decimals than the currency has ("12.505" USD, "12.5" JPY), which is rejected rather than
 * silently rounded. No floating-point arithmetic, so 0.1 + 0.2 style drift cannot creep in.
 */
export function parseDecimalToMinor(input: string, currency: string): number | null {
  const s = input.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const digits = minorUnitDigits(currency);
  const frac = m[2] ?? '';
  if (frac.length > digits) return null;
  const minor = Number(m[1] + frac.padEnd(digits, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Stripe wants the currency lower-case. */
export function stripeCurrency(currency: string): string {
  return normalise(currency).toLowerCase();
}

/**
 * The amount to send to Stripe. For every catalogue currency Stripe's smallest unit *is* our
 * minor unit, so this is the identity — but it is the single gate: a currency outside the
 * catalogue, or a non-positive / non-integer amount, throws here instead of producing a charge
 * Stripe would reject halfway through checkout (or, worse, accept at the wrong scale).
 */
export function toStripeAmount(amountMinor: number, currency: string): number {
  if (!isSupportedCurrency(currency)) {
    throw new RangeError(`currency ${currency} is not chargeable through Stripe`);
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new RangeError(`invalid Stripe amount ${amountMinor}`);
  }
  return amountMinor;
}

/** The inverse of `toStripeAmount`, for amounts Stripe reports back (webhooks). */
export function fromStripeAmount(stripeAmount: number, _currency: string): number {
  return stripeAmount;
}

/**
 * The currency a customer should see prices in, given what they chose before (a cookie, a saved
 * preference), what is currently on offer, and the business default. A stale choice — a currency
 * that has since been disabled or has nothing priced in it — quietly resolves to the default
 * rather than leaving the customer on a currency that no longer sells.
 */
export function pickCurrency(
  preferred: string | null | undefined,
  offered: readonly string[],
  defaultCode: string,
): string {
  const want = preferred?.trim().toUpperCase();
  if (want && offered.some((c) => c.toUpperCase() === want)) return want;
  return defaultCode;
}
