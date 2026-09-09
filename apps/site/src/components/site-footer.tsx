'use client';

import { useI18n } from '@carrental/i18n/react';
import { Car } from 'lucide-react';
import Link from 'next/link';

import { openCookiePreferences } from '../lib/consent';

export function SiteFooter({ locale }: { locale: string }) {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  const columns: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
    {
      title: t('site.footer.exploreTitle'),
      links: [
        { href: `/${locale}/search`, label: t('action.search') },
        { href: `/${locale}#fleet`, label: t('site.footer.browseFleet') },
        { href: `/${locale}/locations`, label: t('site.footer.findLocation') },
        { href: `/${locale}/trips`, label: t('nav.myTrips') },
      ],
    },
    {
      title: t('site.footer.supportTitle'),
      links: [
        { href: `/${locale}/help`, label: t('site.footer.helpCentre') },
        { href: `/${locale}/help`, label: t('nav.help') },
      ],
    },
    {
      title: t('site.footer.legalTitle'),
      links: [
        { href: `/${locale}/legal/terms`, label: t('site.footer.terms') },
        { href: `/${locale}/legal/privacy`, label: t('site.footer.privacy') },
        { href: `/${locale}/legal/cookies`, label: t('site.footer.cookies') },
      ],
    },
  ];

  return (
    <footer className="border-t border-hairline bg-surface-muted">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2 font-semibold">
              <span
                className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-brand-foreground shadow-card"
                aria-hidden="true"
              >
                <Car className="size-5" />
              </span>
              <span className="text-ink">{t('app.name')}</span>
            </div>
            <p className="mt-3 text-sm text-ink-muted">{t('site.footer.tagline')}</p>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title} className="text-sm">
              <h2 className="font-semibold text-ink">{col.title}</h2>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={`${col.title}-${l.label}`}>
                    <Link
                      href={l.href}
                      className="text-ink-muted transition-colors hover:text-brand"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-hairline pt-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {year} {t('app.name')}. {t('site.footer.rights')}
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              type="button"
              onClick={openCookiePreferences}
              className="underline underline-offset-2 transition-colors hover:text-brand"
            >
              {t('site.footer.cookieSettings')}
            </button>
            <span>{t('site.footer.demoNote')}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
