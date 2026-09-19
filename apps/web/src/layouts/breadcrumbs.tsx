import { useI18n } from '@carrental/i18n/react';
import { Link, useLocation } from 'react-router-dom';

import { useCurrentBreadcrumbLabel } from './breadcrumb-label';
import { findEntry, type NavGroup } from './nav-config';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface Crumb {
  /** omitted for a label that is not a page (a group heading, a folder) */
  to?: string;
  label: string;
}

/**
 * Builds the trail for a path from the (permission-filtered) nav tree:
 * `Dashboard › <group> › <parent pages…> › <screen>`. A detail route (`/reservations/RES-1`) links
 * back to its list and ends on the record's own name. A crumb never links somewhere the user
 * cannot open (the nav has already dropped those), and group headings are plain text.
 */
export function buildCrumbs(
  pathname: string,
  groups: NavGroup[],
  t: (key: string) => string,
): Crumb[] {
  const home: Crumb = { to: '/', label: t('ops.nav.dashboard') };
  // the dashboard itself has no trail — just its own title
  if (pathname === '/' || pathname === '') return [home];

  const entry = findEntry(groups, pathname);
  const last = pathname.split('/').filter(Boolean).pop() ?? pathname;
  if (!entry) return [home, { to: pathname, label: last }];

  const trail: Crumb[] = [home];
  if (entry.group.titleKey) trail.push({ label: t(entry.group.titleKey) });
  for (const a of entry.ancestors) trail.push({ to: a.to, label: t(a.label) });
  const isDetail = entry.item.to !== pathname;
  trail.push({ to: entry.item.to, label: t(entry.item.label) });
  if (isDetail) trail.push({ to: pathname, label: last });
  return trail;
}

/** `/ops` breadcrumb trail for the header. On small screens only the current page shows. */
export function Breadcrumbs({ groups }: { groups: NavGroup[] }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const override = useCurrentBreadcrumbLabel();
  const entry = findEntry(groups, pathname);
  const trail = buildCrumbs(pathname, groups, t);
  const last = trail[trail.length - 1];
  // a record's own name replaces the raw id from the URL
  if (override && last && last.to === pathname && entry && entry.item.to !== pathname) {
    last.label = override;
  }
  if (trail.length === 0) return null;

  return (
    <Breadcrumb aria-label={t('ops.nav.breadcrumb')} className="min-w-0 overflow-hidden">
      <BreadcrumbList className="flex-nowrap">
        {trail.map((c, i) => {
          const current = i === trail.length - 1;
          return (
            <BreadcrumbItem
              key={`${i}-${c.label}`}
              className={current ? 'min-w-0' : 'hidden shrink-0 md:inline-flex'}
            >
              {current ? (
                <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
              ) : (
                <>
                  {c.to ? (
                    <BreadcrumbLink asChild>
                      <Link to={c.to}>{c.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <span className="text-muted-foreground">{c.label}</span>
                  )}
                  <BreadcrumbSeparator />
                </>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
