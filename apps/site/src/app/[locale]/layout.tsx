import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Providers } from '../../components/providers';
import { SiteFooter } from '../../components/site-footer';
import { SiteHeader } from '../../components/site-header';
import { brandingCss, getBranding } from '../../lib/branding';
import { fontClassName } from '../../lib/fonts';
import { ACTIVE_LOCALES, getMessages, getT, isSupportedLocale, localeDir } from '../../lib/i18n';

export function generateStaticParams() {
  return ACTIVE_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  if (!isSupportedLocale(locale) || !ACTIVE_LOCALES.includes(locale)) notFound();

  const [messages, branding, t] = await Promise.all([
    getMessages(locale),
    getBranding(),
    getT(locale),
  ]);
  const dir = localeDir(locale);

  return (
    <html lang={locale} dir={dir} data-density={branding.config.density} suppressHydrationWarning>
      <head>
        {/* SSR brand-token overlay (DEC-025) — applied before first paint, no FOUC */}
        <style
          id="carrental-brand-tokens"
          dangerouslySetInnerHTML={{ __html: brandingCss(branding) }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=localStorage.getItem('carrental.theme')||'system';var d=s==='dark'||(s==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';r.dataset.density=${JSON.stringify(branding.config.density)};}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`flex min-h-screen flex-col bg-background text-foreground ${fontClassName(
          branding.config.font,
        )}`}
      >
        <Providers locale={locale} messages={messages} branding={branding}>
          <a href="#main" className="skip-link">
            {t.t('common.skipToContent')}
          </a>
          <SiteHeader locale={locale} />
          <main
            id="main"
            className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-24 md:py-12 lg:pb-12"
          >
            {children}
          </main>
          <SiteFooter locale={locale} />
        </Providers>
      </body>
    </html>
  );
}
