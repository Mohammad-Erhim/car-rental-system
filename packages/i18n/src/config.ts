/**
 * Locale configuration (SRS-I18N-001, FR-GBL-002/003, DEC-020).
 *
 * The *real* launch locale list is unconfirmed business configuration (BR-028). These entries
 * are the development/test profile and are marked non-production. The backend `config` module is
 * the runtime source of truth for enabled locales; this file is the static fallback used by the
 * build, tests, and the very first paint before the API responds.
 */

export type Direction = 'ltr' | 'rtl';

export interface LocaleDefinition {
  /** BCP-47 code — stable, language-neutral identifier. Never localized. */
  code: string;
  /** Endonym shown in the language switcher (SRS §21.1 SRC-LANGUAGE-LOCALE). */
  nativeName: string;
  /** English name for admin surfaces. */
  englishName: string;
  direction: Direction;
  /** Ordered fallback chain, most-specific first, ending at the default. */
  fallback: string[];
  /** Marks a non-production development/test locale (DEC-020). */
  testOnly: boolean;
}

export const DEFAULT_LOCALE = 'en';

export const LOCALES: Record<string, LocaleDefinition> = {
  en: {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    direction: 'ltr',
    fallback: [],
    testOnly: false,
  },
  fr: {
    code: 'fr',
    nativeName: 'Français',
    englishName: 'French',
    direction: 'ltr',
    fallback: ['en'],
    testOnly: false,
  },
  ar: {
    code: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
    direction: 'rtl',
    fallback: ['en'],
    testOnly: false,
  },
};

export const SUPPORTED_LOCALE_CODES = Object.keys(LOCALES);

export function isSupportedLocale(code: string | null | undefined): boolean {
  return !!code && Object.prototype.hasOwnProperty.call(LOCALES, code);
}

/** Resolve a requested locale to a supported one, else the default. */
export function resolveLocale(requested: string | null | undefined): string {
  const raw = typeof requested === 'string' ? requested.trim() : '';
  if (isSupportedLocale(raw)) return raw;
  // try language part of a region tag, e.g. "en-GB" -> "en"
  const lang = raw.split('-')[0] ?? '';
  if (isSupportedLocale(lang)) return lang;
  return DEFAULT_LOCALE;
}

/**
 * Resolve a requested locale against a runtime-provided allow-list (the enabled locales from
 * `GET /meta/locales`) rather than the compile-time `LOCALES`. Used so a language added from the
 * dashboard is switchable with no code change (DEC-024). Falls back to `fallback` (the runtime
 * default), then the language part of a region tag, then the static default.
 */
export function resolveLocaleWithin(
  requested: string | null | undefined,
  allowed: readonly string[],
  fallback: string = DEFAULT_LOCALE,
): string {
  const set = new Set(allowed.length ? allowed : SUPPORTED_LOCALE_CODES);
  const raw = typeof requested === 'string' ? requested.trim() : '';
  if (set.has(raw)) return raw;
  const lang = raw.split('-')[0] ?? '';
  if (set.has(lang)) return lang;
  return set.has(fallback)
    ? fallback
    : (SUPPORTED_LOCALE_CODES.find((c) => set.has(c)) ?? DEFAULT_LOCALE);
}

/** Always returns a definition — resolves unknown codes to the default. */
export function getLocaleDefinition(code: string): LocaleDefinition {
  return LOCALES[resolveLocale(code)] ?? LOCALES[DEFAULT_LOCALE]!;
}

const definitionOf = getLocaleDefinition;

/** Full fallback chain for a locale, always ending at DEFAULT_LOCALE. */
export function fallbackChain(code: string): string[] {
  const def = definitionOf(code);
  const chain = [def.code, ...def.fallback];
  if (!chain.includes(DEFAULT_LOCALE)) chain.push(DEFAULT_LOCALE);
  return [...new Set(chain)];
}

export function directionOf(code: string): Direction {
  return definitionOf(code).direction;
}
