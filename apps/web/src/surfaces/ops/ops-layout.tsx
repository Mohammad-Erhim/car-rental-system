import { useI18n } from '@carrental/i18n/react';
import { Button } from '@carrental/ui';
import {
  BarChart3,
  CarFront,
  ClipboardList,
  LayoutDashboard,
  Settings2,
  Wallet,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import { LanguageSwitcher } from '../../components/language-switcher.js';
import { SystemStatus } from '../../components/system-status.js';

/**
 * APP-OPS shell (design §4.2 / §7.3). Left navigation on desktop, collapses to a top bar on
 * narrow screens. Scope bar (COMP-OPS-001) is stubbed until STAGE-001 auth lands.
 */
const NAV = [
  { to: '/ops', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/ops/work', label: 'Work', Icon: ClipboardList, end: false },
  { to: '/ops/fleet', label: 'Fleet', Icon: CarFront, end: false },
  { to: '/ops/finance', label: 'Finance', Icon: Wallet, end: false },
  { to: '/ops/config', label: 'Configuration', Icon: Settings2, end: false },
  { to: '/ops/insights', label: 'Insights', Icon: BarChart3, end: false },
];

export function OpsLayout() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen bg-muted/30">
      <a href="#ops-main" className="skip-link">
        Skip to main content
      </a>

      <aside className="hidden w-60 shrink-0 border-e bg-background lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-2 border-b px-4 font-semibold">
          <LayoutDashboard className="size-5 text-primary" aria-hidden="true" />
          {t('app.ops.name')}
        </div>
        <nav aria-label="Sections" className="flex-1 space-y-1 p-2">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background px-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded bg-muted px-2 py-1 font-medium">Scope: Demo Rental Co.</span>
            <span className="hidden text-muted-foreground sm:inline">All locations</span>
          </div>
          <div className="flex items-center gap-2">
            <SystemStatus />
            <LanguageSwitcher />
            <Button variant="outline" size="sm" asChild>
              <NavLink to="/ops/sign-in">{t('action.signIn')}</NavLink>
            </Button>
          </div>
        </header>

        {/* narrow-screen section nav */}
        <nav
          aria-label="Sections"
          className="flex gap-1 overflow-x-auto border-b bg-background px-2 py-2 lg:hidden"
        >
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ${
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                }`
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <main id="ops-main" className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
