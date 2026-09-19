import { createQueryClient } from '@carrental/client';
import { AuthProvider } from '@carrental/client/react';
import type { ResourceBundle } from '@carrental/i18n';
import { I18nProvider } from '@carrental/i18n/react';
import { ThemeProvider } from '@carrental/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { Toaster } from '../components/ui/sonner.js';
import { useMetaLocales, usePublishedCommonTranslations } from '../lib/api-hooks.js';
import { usePublishedBranding } from '../lib/branding-hooks.js';
import { detectInitialLocale, storeLocale } from '../lib/locale-storage.js';
import { LocationScopeProvider } from '../lib/location-scope.js';
import { StepUpProvider } from '../lib/step-up.js';

const MISSING_KEYS = new Set<string>();

/** Feeds the published brand/theme config (DEC-025) into the shared ThemeProvider. */
function BrandedThemeProvider({ children }: { children: ReactNode }) {
  const branding = usePublishedBranding();
  return (
    <ThemeProvider defaultTheme="system" brand={branding.data?.config ?? null}>
      {children}
    </ThemeProvider>
  );
}

/**
 * Feeds the runtime locale list (`/meta/locales`) and published `common` translation overrides
 * (`/meta/translations`) into the shared I18nProvider — so a language added from the dashboard is
 * switchable, and a string published from the Translations screen shows up here, with no code
 * change (DEC-024). Before those load, the provider uses its built-in three.
 */
function I18nBoundary({ children }: { children: ReactNode }) {
  const meta = useMetaLocales();
  const initialLocale = useMemo(() => detectInitialLocale() ?? undefined, []);
  const [activeLocale, setActiveLocale] = useState(() => detectInitialLocale() ?? 'en');
  const overrides = usePublishedCommonTranslations(activeLocale);

  const availableLocales = useMemo(
    () =>
      meta.data?.locales.map((l) => ({
        code: l.code,
        nativeName: l.nativeName,
        englishName: l.englishName,
        direction: l.direction,
        fallback: l.fallback,
      })),
    [meta.data],
  );

  const resources = useMemo<ResourceBundle | undefined>(() => {
    const o = overrides.data;
    return o && Object.keys(o).length ? { [activeLocale]: o } : undefined;
  }, [overrides.data, activeLocale]);

  const onLocaleChange = useCallback((loc: string) => {
    storeLocale(loc);
    setActiveLocale(loc);
  }, []);

  return (
    <I18nProvider
      initialLocale={initialLocale}
      availableLocales={availableLocales}
      defaultLocale={meta.data?.defaultLocale}
      resources={resources}
      onLocaleChange={onLocaleChange}
      onMissingKey={({ key, locale }) => {
        const id = `${locale}:${key}`;
        if (!MISSING_KEYS.has(id)) {
          MISSING_KEYS.add(id);
          // Observable to developers/operators (SRS-I18N-005) without breaking the UI.

          console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
        }
      }}
    >
      {children}
    </I18nProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <BrandedThemeProvider>
        <I18nBoundary>
          <AuthProvider>
            <LocationScopeProvider>
              <StepUpProvider>{children}</StepUpProvider>
              <Toaster richColors closeButton position="top-right" />
            </LocationScopeProvider>
          </AuthProvider>
        </I18nBoundary>
      </BrandedThemeProvider>
    </QueryClientProvider>
  );
}
