'use client';

import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Button, ThemeToggle } from '@carrental/ui';
import { CalendarClock, Car, Globe, LogIn, Luggage, Search, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CurrencySwitcher } from './currency-switcher';

export function SiteHeader({ locale }: { locale: string }) {
  const { t, setLocale, locales } = useI18n();
  const router = useRouter();
  const pathname = usePathname() || `/${locale}`;
  const { status } = useAuth();
  const authed = status === 'authenticated';
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const nav = [
    { href: `/${locale}`, label: t('nav.rentACar') },
    { href: `/${locale}/search`, label: t('action.search') },
    { href: `/${locale}/locations`, label: t('nav.locations') },
    { href: `/${locale}/trips`, label: t('nav.myTrips') },
    { href: `/${locale}/help`, label: t('nav.help') },
  ];

  const isActive = (href: string) =>
    href === `/${locale}` ? pathname === href : pathname.startsWith(href);

  function switchLocale(next: string) {
    setLocale(next);
    // the live enabled-locale set (DEC-024) — not just the launch three — so a dashboard-added
    // language strips cleanly from the path too
    const codes = locales.map((l) => l.code);
    const rest = pathname.replace(new RegExp(`^/(${codes.join('|')})`), '');
    // replace, not push: the old-locale page must not linger in history where Back (or a
    // reloaded tab) would drop the visitor straight back onto it.
    router.replace(`/${next}${rest || ''}`);
  }

  return (
    <>
      <header
        className={`sticky top-[var(--announcement-h,0px)] z-40 border-b transition-colors duration-200 print:hidden ${
          scrolled
            ? 'border-hairline bg-background/90 shadow-card backdrop-blur-md'
            : 'border-transparent bg-background/75 backdrop-blur-md'
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2 rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <span
              className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-brand-foreground shadow-card"
              aria-hidden="true"
            >
              <Car className="size-5" />
            </span>
            <span className="text-base tracking-tight text-ink">{t('app.name')}</span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(n.href) ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(n.href)
                    ? 'bg-brand/10 text-brand'
                    : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1 text-sm">
              <Globe className="size-4 text-ink-muted" aria-hidden="true" />
              <span className="sr-only">{t('lang.switcher.label')}</span>
              <select
                value={locale}
                onChange={(e) => switchLocale(e.target.value)}
                className="rounded-md border border-hairline bg-surface py-1 pe-6 ps-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label={t('lang.switcher.label')}
              >
                {locales.map((l) => (
                  <option key={l.code} value={l.code} className="bg-surface text-ink">
                    {l.nativeName}
                  </option>
                ))}
              </select>
            </label>
            <CurrencySwitcher />
            <ThemeToggle
              labels={{
                label: t('theme.label'),
                light: t('theme.light'),
                dark: t('theme.dark'),
                system: t('theme.system'),
                current: t('theme.current'),
              }}
            />
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={authed ? `/${locale}/account` : `/${locale}/sign-in`}
                aria-label={authed ? t('nav.account') : t('action.signIn')}
              >
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
            <Button size="sm" asChild className="hidden sm:inline-flex">
              <Link href={`/${locale}/search`}>
                <CalendarClock className="size-4" aria-hidden="true" />
                <span>{t('site.header.reserve')}</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Bottom nav on phones/tablets (design §4.1); the header nav takes over at `lg`. Kept a
          sibling of <header> so the header's backdrop-blur doesn't become its containing block. */}
      <nav
        aria-label="Primary"
        data-testid="mobile-bottom-nav"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-hairline bg-background/95 backdrop-blur lg:hidden"
      >
        {[
          { href: `/${locale}`, label: t('nav.rentACar'), Icon: Car },
          { href: `/${locale}/search`, label: t('action.search'), Icon: Search },
          { href: `/${locale}/trips`, label: t('nav.myTrips'), Icon: Luggage },
          {
            href: authed ? `/${locale}/account` : `/${locale}/sign-in`,
            label: authed ? t('nav.account') : t('action.signIn'),
            Icon: authed ? UserRound : LogIn,
          },
        ].map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2 text-xs transition-colors ${
                active ? 'text-brand' : 'text-ink-muted'
              }`}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
