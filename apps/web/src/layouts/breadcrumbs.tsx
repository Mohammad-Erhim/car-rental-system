import { useI18n } from '@carrental/i18n/react';
import { Link, useLocation } from 'react-router-dom';

import { useCurrentBreadcrumbLabel } from './breadcrumb-label';
import type { NavGroup } from './nav-config';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface Crumb {
  to: string;
  label: string;
}

/**
 * Builds the trail for a path from the (permission-filtered) nav: `Dashboard › <screen>`, with a
 * middle crumb for a `/config/*` screen (the real `/config` page) and for a detail route
 * (`/work/:ref` → the `/work` list). A crumb never links somewhere the user cannot open.
 */
export function buildCrumbs(
  pathname: string,
  labelByPath: Map<string, string>,
  t: (key: string) => string,
): Crumb[] {
  // the dashboard itself has no trail — just its own title
  if (pathname === '/' || pathname === '') {
    return [{ to: '/', label: t('ops.nav.dashboard') }];
  }

  const trail: Crumb[] = [{ to: '/', label: t('ops.nav.dashboard') }];
  const segments = pathname.split('/').filter(Boolean);

  if (pathname.startsWith('/config/') && labelByPath.has('/config')) {
    trail.push({ to: '/config', label: t(labelByPath.get('/config')!) });
  } else if (segments.length > 1) {
    const parent = `/${segments.slice(0, -1).join('/')}`;
    if (labelByPath.has(parent)) trail.push({ to: parent, label: t(labelByPath.get(parent)!) });
  }

  const here = labelByPath.get(pathname);
  trail.push({ to: pathname, label: here ? t(here) : (segments[segments.length - 1] ?? pathname) });
  return trail;
}

/** `/ops` breadcrumb trail for the header. On small screens only the current page shows. */
export function Breadcrumbs({ groups }: { groups: NavGroup[] }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const labelByPath = new Map(
    groups.flatMap((g) => g.items.map((it) => [it.to, it.label] as const)),
  );
  const override = useCurrentBreadcrumbLabel();
  const trail = buildCrumbs(pathname, labelByPath, t);
  const last = trail[trail.length - 1];
  if (override && last && last.to === pathname && !labelByPath.has(pathname)) last.label = override;
  if (trail.length === 0) return null;

  return (
    <Breadcrumb aria-label={t('ops.nav.breadcrumb')} className="min-w-0 overflow-hidden">
      <BreadcrumbList className="flex-nowrap">
        {trail.map((c, i) => {
          const current = i === trail.length - 1;
          return (
            <BreadcrumbItem
              key={c.to}
              className={current ? 'min-w-0' : 'hidden shrink-0 md:inline-flex'}
            >
              {current ? (
                <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
              ) : (
                <>
                  <BreadcrumbLink asChild>
                    <Link to={c.to}>{c.label}</Link>
                  </BreadcrumbLink>
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
