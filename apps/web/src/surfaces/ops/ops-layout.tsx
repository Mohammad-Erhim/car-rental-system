import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Button, ThemeToggle } from '@carrental/ui';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BarChart3,
  Car,
  CarFront,
  ClipboardList,
  Cookie as CookieIcon,
  CreditCard,
  Database,
  ExternalLink,
  Image,
  KeyRound,
  Languages,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Package,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Tag,
  UserSearch,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { LanguageSwitcher } from '../../components/language-switcher.js';
import { SystemStatus } from '../../components/system-status.js';
import { useLocationScope } from '../../lib/location-scope.js';

import { Breadcrumbs } from './breadcrumbs.js';
import { CommandPalette } from './command-palette.js';
import { LocationSwitcher } from './location-switcher.js';
import { SidebarNav, type OpsNavGroup } from './sidebar-nav.js';

/**
 * APP-OPS shell (design §4.2 / §7.3). A pinned left sidebar on desktop; on smaller screens the
 * same grouped navigation lives in a slide-in drawer opened from the header (no more horizontal
 * icon-scroll). Nav items are permission-filtered — a section a user cannot open does not appear.
 *
 * Routing note (DEC-023): this router runs with `basename: '/ops'`, so every `to` here is
 * written WITHOUT the `/ops` prefix — React Router adds it. The public site is a separate origin
 * ({@link SITE_URL}); the "view site" link is a real navigation out of this SPA.
 *
 * The drawer is built on `@radix-ui/react-dialog` directly (already an apps/web dependency)
 * rather than a `@carrental/ui` primitive: it is app-specific shell chrome, and apps/web runs a
 * minimal Tailwind config without the shared preset's animation utilities — the slide keyframes
 * live in `index.css`.
 */
interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  end?: boolean;
  anyOf?: string[];
}

interface NavGroup {
  /** i18n key for the section heading; omit for the top (un-headed) group */
  titleKey?: string;
  items: NavItem[];
}

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || '/';

const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ to: '/', label: 'ops.nav.dashboard', Icon: LayoutDashboard, end: true }],
  },
  {
    titleKey: 'ops.navGroup.operations',
    items: [
      {
        to: '/search',
        label: 'ops.nav.search',
        Icon: Search,
        anyOf: ['reservation.read', 'rental.read'],
      },
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
      { to: '/customers', label: 'ops.nav.customers', Icon: UserSearch, anyOf: ['customer.read'] },
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
      {
        to: '/catalogue/categories',
        label: 'ops.nav.categories',
        Icon: Car,
        anyOf: ['catalogue.read', 'catalogue.manage'],
      },
      {
        to: '/catalogue/products',
        label: 'ops.nav.products',
        Icon: Package,
        anyOf: ['catalogue.read', 'catalogue.manage', 'config.read'],
      },
      {
        to: '/catalogue/media',
        label: 'ops.nav.media',
        Icon: Image,
        anyOf: ['catalogue.read', 'catalogue.manage', 'fleet.read', 'fleet.manage', 'config.read'],
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
        to: '/config/locations',
        label: 'ops.nav.locations',
        Icon: MapPin,
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
        to: '/config/templates',
        label: 'ops.nav.templates',
        Icon: Mail,
        anyOf: ['config.read', 'config.publish'],
      },
      {
        to: '/config/pages',
        label: 'ops.nav.pages',
        Icon: LayoutTemplate,
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
      {
        to: '/config/consent',
        label: 'ops.nav.consent',
        Icon: CookieIcon,
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
      { to: '/consent-log', label: 'ops.nav.consentLog', Icon: CookieIcon, anyOf: ['audit.read'] },
      {
        to: '/data-quality',
        label: 'ops.nav.dataQuality',
        Icon: ShieldCheck,
        anyOf: ['audit.read', 'config.read'],
      },
      {
        to: '/config/payments',
        label: 'ops.nav.payments',
        Icon: CreditCard,
        anyOf: ['payment.manage'],
      },
    ],
  },
];

const SIDEBAR_KEY = 'carrental.ops.sidebar';

/** Desktop sidebar collapsed/expanded, remembered per browser. */
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded');
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  return { collapsed, toggle };
}

function ViewSiteLink({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useI18n();
  return (
    <a
      href={SITE_URL}
      title={collapsed ? t('ops.nav.viewSite') : undefined}
      className={
        collapsed
          ? 'flex justify-center rounded-md py-2.5 text-muted-foreground hover:bg-accent hover:text-foreground'
          : 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground'
      }
    >
      <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
      {collapsed ? <span className="sr-only">{t('ops.nav.viewSite')}</span> : t('ops.nav.viewSite')}
    </a>
  );
}

export function OpsLayout() {
  const { t } = useI18n();
  const { status, actor, signOut, hasPermission } = useAuth();
  const authed = status === 'authenticated' && actor?.kind === 'staff';
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { collapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  // a dropdown is only worth showing when there's an actual choice — an actor confined to one
  // location (or an org with only one) has nothing to switch between
  const { options: locationOptions } = useLocationScope();
  const canSwitchLocation = authed && locationOptions.length > 1;

  // Close the drawer on any route change (covers the command palette, breadcrumbs, back button).
  useEffect(() => setDrawerOpen(false), [pathname]);

  const canSee = (n: NavItem) => !n.anyOf || (authed && hasPermission(...n.anyOf));
  const groups: OpsNavGroup[] = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(canSee),
  })).filter((g) => g.items.length > 0);
  const commandItems = groups.flatMap((g) =>
    g.items.map((it) => ({ to: it.to, label: it.label, Icon: it.Icon, groupKey: g.titleKey })),
  );

  const scopeLabel = actor?.organizationId
    ? t('ops.header.scope', { name: actor.organizationName ?? t('ops.header.org') })
    : t('ops.header.console');

  return (
    <div className="flex min-h-screen bg-muted/30">
      <a href="#ops-main" className="skip-link">
        {t('common.skipToContent')}
      </a>

      {/* Desktop sidebar — authenticated staff only (sign-in / recovery render a bare card).
          Collapses to an icon rail on demand (remembered per browser). */}
      {authed ? (
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 flex-col border-e bg-background lg:flex ${
            collapsed ? 'w-16' : 'w-64'
          }`}
        >
          <NavLink
            to="/"
            title={collapsed ? t('app.ops.name') : undefined}
            className={`flex h-16 shrink-0 items-center border-b font-semibold tracking-tight ${
              collapsed ? 'justify-center px-0' : 'gap-2.5 px-5'
            }`}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <LayoutDashboard className="size-4" aria-hidden="true" />
            </span>
            {collapsed ? null : t('app.ops.name')}
          </NavLink>
          <div className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
            <SidebarNav groups={groups} collapsed={collapsed} />
          </div>
          <div className={`shrink-0 space-y-1 border-t ${collapsed ? 'p-2' : 'p-3'}`}>
            <ViewSiteLink collapsed={collapsed} />
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={collapsed ? t('ops.nav.expandSidebar') : t('ops.nav.collapseSidebar')}
              title={collapsed ? t('ops.nav.expandSidebar') : undefined}
              className={`flex w-full items-center rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground ${
                collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'
              }`}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
              ) : (
                <>
                  <PanelLeftClose className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
                  {t('ops.nav.collapseSidebar')}
                </>
              )}
            </button>
          </div>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b bg-background px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            {authed ? (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label={t('ops.nav.openMenu')}
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
              >
                <Menu className="size-5" aria-hidden="true" />
              </button>
            ) : null}
            <span
              className={`${
                authed ? 'hidden sm:inline-block' : 'inline-block'
              } max-w-[45vw] shrink-0 truncate whitespace-nowrap rounded bg-muted px-2 py-1 text-sm font-medium lg:max-w-none`}
            >
              {scopeLabel}
            </span>
            {authed && actor && canSwitchLocation ? (
              <LocationSwitcher />
            ) : authed && actor ? (
              <span className="hidden whitespace-nowrap text-sm text-muted-foreground xl:inline">
                {actor.locationScope.length
                  ? t('ops.header.locations', { n: actor.locationScope.length })
                  : t('ops.header.allLocations')}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {authed ? <CommandPalette items={commandItems} /> : null}
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
            {authed && actor ? (
              <>
                <span className="hidden text-sm font-medium sm:inline">{actor.displayName}</span>
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

        {/* Mobile / tablet navigation drawer */}
        {authed ? (
          <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <Dialog.Portal>
              <Dialog.Overlay
                data-ops-drawer-overlay
                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              />
              <Dialog.Content
                data-ops-drawer
                aria-label={t('ops.nav.sections')}
                className="fixed inset-y-0 start-0 z-50 flex w-[19rem] max-w-[85vw] flex-col border-e bg-background shadow-xl focus:outline-none lg:hidden"
              >
                <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
                  <span className="flex items-center gap-2.5 font-semibold tracking-tight">
                    <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
                      <LayoutDashboard className="size-4" aria-hidden="true" />
                    </span>
                    <Dialog.Title className="text-sm">{t('app.ops.name')}</Dialog.Title>
                  </span>
                  <Dialog.Close
                    aria-label={t('ops.nav.closeMenu')}
                    className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </Dialog.Close>
                </div>
                {actor ? (
                  <div className="shrink-0 space-y-2 border-b px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{actor.displayName}</p>
                      {actor.organizationId ? (
                        <p className="text-xs text-muted-foreground">
                          {actor.organizationName ?? t('ops.header.org')}
                        </p>
                      ) : null}
                    </div>
                    {canSwitchLocation ? (
                      <LocationSwitcher variant="drawer" />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {actor.locationScope.length
                          ? t('ops.header.locations', { n: actor.locationScope.length })
                          : t('ops.header.allLocations')}
                      </p>
                    )}
                  </div>
                ) : null}
                <div className="flex-1 overflow-y-auto px-3 py-4">
                  <SidebarNav groups={groups} onNavigate={() => setDrawerOpen(false)} />
                </div>
                <div className="shrink-0 border-t p-3">
                  <ViewSiteLink />
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        ) : null}

        <main id="ops-main" className="flex-1 p-4 md:p-6">
          {authed ? <Breadcrumbs items={commandItems} /> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
