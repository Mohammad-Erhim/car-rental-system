'use client';

import { getLocaleDefinition, SUPPORTED_LOCALE_CODES } from '@carrental/i18n';
import { useI18n } from '@carrental/i18n/react';
import { Button, ThemeToggle } from '@carrental/ui';
import { Car, Globe, LogIn, Luggage, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '../lib/auth-context';
import { ACTIVE_LOCALES } from '../lib/i18n';

export function SiteHeader({ locale }: { locale: string }) {
  const { t, setLocale } = useI18n();
  const router = useRouter();
  const pathname = usePathname() || `/${locale}`;
  const { status } = useAuth();
  const authed = status === 'authenticated';

  const nav = [
    { href: `/${locale}`, label: t('nav.rentACar') },
    { href: `/${locale}/search`, label: t('action.search') },
    { href: `/${locale}/trips`, label: t('nav.myTrips') },
    { href: `/${locale}/help`, label: t('nav.help') },
  ];

  function switchLocale(next: string) {
    setLocale(next);
    const rest = pathname.replace(new RegExp(`^/(${ACTIVE_LOCALES.join('|')})`), '');
    router.push(`/${next}${rest || ''}`);
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <Link href={`/${locale}`} className="flex items-center gap-2 font-semibold">
          <Car className="size-6 text-primary" aria-hidden="true" />
          <span>{t('app.name')}</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <label className="flex items-center gap-1 text-sm">
            <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{t('lang.switcher.label')}</span>
            <select
              value={locale}
              onChange={(e) => switchLocale(e.target.value)}
              className="rounded-md border-0 bg-transparent py-1 pe-6 text-sm focus-visible:outline-none"
              aria-label={t('lang.switcher.label')}
            >
              {SUPPORTED_LOCALE_CODES.filter((c) => ACTIVE_LOCALES.includes(c)).map((c) => (
                <option key={c} value={c}>
                  {getLocaleDefinition(c).nativeName}
                </option>
              ))}
            </select>
          </label>
          <ThemeToggle
            labels={{
              label: t('theme.label'),
              light: t('theme.light'),
              dark: t('theme.dark'),
              system: t('theme.system'),
              current: t('theme.current'),
            }}
          />
          <Button variant="outline" size="sm" asChild>
            <Link href={authed ? `/${locale}/account` : `/${locale}/sign-in`}>
              {authed ? (
                <UserRound className="size-4" aria-hidden="true" />
              ) : (
                <LogIn className="size-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {authed ? t('nav.account') : t('action.signIn')}
              </span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Bottom nav on phones/tablets (design §4.1); the header nav takes over from `sm` up. */}
      <nav
        aria-label="Primary"
        data-testid="mobile-bottom-nav"
        className="grid grid-cols-4 border-t bg-background sm:hidden"
      >
        {[
          { href: `/${locale}`, label: t('nav.rentACar'), Icon: Car },
          { href: `/${locale}/search`, label: t('action.search'), Icon: Globe },
          { href: `/${locale}/trips`, label: t('nav.myTrips'), Icon: Luggage },
          {
            href: authed ? `/${locale}/account` : `/${locale}/sign-in`,
            label: authed ? t('nav.account') : t('action.signIn'),
            Icon: authed ? UserRound : LogIn,
          },
        ].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-1 py-2 text-xs text-muted-foreground"
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
