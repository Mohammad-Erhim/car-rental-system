'use client';

import { configureClient, createQueryClient } from '@carrental/client';
import { AuthProvider } from '@carrental/client/react';
import type { ConsentConfig } from '@carrental/contracts';
import { I18nProvider, useI18n } from '@carrental/i18n/react';
import { ThemeProvider, ToastProvider, UiStringsProvider } from '@carrental/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import type { Branding } from '../lib/branding';
import { ConsentProvider } from '../lib/consent';
import type { Messages } from '../lib/i18n';

// Browser calls hit the same-origin `/api/v1` proxy (next.config rewrites, DEC-021).
configureClient({ baseUrl: '/api/v1', correlationPrefix: 'site' });

/** Client providers for the public site: i18n context, theme (light/dark + brand), react-query. */
export function Providers({
  locale,
  messages,
  branding,
  consent,
  children,
}: {
  locale: string;
  messages: Messages;
  branding: Branding;
  consent: ConsentConfig;
  children: ReactNode;
}) {
  const [qc] = useState(createQueryClient);

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
              <ConsentProvider locale={locale} config={consent}>
                <LocalisedUiStrings>{children}</LocalisedUiStrings>
              </ConsentProvider>
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
