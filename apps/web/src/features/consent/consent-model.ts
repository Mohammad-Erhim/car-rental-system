import type { ConsentConfig, Localized } from '@carrental/contracts';

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export type CookieRow = ConsentConfig['cookieTable'][number];

/** The text of a localized value in one language ('' when that language has none). */
export const localizedGet = (value: Localized | undefined, locale: string): string =>
  (value as Record<string, string | undefined> | undefined)?.[locale] ?? '';

/**
 * Set one language of a localized value. English is required and always kept; another language
 * that is emptied is removed, so the site falls back to English for it.
 */
export function localizedSet(
  value: Localized | undefined,
  locale: string,
  text: string,
): Localized {
  const base = { ...(value ?? { en: '' }) } as Record<string, string | undefined>;
  if (locale === 'en') base.en = text;
  else if (text) base[locale] = text;
  else delete base[locale];
  return base as unknown as Localized;
}

export const newCookieRow = (): CookieRow => ({
  name: '',
  provider: '',
  category: 'necessary',
  purpose: { en: '' },
  duration: '',
});

/** Human-readable list of what is wrong with a config, one line per problem. */
export function issueLines(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`);
}

/** How many of a localized value's languages are filled in. */
export const translatedCount = (value: Localized | undefined, locales: string[]) =>
  locales.filter((l) => localizedGet(value, l).trim() !== '').length;
