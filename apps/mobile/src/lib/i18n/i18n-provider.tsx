import type { LocalesResponse } from '@carrental/contracts';
import {
  I18nProvider as SharedI18nProvider,
  type RuntimeLocale,
} from '@carrental/i18n/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import * as Localization from 'expo-localization';
import { useEffect, useState, type ReactNode } from 'react';

import { apiFetch } from '../api/api-fetch';

import { ONBOARDING_FALLBACK } from './onboarding-fallback';

const LOCALE_KEY = 'carrental.locale.v1';
const MOBILE_NS_CACHE_PREFIX = 'carrental.i18n.mobile.v1.';

/**
 * RN counterpart of the web `I18nProvider` wiring in `apps/site`'s root layout: fetches the
 * runtime-enabled locale list (`GET /meta/locales`, DEC-024 — a language added from the ops
 * dashboard is switchable with no app release), falls back to the device locale on first launch,
 * and persists the user's explicit choice. `@carrental/i18n/react`'s `I18nProvider` itself is
 * 100% reused — it's DOM-free except for a guarded `document` check that's simply a no-op here.
 */
export function I18nProvider({
  children,
  onReady,
}: {
  children: ReactNode;
  /** Fires once the persisted/device locale read resolves — see `ThemeProvider`'s identical
   *  contract in `theme-provider.tsx`, which `RootLayout` waits on alongside this one. */
  onReady?: () => void;
}) {
  const [initialLocale, setInitialLocale] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY).then((saved) => {
      setInitialLocale(saved ?? Localization.getLocales()[0]?.languageCode ?? null);
      onReady?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount, not on every onReady identity change
  }, []);

  const localesQuery = useQuery({
    queryKey: ['meta', 'locales'],
    queryFn: ({ signal }) =>
      apiFetch<LocalesResponse>('/meta/locales', { signal, anonymous: true }),
    staleTime: 5 * 60 * 1000,
  });

  const availableLocales: RuntimeLocale[] | undefined = localesQuery.data?.locales.map((l) => ({
    code: l.code,
    nativeName: l.nativeName,
    englishName: l.englishName,
    direction: l.direction,
    fallback: l.fallback,
  }));

  // The locale actually rendering right now: the user's explicit in-session choice (via
  // `onLocaleChange`, a real event) once made, else derived from `initialLocale` as it resolves —
  // a plain derived value rather than state-synced-from-state, so there's no effect needed here.
  const [userChosenLocale, setUserChosenLocale] = useState<string | null>(null);
  const activeLocale = userChosenLocale ?? initialLocale ?? 'en';

  // Published translation overrides from the ops dashboard's catalogue (DEC-024) — mirrors
  // `apps/site`'s `fetchOverrides`. Merged over the shared bundled base, so a dashboard edit
  // reaches the app without a store release.
  const overridesQuery = useQuery({
    queryKey: ['meta', 'translations', 'common', activeLocale],
    queryFn: ({ signal }) =>
      apiFetch<Record<string, string>>(
        `/meta/translations?namespace=common&locale=${encodeURIComponent(activeLocale)}`,
        { signal, anonymous: true },
      ),
    enabled: !!activeLocale,
    staleTime: 5 * 60 * 1000,
  });

  // Mobile-only strings (RTL relaunch, onboarding, push/biometric priming, …) have no static
  // bundle at all — unlike `common`, they exist only in the `translation` table under the
  // `mobile` namespace (seeded from apps/api/src/database/seed/mobile-i18n.ts) and are fetched
  // the same way `common`'s overrides are. A last-fetched copy is cached to disk so a warm start
  // (or a brief network blip) doesn't fall through to `@carrental/i18n`'s humanised-key fallback
  // (e.g. "Get started") while the request is in flight.
  // Tagged with the locale it was read for, rather than reset to null on locale change, so the
  // effect never needs a synchronous setState of its own — a cache from the previous locale is
  // simply ignored below until the new locale's read resolves.
  const [cachedMobileNs, setCachedMobileNs] = useState<{
    locale: string;
    data: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    if (!activeLocale) return;
    let cancelled = false;
    AsyncStorage.getItem(MOBILE_NS_CACHE_PREFIX + activeLocale).then((raw) => {
      if (cancelled || !raw) return;
      try {
        setCachedMobileNs({
          locale: activeLocale,
          data: JSON.parse(raw) as Record<string, string>,
        });
      } catch {
        /* ignore corrupt cache */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeLocale]);

  const mobileNsCache = cachedMobileNs?.locale === activeLocale ? cachedMobileNs.data : null;

  const mobileNsQuery = useQuery({
    queryKey: ['meta', 'translations', 'mobile', activeLocale],
    queryFn: ({ signal }) =>
      apiFetch<Record<string, string>>(
        `/meta/translations?namespace=mobile&locale=${encodeURIComponent(activeLocale)}`,
        { signal, anonymous: true },
      ),
    enabled: !!activeLocale,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (mobileNsQuery.data && activeLocale) {
      void AsyncStorage.setItem(
        MOBILE_NS_CACHE_PREFIX + activeLocale,
        JSON.stringify(mobileNsQuery.data),
      );
    }
  }, [mobileNsQuery.data, activeLocale]);

  // Wait for the persisted/device locale read before mounting the shared provider so it doesn't
  // briefly resolve to `en`, apply RTL layout for nothing, then flip once the real value loads.
  if (initialLocale === undefined) return null;

  const resources = {
    [activeLocale]: {
      ...(ONBOARDING_FALLBACK[activeLocale] ?? {}),
      ...(mobileNsCache ?? {}),
      ...(mobileNsQuery.data ?? {}),
      ...(overridesQuery.data ?? {}),
    },
  };

  return (
    <SharedI18nProvider
      initialLocale={initialLocale ?? undefined}
      availableLocales={availableLocales}
      defaultLocale={localesQuery.data?.defaultLocale}
      resources={resources}
      onLocaleChange={(next) => {
        setUserChosenLocale(next);
        void AsyncStorage.setItem(LOCALE_KEY, next);
      }}
    >
      {children}
    </SharedI18nProvider>
  );
}
