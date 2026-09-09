import { createQueryClient } from '@carrental/client';
import { AuthProvider } from '@carrental/client/react';
import { BASE_RESOURCES, SUPPORTED_LOCALE_CODES } from '@carrental/i18n';
import { I18nProvider, useI18n } from '@carrental/i18n/react';
import { ThemeProvider, ToastProvider, UiStringsProvider } from '@carrental/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';

import { usePublishedBranding } from '../lib/branding-hooks.js';
import { detectInitialLocale, storeLocale } from '../lib/locale-storage.js';
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

/** Localises the micro-copy the shared `packages/ui` components render themselves. */
function LocalisedUiStrings({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <UiStringsProvider value={{ optional: t('field.optional') }}>{children}</UiStringsProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const initialLocale = useMemo(() => detectInitialLocale(SUPPORTED_LOCALE_CODES) ?? undefined, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrandedThemeProvider>
        <I18nProvider
          initialLocale={initialLocale}
          resources={BASE_RESOURCES}
          onLocaleChange={storeLocale}
          onMissingKey={({ key, locale }) => {
            const id = `${locale}:${key}`;
            if (!MISSING_KEYS.has(id)) {
              MISSING_KEYS.add(id);
              // Observable to developers/operators (SRS-I18N-005) without breaking the UI.

              console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
            }
          }}
        >
          <LocalisedUiStrings>
            <AuthProvider>
              <ToastProvider>
                <StepUpProvider>{children}</StepUpProvider>
              </ToastProvider>
            </AuthProvider>
          </LocalisedUiStrings>
        </I18nProvider>
      </BrandedThemeProvider>
    </QueryClientProvider>
  );
}
