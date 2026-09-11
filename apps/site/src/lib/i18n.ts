import type { LocaleInfo, LocalesResponse } from '@carrental/contracts';
import {
  BASE_RESOURCES,
  createTranslator,
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALES,
  resolveLocale,
  resolveLocaleWithin,
  type Direction,
  type ResourceBundle,
} from '@carrental/i18n';

import { apiGet } from './api';

export { DEFAULT_LOCALE, isSupportedLocale, resolveLocale };

/** Build-time fallback (DEC-024) — used only as a last resort while `/meta/locales` is
 *  unreachable, and as the `generateStaticParams` seed list (a locale added later still renders:
 *  Next's `dynamicParams` defaults to true for anything outside this list). The DB is the
 *  runtime source of truth everywhere else on this site. */
const BUILD_TIME_LOCALES: LocaleInfo[] = Object.values(LOCALES)
  .filter((l) => !l.testOnly)
  .map((l) => ({
    code: l.code,
    nativeName: l.nativeName,
    englishName: l.englishName,
    direction: l.direction,
    isDefault: l.code === DEFAULT_LOCALE,
    fallback: l.fallback,
    testOnly: l.testOnly,
  }));
const BUILD_TIME_RESPONSE: LocalesResponse = {
  defaultLocale: DEFAULT_LOCALE,
  locales: BUILD_TIME_LOCALES,
};

export const ACTIVE_LOCALES: string[] = BUILD_TIME_LOCALES.map((l) => l.code);

let cache: { data: LocalesResponse; at: number } | null = null;
const RUNTIME_LOCALES_TTL_MS = 30_000;

/**
 * The live enabled-locale set from `GET /meta/locales` (DEC-024) — a language added/activated
 * from `/ops/config/languages` becomes routable, switchable, and rendered here within
 * {@link RUNTIME_LOCALES_TTL_MS}, with no site rebuild. Falls back to the build-time three-locale
 * bundle if the API is unreachable, so a transient outage never breaks routing for the launch
 * languages. A small hand-rolled TTL (rather than relying on `fetch`'s Data Cache) because this
 * is also called from the Edge `middleware`, where that cache isn't guaranteed to apply.
 */
export async function getRuntimeLocales(): Promise<LocalesResponse> {
  const now = Date.now();
  if (cache && now - cache.at < RUNTIME_LOCALES_TTL_MS) return cache.data;
  try {
    const data = await apiGet<LocalesResponse>('/meta/locales', { revalidate: 30 });
    if (data.locales.length) {
      cache = { data, at: now };
      return data;
    }
  } catch {
    // API unreachable — fall through to the last good cache, else the build-time list
  }
  return cache?.data ?? BUILD_TIME_RESPONSE;
}

function findRuntimeLocale(list: LocaleInfo[], code: string): LocaleInfo {
  return (
    list.find((l) => l.code === code) ??
    list.find((l) => l.code === code.split('-')[0]) ??
    list.find((l) => l.isDefault) ??
    list[0]!
  );
}

/** Full fallback chain for `code` against the runtime list, always ending at that list's
 *  default locale. Mirrors `@carrental/i18n`'s static `fallbackChain`, but locale-info comes from
 *  `/meta/locales` so a dashboard-added language resolves to itself, not to `en`. */
function runtimeFallbackChain(runtime: LocalesResponse, code: string): string[] {
  const def = findRuntimeLocale(runtime.locales, code);
  const chain = [def.code, ...def.fallback];
  if (!chain.includes(runtime.defaultLocale)) chain.push(runtime.defaultLocale);
  return [...new Set(chain)];
}

export type Messages = ResourceBundle;

/** Visitor's last-active / preferred locale. Only decides which locale a locale-less path
 *  (`/` → `/{loc}`) resolves to — a path that already carries a locale always wins, and the
 *  middleware just refreshes this to match. */
export const LOCALE_COOKIE = 'carrental.locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Persist the visitor's locale (client-only) — mirrors what the middleware writes. Takes the
 *  already-resolved code as-is (the caller — `I18nProvider`'s `onLocaleChange` — resolves it
 *  against the runtime locale set); re-resolving here against the static three would collapse a
 *  dashboard-added language back to English. */
export function persistLocaleChoice(locale: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
}

/** Published translation overrides from the catalogue, merged over the bundled base. Cached. */
async function fetchOverrides(locale: string): Promise<Record<string, string>> {
  try {
    // public endpoint — published `common` overrides merged over the bundled base (DEC-024)
    return await apiGet<Record<string, string>>(
      `/meta/translations?namespace=common&locale=${locale}`,
      { revalidate: 300 },
    );
  } catch {
    return {};
  }
}

/** Merged resource bundle for a locale — bundled base + published catalogue overrides, resolved
 *  against the *runtime* locale set so a dashboard-added language isn't collapsed to English. */
export async function getMessages(locale: string): Promise<Messages> {
  const runtime = await getRuntimeLocales();
  const codes = runtime.locales.map((l) => l.code);
  const loc = resolveLocaleWithin(locale, codes, runtime.defaultLocale);
  const overrides = await fetchOverrides(loc);
  const merged: Messages = {};
  for (const l of Object.keys(BASE_RESOURCES)) merged[l] = { ...(BASE_RESOURCES[l] ?? {}) };
  merged[loc] = { ...(merged[loc] ?? {}), ...overrides };
  return merged;
}

/** Server-side translator for a locale (React Server Components — no context needed). Passes
 *  the *runtime* fallback chain explicitly so a dashboard-added language resolves to itself
 *  (falling through to the runtime default for any not-yet-translated key) instead of being
 *  silently collapsed to `en` by `createTranslator`'s static default (DEC-024). */
export async function getT(locale: string) {
  const runtime = await getRuntimeLocales();
  const codes = runtime.locales.map((l) => l.code);
  const loc = resolveLocaleWithin(locale, codes, runtime.defaultLocale);
  const resources = await getMessages(loc);
  return createTranslator({ locale: loc, resources, fallback: runtimeFallbackChain(runtime, loc) });
}

/** Text direction for `code` against the runtime locale list. */
export async function localeDir(locale: string): Promise<Direction> {
  const runtime = await getRuntimeLocales();
  return findRuntimeLocale(runtime.locales, locale).direction;
}
