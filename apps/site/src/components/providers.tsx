'use client';

import { configureClient, createQueryClient } from '@carrental/client';
import { AuthProvider } from '@carrental/client/react';
import type { ConsentConfig, LocalesResponse } from '@carrental/contracts';
import { I18nProvider, useI18n } from '@carrental/i18n/react';
import { ThemeProvider, ToastProvider, UiStringsProvider } from '@carrental/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';

import type { Branding } from '../lib/branding';
import { ConsentProvider } from '../lib/consent';
import { persistLocaleChoice, type Messages } from '../lib/i18n';

// Browser calls hit the same-origin `/api/v1` proxy (next.config rewrites, DEC-021).
configureClient({ baseUrl: '/api/v1', correlationPrefix: 'site' });

/** Client providers for the public site: i18n context, theme (light/dark + brand), react-query. */
export function Providers({
  locale,
  locales,
  messages,
  branding,
  consent,
  children,
}: {
  locale: string;
  /** The live `/meta/locales` response fetched server-side (DEC-024) — feeds the switcher and
   *  the translator's runtime fallback chain so a dashboard-added language actually works here. */
  locales: LocalesResponse;
  messages: Messages;
  branding: Branding;
  consent: ConsentConfig;
  children: ReactNode;
}) {
  const [qc] = useState(createQueryClient);
  const availableLocales = useMemo(
    () =>
      locales.locales.map((l) => ({
        code: l.code,
        nativeName: l.nativeName,
        englishName: l.englishName,
        direction: l.direction,
        fallback: l.fallback,
      })),
    [locales.locales],
  );

  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider defaultTheme="system" brand={branding.config}>
        <I18nProvider
          initialLocale={locale}
          availableLocales={availableLocales}
          defaultLocale={locales.defaultLocale}
          resources={messages}
          onLocaleChange={persistLocaleChoice}
        >
          {/* followActorLocale=false: the `/{locale}/…` URL owns the language here, so a signed-in
              customer viewing /ar stays on Arabic even if their account default is English. */}
          <AuthProvider followActorLocale={false}>
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
