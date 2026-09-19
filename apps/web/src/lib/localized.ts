import type { Localized } from '@carrental/contracts';

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
