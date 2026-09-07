import {
  BASE_RESOURCES,
  createTranslator,
  DEFAULT_LOCALE,
  directionOf,
  isSupportedLocale,
  LOCALES,
  resolveLocale,
  type ResourceBundle,
} from '@carrental/i18n';

import { apiGet } from './api';

export { DEFAULT_LOCALE, directionOf, isSupportedLocale, resolveLocale };

/** Active launch locales (DEC-024). `meta/locales` is authoritative at runtime; this is the
 *  build-time list for `generateStaticParams`, `<hreflang>`, and the middleware. */
export const ACTIVE_LOCALES: string[] = Object.values(LOCALES)
  .filter((l) => !l.testOnly)
  .map((l) => l.code);

export type Messages = ResourceBundle;

/** Published translation overrides from the catalogue, merged over the bundled base. Cached. */
async function fetchOverrides(locale: string): Promise<Record<string, string>> {
  try {
    const rows = await apiGet<Array<{ key: string; translation: string | null; status: string }>>(
      `/config/translations?namespace=common&locale=${locale}`,
      { revalidate: 300 },
    );
    const out: Record<string, string> = {};
    for (const r of rows ?? []) {
      if (r.translation && r.status === 'published') out[r.key] = r.translation;
    }
    return out;
  } catch {
    return {};
  }
}

/** Merged resource bundle for a locale — bundled base + published catalogue overrides. */
export async function getMessages(locale: string): Promise<Messages> {
  const loc = resolveLocale(locale);
  const overrides = await fetchOverrides(loc);
  const merged: Messages = {};
  for (const l of Object.keys(BASE_RESOURCES)) merged[l] = { ...(BASE_RESOURCES[l] ?? {}) };
  merged[loc] = { ...(merged[loc] ?? {}), ...overrides };
  return merged;
}

/** Server-side translator for a locale (React Server Components — no context needed). */
export async function getT(locale: string) {
  const loc = resolveLocale(locale);
  const resources = await getMessages(loc);
  return createTranslator({ locale: loc, resources });
}

export function localeDir(locale: string): 'ltr' | 'rtl' {
  return directionOf(resolveLocale(locale));
}
