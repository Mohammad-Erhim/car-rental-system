import { useI18n } from '@carrental/i18n/react';
import { Button, ThemeToggle } from '@carrental/ui';
import {
  BarChart3,
  CarFront,
  ClipboardList,
  Database,
  ExternalLink,
  KeyRound,
  Languages,
  LayoutDashboard,
  LogOut,
  Palette,
  ScrollText,
  Search,
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
 *
 * Routing note (DEC-023): this router runs with `basename: '/ops'`, so every `to` here is
 * written WITHOUT the `/ops` prefix — React Router adds it. The public site is a separate origin
 * ({@link SITE_URL}); the "view site" link is a real navigation out of this SPA.
 */
interface NavItem {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
  end?: boolean;
  anyOf?: string[];
}

interface NavGroup {
  /** i18n key for the section heading; omit for the top (un-headed) group */
  titleKey?: string;
  items: NavItem[];
}

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || '/';

/**
 * Grouped navigation (design §4.2 — clear hierarchy). Groups: daily operations, the catalogue a
 * manager tunes, system configuration, and administration. Items are still permission-filtered;
 * a group with nothing visible is not rendered.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ to: '/', label: 'ops.nav.dashboard', Icon: LayoutDashboard, end: true }],
  },
  {
    titleKey: 'ops.navGroup.operations',
    items: [
      {
        to: '/work',
        label: 'ops.nav.reservations',
        Icon: ClipboardList,
        anyOf: ['reservation.read', 'reservation.modify'],
      },
      {
        to: '/rentals',
        label: 'ops.nav.rentals',
        Icon: KeyRound,
        anyOf: ['rental.read', 'rental.pickup', 'rental.return'],
      },
      {
        to: '/fleet',
        label: 'ops.nav.fleet',
        Icon: CarFront,
        anyOf: ['fleet.read', 'fleet.manage'],
      },
      { to: '/finance', label: 'ops.nav.finance', Icon: Wallet, anyOf: ['payment.read'] },
    ],
  },
  {
    titleKey: 'ops.navGroup.catalogue',
    items: [
      {
        to: '/config/reference-data',
        label: 'ops.nav.referenceData',
        Icon: Database,
        anyOf: ['config.read', 'lookup.manage'],
      },
      {
        to: '/config/rate-plans',
        label: 'ops.nav.ratePlans',
        Icon: Tag,
        anyOf: ['config.read', 'config.publish'],
      },
    ],
  },
  {
    titleKey: 'ops.navGroup.configuration',
    items: [
      {
        to: '/config',
        label: 'ops.nav.configuration',
        Icon: Settings2,
        end: true,
        anyOf: ['config.read', 'config.publish'],
      },
      {
        to: '/config/languages',
        label: 'ops.nav.languages',
        Icon: Languages,
        anyOf: ['config.read', 'config.publish'],
      },
      {
        to: '/config/translations',
        label: 'ops.nav.translations',
        Icon: Languages,
        anyOf: ['config.read', 'config.publish'],
      },
      {
        to: '/config/branding',
        label: 'ops.nav.branding',
        Icon: Palette,
        anyOf: ['config.read', 'config.publish'],
      },
      {
        to: '/config/seo',
        label: 'ops.nav.seo',
        Icon: Search,
        anyOf: ['config.read', 'config.publish'],
      },
    ],
  },
  {
    titleKey: 'ops.navGroup.administration',
    items: [
      { to: '/admin/staff', label: 'ops.nav.staff', Icon: Users, anyOf: ['staff.manage'] },
      { to: '/insights', label: 'ops.nav.reports', Icon: BarChart3, anyOf: ['report.read'] },
      { to: '/audit', label: 'ops.nav.audit', Icon: ScrollText, anyOf: ['audit.read'] },
    ],
  },
];

export function OpsLayout() {
  const { t } = useI18n();
  const { status, actor, signOut, hasPermission } = useAuth();
  const authed = status === 'authenticated' && actor?.kind === 'staff';

  const canSee = (n: NavItem) => !n.anyOf || (authed && hasPermission(...n.anyOf));
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter(
    (g) => g.items.length > 0,
  );
  const flatItems = groups.flatMap((g) => g.items);

  const navClass = (isActive: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    }`;

  return (
    <div className="flex min-h-screen bg-muted/30">
      <a href="#ops-main" className="skip-link">
        {t('common.skipToContent')}
      </a>

      {/* Desktop sidebar — only for an authenticated staff session (the sign-in / recovery
          screens render a bare centred card). Pinned to the viewport; the nav list scrolls. */}
      {authed ? (
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-e bg-background lg:flex">
          <NavLink
            to="/"
            className="flex h-16 shrink-0 items-center gap-2 border-b px-4 font-semibold"
          >
            <LayoutDashboard className="size-5 text-primary" aria-hidden="true" />
            {t('app.ops.name')}
          </NavLink>
          <nav aria-label={t('ops.nav.sections')} className="flex-1 space-y-4 overflow-y-auto p-2">
            {groups.map((g, gi) => (
              <div key={g.titleKey ?? `g${gi}`} className="space-y-1">
                {g.titleKey ? (
                  <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {t(g.titleKey)}
                  </p>
                ) : null}
                {g.items.map(({ to, label, Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => navClass(isActive)}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {t(label)}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="shrink-0 border-t p-2">
            <a
              href={SITE_URL}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {t('ops.nav.viewSite')}
            </a>
          </div>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b bg-background px-3 sm:px-4">
          <div className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
            <span className="rounded bg-muted px-2 py-1 font-medium">
              {actor?.organizationId
                ? t('ops.header.scope', { name: 'Demo Rental Co.' })
                : t('ops.header.console')}
            </span>
            {authed ? (
              <span className="hidden text-muted-foreground sm:inline">
                {actor?.locationScope.length
                  ? t('ops.header.locations', { n: actor.locationScope.length })
                  : t('ops.header.allLocations')}
              </span>
            ) : null}
          </div>
          <div className="flex shrink items-center gap-1 sm:gap-2">
            <a
              href={SITE_URL}
              className="hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground sm:inline-flex"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="hidden md:inline">{t('ops.nav.viewSite')}</span>
            </a>
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
                <NavLink to="/sign-in">{t('action.signIn')}</NavLink>
              </Button>
            )}
          </div>
        </header>

        {authed ? (
          <nav
            aria-label={t('ops.nav.sections')}
            className="flex gap-1 overflow-x-auto border-b bg-background px-2 py-2 lg:hidden"
          >
            {flatItems.map(({ to, label, Icon, end }) => (
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
                {t(label)}
              </NavLink>
            ))}
            <a
              href={SITE_URL}
              className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {t('ops.nav.viewSite')}
            </a>
          </nav>
        ) : null}

        <main id="ops-main" className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
