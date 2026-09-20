import type { I18nContextValue } from '@carrental/i18n/react';

/**
 * Shows a code the way a person would say it. A translated label wins; a code we have no text for
 * ("reasonCode", "no_show") is made readable ("Reason code", "No show") instead of leaking as-is.
 */
export type LabelI18n = Pick<I18nContextValue, 't' | 'resolvedLocaleFor'>;

export function humanize(code: string): string {
  const words = code
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function labelFor({ t, resolvedLocaleFor }: LabelI18n, key: string, code: string): string {
  return resolvedLocaleFor(key) === null ? humanize(code) : t(key);
}
