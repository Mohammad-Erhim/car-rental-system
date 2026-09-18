import {
  BarChart3,
  Building2,
  Car,
  CarFront,
  ClipboardList,
  Cookie,
  CreditCard,
  Database,
  Image,
  KeyRound,
  Languages,
  LayoutDashboard,
  LayoutTemplate,
  Mail,
  MapPin,
  Package,
  Palette,
  ScrollText,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Tag,
  UserSearch,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * The dashboard's navigation, as data. One source for the sidebar, the command palette and the
 * breadcrumbs — a destination a user cannot open (missing permission) is filtered out of all
 * three by {@link visibleNavGroups}.
 *
 * Routing note (DEC-023): the router runs with `basename: '/ops'`, so every `to` is written
 * WITHOUT the `/ops` prefix.
 */
export interface NavItem {
  to: string;
  /** i18n key */
  label: string;
  icon: LucideIcon;
  /** match the path exactly (a parent route whose children have their own entries) */
  end?: boolean;
  /** visible when the actor holds ANY of these permissions; omit for "any signed-in staff" */
  anyOf?: string[];
}

export interface NavGroup {
  /** i18n key for the section heading; omit for the top (un-headed) group */
  titleKey?: string;
  items: NavItem[];
}

const CONFIG = ['config.read', 'config.publish'];

export const NAV_GROUPS: NavGroup[] = [
  { items: [{ to: '/', label: 'ops.nav.dashboard', icon: LayoutDashboard, end: true }] },
  {
    titleKey: 'ops.navGroup.operations',
    items: [
      {
        to: '/search',
        label: 'ops.nav.search',
        icon: Search,
        anyOf: ['reservation.read', 'rental.read'],
      },
      {
        to: '/work',
        label: 'ops.nav.reservations',
        icon: ClipboardList,
        anyOf: ['reservation.read', 'reservation.modify'],
      },
      {
        to: '/rentals',
        label: 'ops.nav.rentals',
        icon: KeyRound,
        anyOf: ['rental.read', 'rental.pickup', 'rental.return'],
      },
      {
        to: '/fleet',
        label: 'ops.nav.fleet',
        icon: CarFront,
        anyOf: ['fleet.read', 'fleet.manage'],
      },
      { to: '/finance', label: 'ops.nav.finance', icon: Wallet, anyOf: ['payment.read'] },
      { to: '/customers', label: 'ops.nav.customers', icon: UserSearch, anyOf: ['customer.read'] },
    ],
  },
  {
    titleKey: 'ops.navGroup.catalogue',
    items: [
      {
        to: '/config/reference-data',
        label: 'ops.nav.referenceData',
        icon: Database,
        anyOf: ['config.read', 'lookup.manage'],
      },
      { to: '/config/rate-plans', label: 'ops.nav.ratePlans', icon: Tag, anyOf: CONFIG },
      {
        to: '/catalogue/categories',
        label: 'ops.nav.categories',
        icon: Car,
        anyOf: ['catalogue.read', 'catalogue.manage'],
      },
      {
        to: '/catalogue/products',
        label: 'ops.nav.products',
        icon: Package,
        anyOf: ['catalogue.read', 'catalogue.manage', 'config.read'],
      },
      {
        to: '/catalogue/media',
        label: 'ops.nav.media',
        icon: Image,
        anyOf: ['catalogue.read', 'catalogue.manage', 'fleet.read', 'fleet.manage', 'config.read'],
      },
    ],
  },
  {
    titleKey: 'ops.navGroup.configuration',
    items: [
      { to: '/config', label: 'ops.nav.configuration', icon: Settings2, end: true, anyOf: CONFIG },
      { to: '/config/locations', label: 'ops.nav.locations', icon: MapPin, anyOf: CONFIG },
      { to: '/config/organization', label: 'ops.nav.organization', icon: Building2, anyOf: CONFIG },
      { to: '/config/languages', label: 'ops.nav.languages', icon: Languages, anyOf: CONFIG },
      { to: '/config/translations', label: 'ops.nav.translations', icon: Languages, anyOf: CONFIG },
      { to: '/config/templates', label: 'ops.nav.templates', icon: Mail, anyOf: CONFIG },
      { to: '/config/pages', label: 'ops.nav.pages', icon: LayoutTemplate, anyOf: CONFIG },
      { to: '/config/branding', label: 'ops.nav.branding', icon: Palette, anyOf: CONFIG },
      { to: '/config/seo', label: 'ops.nav.seo', icon: Search, anyOf: CONFIG },
      { to: '/config/consent', label: 'ops.nav.consent', icon: Cookie, anyOf: CONFIG },
    ],
  },
  {
    titleKey: 'ops.navGroup.administration',
    items: [
      { to: '/admin/staff', label: 'ops.nav.staff', icon: Users, anyOf: ['staff.manage'] },
      { to: '/insights', label: 'ops.nav.reports', icon: BarChart3, anyOf: ['report.read'] },
      { to: '/audit', label: 'ops.nav.audit', icon: ScrollText, anyOf: ['audit.read'] },
      { to: '/consent-log', label: 'ops.nav.consentLog', icon: Cookie, anyOf: ['audit.read'] },
      {
        to: '/data-quality',
        label: 'ops.nav.dataQuality',
        icon: ShieldCheck,
        anyOf: ['audit.read', 'config.read'],
      },
      {
        to: '/config/payments',
        label: 'ops.nav.payments',
        icon: CreditCard,
        anyOf: ['payment.manage'],
      },
      { to: '/config/email', label: 'ops.nav.email', icon: Send, anyOf: ['email.manage'] },
    ],
  },
];

/** Groups filtered to what `hasPermission` allows; groups left empty are dropped. */
export function visibleNavGroups(
  hasPermission: (...permissions: string[]) => boolean,
  groups: NavGroup[] = NAV_GROUPS,
): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !it.anyOf || hasPermission(...it.anyOf)),
    }))
    .filter((g) => g.items.length > 0);
}
