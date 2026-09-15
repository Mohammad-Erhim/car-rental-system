import type { LocalesResponse } from '@carrental/contracts';
import {
  I18nProvider as SharedI18nProvider,
  useI18n,
  type RuntimeLocale,
} from '@carrental/i18n/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import { useEffect, useState, type ReactNode } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiFetch } from '../api/api-fetch';

import { MOBILE_RESOURCES } from './mobile-resources';

const LOCALE_KEY = 'carrental.locale.v1';

/**
 * RN counterpart of the web `I18nProvider` wiring in `apps/site`'s root layout: fetches the
 * runtime-enabled locale list (`GET /meta/locales`, DEC-024 — a language added from the ops
 * dashboard is switchable with no app release), falls back to the device locale on first launch,
 * and persists the user's explicit choice. `@carrental/i18n/react`'s `I18nProvider` itself is
 * 100% reused — it's DOM-free except for a guarded `document` check that's simply a no-op here.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [initialLocale, setInitialLocale] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY).then((saved) => {
      setInitialLocale(saved ?? Localization.getLocales()[0]?.languageCode ?? null);
    });
  }, []);

  const localesQuery = useQuery({
    queryKey: ['meta', 'locales'],
    queryFn: ({ signal }) => apiFetch<LocalesResponse>('/meta/locales', { signal, anonymous: true }),
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
  // `apps/site`'s `fetchOverrides`. Merged over the bundled base + the mobile-only additions
  // below, so a dashboard edit reaches the app without a store release.
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

  // Wait for the persisted/device locale read before mounting the shared provider so it doesn't
  // briefly resolve to `en`, apply RTL layout for nothing, then flip once the real value loads.
  if (initialLocale === undefined) return null;

  const resources = {
    ...MOBILE_RESOURCES,
    [activeLocale]: {
      ...(MOBILE_RESOURCES[activeLocale] ?? {}),
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
      <RtlSync>{children}</RtlSync>
    </SharedI18nProvider>
  );
}

/**
 * RN mirrors CSS `dir` with a native layout-direction flag (`I18nManager.forceRTL`) that only
 * takes effect after the JS runtime restarts — unlike the web provider's
 * `document.documentElement.dir`, which flips instantly. Rather than force a silent, jarring
 * reload mid-session, surface a small dismissible banner so the switch to/from Arabic asks first.
 */
function RtlSync({ children }: { children: ReactNode }) {
  const { direction, t } = useI18n();
  const insets = useSafeAreaInsets();
  const mismatch = I18nManager.isRTL !== (direction === 'rtl');
  const [dismissed, setDismissed] = useState(false);

  if (!mismatch || dismissed) return children;

  const restart = async () => {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(direction === 'rtl');
    try {
      await Updates.reloadAsync();
    } catch {
      // Expo Go / no update runtime available — the flag is set for next natural relaunch.
      setDismissed(true);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {children}
      <View style={[styles.banner, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.bannerText}>{t('mobile.restartForLanguage')}</Text>
        <View style={styles.bannerActions}>
          <Pressable onPress={() => setDismissed(true)} hitSlop={8}>
            <Text style={styles.bannerLink}>{t('mobile.later')}</Text>
          </Pressable>
          <Pressable onPress={restart} hitSlop={8}>
            <Text style={[styles.bannerLink, styles.bannerLinkStrong]}>
              {t('mobile.restartNow')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Fixed dark colors, not theme tokens: `<ThemeProvider>` is mounted *inside* `<I18nProvider>`
// (the app layout — theme resolution reads a persisted locale-independent preference, but the
// nesting is what it is), so `useTheme()` isn't reachable from here. A fixed dark surface
// regardless of app theme also matches the native convention for this kind of transient banner
// (Android's Snackbar is dark-on-light by default too, independent of host theme).
const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  bannerText: { color: '#F9FAFB', fontSize: 13, lineHeight: 18 },
  bannerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  bannerLink: { color: '#D1D5DB', fontSize: 13, fontWeight: '600' },
  bannerLinkStrong: { color: '#4ADE80' },
});
