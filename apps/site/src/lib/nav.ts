/**
 * Locale-aware routing helpers for `apps/site`. Every customer route is under `/[locale]/…`;
 * these keep the prefix in one place.
 */
'use client';

import { useI18n } from '@carrental/i18n/react';
import { useParams } from 'next/navigation';

import { ACTIVE_LOCALES, DEFAULT_LOCALE } from './i18n';

/** Current locale from the route params, guaranteed to be an active locale — checked against
 *  the *runtime* `/meta/locales` set (via the already-fetched `I18nProvider` context) so a
 *  dashboard-added language round-trips through path-building helpers correctly (DEC-024). */
export function useLocale(): string {
  const p = useParams();
  const { locales } = useI18n();
  const raw = Array.isArray(p.locale) ? p.locale[0] : p.locale;
  return raw && locales.some((l) => l.code === raw) ? raw : DEFAULT_LOCALE;
}

/** Prefix a `/…` app path with the given locale. `href('en', '/account')` → `/en/account`. */
export function localePath(locale: string, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

/** Strip a leading `/{locale}` from a path, returning the locale-agnostic remainder. */
export function stripLocale(path: string): string {
  return path.replace(new RegExp(`^/(${ACTIVE_LOCALES.join('|')})(?=/|$)`), '') || '/';
}
