'use client';

import { I18nProvider, useI18n } from '@carrental/i18n/react';
import { ThemeProvider, ToastProvider, UiStringsProvider } from '@carrental/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AuthProvider } from '../lib/auth-context';
import type { Branding } from '../lib/branding';
import type { Messages } from '../lib/i18n';

/** Client providers for the public site: i18n context, theme (light/dark + brand), react-query. */
export function Providers({
  locale,
  messages,
  branding,
  children,
}: {
  locale: string;
  messages: Messages;
  branding: Branding;
  children: ReactNode;
}) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );

  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider defaultTheme="system" brand={branding.config}>
        <I18nProvider
          initialLocale={locale}
          resources={messages}
          onLocaleChange={(l) => {
            document.cookie = `carrental.locale=${l};path=/;max-age=${60 * 60 * 24 * 365}`;
          }}
        >
          <AuthProvider>
            <ToastProvider>
              <LocalisedUiStrings>{children}</LocalisedUiStrings>
            </ToastProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** Localises the micro-copy the shared `packages/ui` components render themselves. */
function LocalisedUiStrings({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <UiStringsProvider value={{ optional: t('field.optional') }}>{children}</UiStringsProvider>
  );
}
