import { useI18n } from '@carrental/i18n/react';
import { Button, ThemeToggle } from '@carrental/ui';
import {
  BarChart3,
  CarFront,
  ClipboardList,
  Database,
  KeyRound,
  Languages,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings2,
  Tag,
  Users,
  Wallet,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import { LanguageSwitcher } from '../../components/language-switcher.js';
import { SystemStatus } from '../../components/system-status.js';
import { useAuth } from '../../lib/auth.js';

/**
 * APP-OPS shell (design §4.2 / §7.3). Left navigation on desktop, collapses to a top bar on
 * narrow screens. Nav items are filtered by permission — a section a user cannot open does not
 * appear (design §3.1).
 */
interface NavItem {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
  end?: boolean;
  anyOf?: string[];
}

const NAV: NavItem[] = [
  { to: '/ops', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  {
    to: '/ops/work',
    label: 'Reservations',
    Icon: ClipboardList,
    anyOf: ['reservation.read', 'reservation.modify'],
  },
  {
    to: '/ops/rentals',
    label: 'Rentals',
    Icon: KeyRound,
    anyOf: ['rental.read', 'rental.pickup', 'rental.return'],
  },
  { to: '/ops/fleet', label: 'Fleet', Icon: CarFront, anyOf: ['fleet.read', 'fleet.manage'] },
  { to: '/ops/finance', label: 'Finance', Icon: Wallet, anyOf: ['payment.read'] },
  {
    to: '/ops/config/reference-data',
    label: 'Reference data',
    Icon: Database,
    anyOf: ['config.read', 'lookup.manage'],
  },
  {
    to: '/ops/config/rate-plans',
    label: 'Rate plans',
    Icon: Tag,
    anyOf: ['config.read', 'config.publish'],
  },
  {
    to: '/ops/config',
    label: 'Configuration',
    Icon: Settings2,
    anyOf: ['config.read', 'config.publish'],
  },
  {
    to: '/ops/config/translations',
    label: 'Translations',
    Icon: Languages,
    anyOf: ['config.read', 'config.publish'],
  },
  { to: '/ops/admin/staff', label: 'Staff & roles', Icon: Users, anyOf: ['staff.manage'] },
  { to: '/ops/insights', label: 'Reports', Icon: BarChart3, anyOf: ['report.read'] },
  { to: '/ops/audit', label: 'Audit log', Icon: ScrollText, anyOf: ['audit.read'] },
];

export function OpsLayout() {
  const { t } = useI18n();
  const { status, actor, signOut, hasPermission } = useAuth();
  const authed = status === 'authenticated' && actor?.kind === 'staff';

  const visible = NAV.filter((n) => !n.anyOf || (authed && hasPermission(...n.anyOf)));

  const navClass = (isActive: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    }`;

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
          {(authed ? visible : []).map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => navClass(isActive)}>
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background px-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded bg-muted px-2 py-1 font-medium">
              {actor?.organizationId ? 'Scope: Demo Rental Co.' : 'Operations Console'}
            </span>
            {authed ? (
              <span className="hidden text-muted-foreground sm:inline">
                {actor?.locationScope.length
                  ? `${actor.locationScope.length} location(s)`
                  : 'All locations'}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <SystemStatus />
            <ThemeToggle
              labels={{
                label: t('theme.label'),
                light: t('theme.light'),
                dark: t('theme.dark'),
                system: t('theme.system'),
                current: t('theme.current'),
              }}
            />
            <LanguageSwitcher />
            {authed ? (
              <>
                <span className="hidden text-sm font-medium sm:inline">{actor?.displayName}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void signOut()}
                  aria-label={t('action.signOut')}
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('action.signOut')}</span>
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <NavLink to="/ops/sign-in">{t('action.signIn')}</NavLink>
              </Button>
            )}
          </div>
        </header>

        {authed ? (
          <nav
            aria-label="Sections"
            className="flex gap-1 overflow-x-auto border-b bg-background px-2 py-2 lg:hidden"
          >
            {visible.map(({ to, label, Icon, end }) => (
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
        ) : null}

        <main id="ops-main" className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
