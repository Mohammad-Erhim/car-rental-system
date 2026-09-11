/**
 * React bindings for i18n (SRS-I18N-009: switching preserves task/data/focus).
 * The provider keeps locale + resources; consumers get `t`, formatters, direction, and a setter.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_LOCALE,
  LOCALES,
  directionOf,
  resolveLocaleWithin,
  type Direction,
} from './config';
import { createFormatters, type Formatters } from './format';
import { BASE_RESOURCES } from './resources';
import { createTranslator, type MissingKeyEvent, type ResourceBundle } from './translator';

/** One switchable locale — from `GET /meta/locales` at runtime, or the compile-time list. */
export interface RuntimeLocale {
  code: string;
  nativeName: string;
  englishName: string;
  direction: Direction;
  /** Fallback chain (most-specific first), e.g. `['en']`. Omit to use the static default. */
  fallback?: string[];
}

export interface I18nContextValue {
  locale: string;
  direction: Direction;
  t: (key: string, params?: Record<string, unknown>) => string;
  fmt: Formatters;
  setLocale: (next: string) => void;
  /** The locales a user may switch to — runtime list when supplied, else the built-in three. */
  locales: RuntimeLocale[];
  /** Which locale a key resolves from (null if nowhere) — useful for fallback badges. */
  resolvedLocaleFor: (key: string) => string | null;
}

const STATIC_LOCALES: RuntimeLocale[] = Object.values(LOCALES).map((l) => ({
  code: l.code,
  nativeName: l.nativeName,
  englishName: l.englishName,
  direction: l.direction,
  fallback: l.fallback,
}));

/** Fallback chain for `code` against `locales`, ending at `defaultLocale`. Undefined when `code`
 *  isn't in `locales` at all — lets `createTranslator` fall through to its own static default. */
function chainFor(
  locales: RuntimeLocale[],
  code: string,
  defaultLocale: string,
): string[] | undefined {
  const def = locales.find((l) => l.code === code);
  if (!def) return undefined;
  const chain = [def.code, ...(def.fallback ?? [])];
  if (!chain.includes(defaultLocale)) chain.push(defaultLocale);
  return [...new Set(chain)];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: string;
  /** Extra/overriding resources merged over BASE_RESOURCES (e.g. fetched from the API). */
  resources?: ResourceBundle;
  /**
   * The enabled locales from `GET /meta/locales` — makes a dashboard-added language switchable
   * with no code change (DEC-024). Omit to use the compile-time three.
   */
  availableLocales?: RuntimeLocale[];
  /** Runtime default locale (from `/meta/locales`), used when a requested locale isn't enabled. */
  defaultLocale?: string;
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
  availableLocales,
  defaultLocale,
  onMissingKey,
  onLocaleChange,
}: I18nProviderProps) {
  const locales = availableLocales?.length ? availableLocales : STATIC_LOCALES;
  const codes = useMemo(() => locales.map((l) => l.code), [locales]);
  const rtDefault = defaultLocale && codes.includes(defaultLocale) ? defaultLocale : DEFAULT_LOCALE;

  const [locale, setLocaleState] = useState(() =>
    resolveLocaleWithin(initialLocale, codes, rtDefault),
  );
  // set once the user (or an actor-preference sync) explicitly chooses — after that we only
  // clamp a now-invalid locale down, never re-derive from `initialLocale`.
  const userChose = useRef(false);

  // The enabled set arrives async (`/meta/locales`) and can change later (a language is
  // deactivated). Until the user picks, keep honoring the original request against the current
  // set — so a page opened in a dashboard-added language lands there once the list loads. After
  // a pick, only pull back a locale that has since become invalid.
  useEffect(() => {
    const want = userChose.current
      ? codes.includes(locale)
        ? locale
        : resolveLocaleWithin(locale, codes, rtDefault)
      : resolveLocaleWithin(initialLocale, codes, rtDefault);
    if (want !== locale) {
      setLocaleState(want);
      onLocaleChange?.(want);
    }
  }, [codes, rtDefault, initialLocale, locale, onLocaleChange]);

  const currentDirection: Direction =
    locales.find((l) => l.code === locale)?.direction ?? directionOf(locale);

  const merged = useMemo(() => mergeResources(resources), [resources]);

  // A runtime (dashboard-added) locale isn't in the static `LOCALES` table `createTranslator`
  // would otherwise resolve against — pass its chain explicitly so it isn't silently collapsed
  // to `en` (DEC-024).
  const chain = useMemo(() => chainFor(locales, locale, rtDefault), [locales, locale, rtDefault]);

  const translator = useMemo(
    () =>
      createTranslator({
        locale,
        resources: merged,
        fallback: chain,
        onMissingKey,
        debugMissing: typeof process !== 'undefined' && process.env?.NODE_ENV === 'development',
      }),
    [locale, merged, chain, onMissingKey],
  );

  const fmt = useMemo(() => createFormatters(locale), [locale]);

  // Keep <html lang>/<dir> in sync with the active locale — on first mount too, not only when
  // the user switches (a page loaded straight into `ar` must be `dir="rtl"` for a11y + CSS).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.dir = currentDirection;
  }, [locale, currentDirection]);

  const setLocale = useCallback(
    (next: string) => {
      userChose.current = true;
      const resolved = resolveLocaleWithin(next, codes, rtDefault);
      setLocaleState(resolved);
      onLocaleChange?.(resolved);
    },
    [onLocaleChange, codes, rtDefault],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      direction: currentDirection,
      t: translator.t,
      fmt,
      setLocale,
      locales,
      resolvedLocaleFor: translator.resolvedLocaleFor,
    }),
    [locale, currentDirection, translator, fmt, setLocale, locales],
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
