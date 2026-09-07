import { BASE_RESOURCES, SUPPORTED_LOCALE_CODES } from '@carrental/i18n';
import { I18nProvider } from '@carrental/i18n/react';
import { ThemeProvider, ToastProvider } from '@carrental/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';

import { AuthProvider } from '../lib/auth.js';
import { detectInitialLocale, storeLocale } from '../lib/locale-storage.js';
import { createQueryClient } from '../lib/query.js';

const MISSING_KEYS = new Set<string>();

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const initialLocale = useMemo(() => detectInitialLocale(SUPPORTED_LOCALE_CODES) ?? undefined, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system">
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
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
