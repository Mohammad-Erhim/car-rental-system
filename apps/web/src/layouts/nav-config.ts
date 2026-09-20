import {
  BarChart3,
  Building2,
  Car,
  CarFront,
  Bell,
  ClipboardList,
  Cookie,
  CreditCard,
  Database,
  FileCheck2,
  Image,
  KeyRound,
  Languages,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  LockKeyhole,
  Mail,
  MapPin,
  Package,
  Palette,
  Plug,
  ScrollText,
  Search,
  Send,
  ShieldCheck,
  Tag,
  Type,
  UserSearch,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import { isOrgWidePath, paths } from '@/app/paths';

/**
 * The dashboard's navigation, as data. One source for the sidebar, the command palette and the
 * breadcrumbs — a destination a user cannot open (missing permission) is filtered out of all
 * three by {@link visibleNavGroups}.
 *
 * The tree is groups → items → (optionally) child items. A group is a task area, an item is a
 * page, and a child is a page that belongs under another (Features under Vehicle categories). An
 * item without a `to` is only a folder for its children (Integrations).
 *
 * Routing note (DEC-023): the router runs with `basename: '/ops'`, so every `to` is written
 * WITHOUT the `/ops` prefix.
 */
export interface NavItem {
  /** the page this entry opens; omit for a folder that only groups its children */
  to?: string;
  /** stable key for a folder (no `to`) */
  id?: string;
  /** i18n key */
  label: string;
  icon: LucideIcon;
  /** match the path exactly (a parent route whose children have their own entries) */
  end?: boolean;
  /** visible when the actor holds ANY of these permissions; omit for "any signed-in staff" */
  anyOf?: string[];
  /** pages nested under this one */
  children?: NavItem[];
}

export interface NavGroup {
  /** i18n key for the section heading; omit for the top (un-headed) group */
  titleKey?: string;
  items: NavItem[];
}

const CONFIG = ['config.read', 'config.publish'];
const CATALOGUE = ['catalogue.read', 'catalogue.manage'];

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { to: paths.dashboard, label: 'ops.nav.dashboard', icon: LayoutDashboard, end: true },
      { to: paths.tasks, label: 'ops.nav.tasks', icon: Bell },
    ],
  },
  {
    titleKey: 'ops.navGroup.operations',
    items: [
      {
        to: paths.search,
        label: 'ops.nav.search',
        icon: Search,
        anyOf: ['reservation.read', 'rental.read'],
      },
      {
        to: paths.reservations,
        label: 'ops.nav.reservations',
        icon: ClipboardList,
        anyOf: ['reservation.read', 'reservation.modify'],
      },
      {
        to: paths.rentals,
        label: 'ops.nav.rentals',
        icon: KeyRound,
        anyOf: ['rental.read', 'rental.pickup', 'rental.return'],
      },
      {
        to: paths.fleet,
        label: 'ops.nav.fleet',
        icon: CarFront,
        anyOf: ['fleet.read', 'fleet.manage'],
      },
      {
        to: paths.customers,
        label: 'ops.nav.customers',
        icon: UserSearch,
        anyOf: ['customer.read'],
      },
    ],
  },
  {
    titleKey: 'ops.navGroup.money',
    items: [
      {
        to: paths.finance,
        label: 'ops.nav.financeRecovery',
        icon: Wallet,
        anyOf: ['payment.read'],
      },
      { to: paths.reports, label: 'ops.nav.reports', icon: BarChart3, anyOf: ['report.read'] },
    ],
  },
  {
    titleKey: 'ops.navGroup.pricing',
    items: [
      {
        to: paths.categories,
        label: 'ops.nav.categories',
        icon: Car,
        end: true,
        anyOf: CATALOGUE,
        children: [
          {
            to: paths.categoryFeatures,
            label: 'ops.nav.vehicleFeatures',
            icon: ListChecks,
            anyOf: [...CATALOGUE, 'config.read'],
          },
        ],
      },
      { to: paths.ratePlans, label: 'ops.nav.ratePlans', icon: Tag, anyOf: CONFIG },
      {
        to: paths.products,
        label: 'ops.nav.products',
        icon: Package,
        anyOf: [...CATALOGUE, 'config.read'],
      },
      { to: paths.locations, label: 'ops.nav.locations', icon: MapPin, anyOf: CONFIG },
    ],
  },
  {
    titleKey: 'ops.navGroup.website',
    items: [
      { to: paths.pages, label: 'ops.nav.pages', icon: LayoutTemplate, anyOf: CONFIG },
      { to: paths.branding, label: 'ops.nav.branding', icon: Palette, anyOf: CONFIG },
      { to: paths.seo, label: 'ops.nav.seo', icon: Search, anyOf: CONFIG },
      { to: paths.consent, label: 'ops.nav.consent', icon: Cookie, anyOf: CONFIG },
      {
        to: paths.media,
        label: 'ops.nav.media',
        icon: Image,
        anyOf: [...CATALOGUE, 'fleet.read', 'fleet.manage', 'config.read'],
      },
      {
        to: paths.languages,
        label: 'ops.nav.languages',
        icon: Languages,
        end: true,
        anyOf: CONFIG,
        children: [
          { to: paths.translations, label: 'ops.nav.translations', icon: Type, anyOf: CONFIG },
        ],
      },
      { to: paths.templates, label: 'ops.nav.templates', icon: Mail, anyOf: CONFIG },
    ],
  },
  {
    titleKey: 'ops.navGroup.settings',
    items: [
      { to: paths.organization, label: 'ops.nav.organization', icon: Building2, anyOf: CONFIG },
      { to: paths.policies, label: 'ops.nav.policies', icon: FileCheck2, anyOf: CONFIG },
      {
        to: paths.referenceData,
        label: 'ops.nav.referenceData',
        icon: Database,
        anyOf: ['config.read', 'lookup.manage'],
      },
      {
        id: 'integrations',
        label: 'ops.nav.integrations',
        icon: Plug,
        children: [
          {
            to: paths.payments,
            label: 'ops.nav.paymentProvider',
            icon: CreditCard,
            anyOf: ['payment.manage'],
          },
          { to: paths.email, label: 'ops.nav.emailProvider', icon: Send, anyOf: ['email.manage'] },
        ],
      },
    ],
  },
  {
    titleKey: 'ops.navGroup.administration',
    items: [
      { to: paths.staff, label: 'ops.nav.staff', icon: Users, anyOf: ['staff.manage'] },
      { to: paths.access, label: 'ops.nav.access', icon: LockKeyhole, anyOf: ['staff.manage'] },
      {
        to: paths.workflows,
        label: 'ops.nav.workflows',
        icon: Workflow,
        anyOf: ['workflow.manage', 'workflow.monitor'],
      },
      {
        to: paths.audit,
        label: 'ops.nav.audit',
        icon: ScrollText,
        end: true,
        anyOf: ['audit.read'],
        children: [
          {
            to: paths.consentLog,
            label: 'ops.nav.consentLog',
            icon: Cookie,
            anyOf: ['audit.read'],
          },
        ],
      },
      {
        to: paths.dataQuality,
        label: 'ops.nav.dataQuality',
        icon: ShieldCheck,
        anyOf: ['audit.read', 'config.read'],
      },
    ],
  },
];

/** Groups filtered to what `hasPermission` allows; groups left empty are dropped. */
export function visibleNavGroups(
  hasPermission: (...permissions: string[]) => boolean,
  groups: NavGroup[] = NAV_GROUPS,
  /** an account limited to specific locations never sees the organisation-wide areas */
  restricted = false,
): NavGroup[] {
  const keep = (items: NavItem[]): NavItem[] =>
    items.flatMap((it) => {
      const children = it.children ? keep(it.children) : undefined;
      // a folder (no page of its own) is shown only while something inside it is
      if (!it.to) return children?.length ? [{ ...it, children }] : [];
      if (it.anyOf && !hasPermission(...it.anyOf)) return [];
      if (restricted && isOrgWidePath(it.to)) return [];
      return [{ ...it, ...(children ? { children } : {}) }];
    });
  return groups.map((g) => ({ ...g, items: keep(g.items) })).filter((g) => g.items.length > 0);
}

/** The key that identifies an entry: its page, or its folder id. */
export const navKey = (it: NavItem) => it.to ?? it.id ?? it.label;

/** The page a folder or item leads to: its own, or its first child's. */
export function firstPath(it: NavItem): string | undefined {
  if (it.to) return it.to;
  for (const c of it.children ?? []) {
    const p = firstPath(c);
    if (p) return p;
  }
  return undefined;
}

export interface NavEntry {
  item: NavItem;
  group: NavGroup;
  /** the folders/pages above this one, outermost first */
  ancestors: NavItem[];
}

/** Every entry, depth first, with where it sits. */
export function flattenNav(groups: NavGroup[]): NavEntry[] {
  const out: NavEntry[] = [];
  const walk = (items: NavItem[], group: NavGroup, ancestors: NavItem[]) => {
    for (const item of items) {
      out.push({ item, group, ancestors });
      if (item.children) walk(item.children, group, [...ancestors, item]);
    }
  };
  for (const g of groups) walk(g.items, g, []);
  return out;
}

const matches = (pathname: string, item: NavItem) =>
  !!item.to &&
  (item.end || item.to === '/'
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(`${item.to}/`));

/**
 * The most specific entry for a path: `/catalogue/categories/features` belongs to Features, not
 * to Vehicle categories, and a detail route (`/reservations/RES-1`) belongs to its list.
 */
export function findEntry(groups: NavGroup[], pathname: string): NavEntry | null {
  const found = flattenNav(groups).filter((e) => matches(pathname, e.item));
  found.sort((a, b) => (b.item.to?.length ?? 0) - (a.item.to?.length ?? 0));
  return found[0] ?? null;
}
