import { useI18n } from '@carrental/i18n/react';
import { Button } from '@carrental/ui';
import { Car, LifeBuoy, Luggage, UserRound } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import { LanguageSwitcher } from '../../components/language-switcher.js';
import { SystemStatus } from '../../components/system-status.js';

/**
 * APP-CWEB shell (design §4.1 / §7.1). Responsive: header nav on wide screens, bottom nav on
 * phones. `<main id="main">` is the skip-link target.
 */
export function CustomerLayout() {
  const { t } = useI18n();

  const links = [
    { to: '/', label: t('nav.rentACar'), Icon: Car, end: true },
    { to: '/trips', label: t('nav.myTrips'), Icon: Luggage, end: false },
    { to: '/help', label: t('nav.help'), Icon: LifeBuoy, end: false },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-2 sm:gap-4">
          <NavLink
            to="/"
            className="flex shrink-0 items-center gap-2 whitespace-nowrap font-semibold"
          >
            <Car className="size-6 shrink-0 text-primary" aria-hidden="true" />
            <span className="hidden sm:inline">{t('app.name')}</span>
          </NavLink>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {links.map(({ to, label, Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`
                }
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <SystemStatus />
            <LanguageSwitcher />
            <Button variant="outline" size="sm" asChild>
              <NavLink to="/account">
                <UserRound className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('nav.account')}</span>
              </NavLink>
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="container flex-1 py-6 md:py-10">
        <Outlet />
      </main>

      {/* Bottom nav on phones (design §4.1) */}
      <nav
        aria-label="Primary"
        className="sticky bottom-0 z-40 grid grid-cols-3 border-t bg-background md:hidden"
      >
        {links.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2 text-xs ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <footer className="hidden border-t py-6 text-center text-xs text-muted-foreground md:block">
        {t('app.name')} — demo environment
      </footer>
    </div>
  );
}
