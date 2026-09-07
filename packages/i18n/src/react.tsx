/**
 * React bindings for i18n (SRS-I18N-009: switching preserves task/data/focus).
 * The provider keeps locale + resources; consumers get `t`, formatters, direction, and a setter.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { directionOf, resolveLocale, type Direction } from './config';
import { createFormatters, type Formatters } from './format';
import { BASE_RESOURCES } from './resources';
import { createTranslator, type MissingKeyEvent, type ResourceBundle } from './translator';

export interface I18nContextValue {
  locale: string;
  direction: Direction;
  t: (key: string, params?: Record<string, unknown>) => string;
  fmt: Formatters;
  setLocale: (next: string) => void;
  /** Which locale a key resolves from (null if nowhere) — useful for fallback badges. */
  resolvedLocaleFor: (key: string) => string | null;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: string;
  /** Extra/overriding resources merged over BASE_RESOURCES (e.g. fetched from the API). */
  resources?: ResourceBundle;
  onMissingKey?: (event: MissingKeyEvent) => void;
  onLocaleChange?: (locale: string) => void;
}

function mergeResources(extra?: ResourceBundle): ResourceBundle {
  if (!extra) return BASE_RESOURCES;
  const out: ResourceBundle = {};
  const locales = new Set([...Object.keys(BASE_RESOURCES), ...Object.keys(extra)]);
  for (const loc of locales) {
    out[loc] = { ...(BASE_RESOURCES[loc] ?? {}), ...(extra[loc] ?? {}) };
  }
  return out;
}

export function I18nProvider({
  children,
  initialLocale,
  resources,
  onMissingKey,
  onLocaleChange,
}: I18nProviderProps) {
  const [locale, setLocaleState] = useState(() => resolveLocale(initialLocale));

  const merged = useMemo(() => mergeResources(resources), [resources]);

  const translator = useMemo(
    () =>
      createTranslator({
        locale,
        resources: merged,
        onMissingKey,
        debugMissing: typeof process !== 'undefined' && process.env?.NODE_ENV === 'development',
      }),
    [locale, merged, onMissingKey],
  );

  const fmt = useMemo(() => createFormatters(locale), [locale]);

  const setLocale = useCallback(
    (next: string) => {
      const resolved = resolveLocale(next);
      setLocaleState(resolved);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = resolved;
        document.documentElement.dir = directionOf(resolved);
      }
      onLocaleChange?.(resolved);
    },
    [onLocaleChange],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      direction: directionOf(locale),
      t: translator.t,
      fmt,
      setLocale,
      resolvedLocaleFor: translator.resolvedLocaleFor,
    }),
    [locale, translator, fmt, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}

export function useFormatters(): Formatters {
  return useI18n().fmt;
}
