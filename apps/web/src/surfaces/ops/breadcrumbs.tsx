import { useI18n } from '@carrental/i18n/react';
import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

/**
 * STAGE-012 — `/ops` breadcrumb trail (design §4.2). Most screens sit one level under `/`, so
 * the trail is `Dashboard › <screen>`. Two cases add a middle crumb: a `/config/*` screen gets
 * the real `/config` page, and a detail route (`/work/:ref`, `/rentals/:ref`) gets its list
 * page (`/work`, `/rentals`) so there is always a one-click way back to the queue. Labels and
 * reachability come from the same permission-filtered nav list the sidebar and command palette
 * use — a crumb never links somewhere the user cannot open.
 */
export interface CrumbSource {
  /** route path without the `/ops` basename, e.g. `/config/rate-plans` */
  to: string;
  /** i18n key for the label */
  label: string;
}

export function Breadcrumbs({ items }: { items: CrumbSource[] }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const labelByPath = new Map(items.map((it) => [it.to, it.label]));

  // the dashboard itself needs no trail
  if (pathname === '/' || pathname === '') return null;

  const trail: Array<{ to: string; label: string; current?: boolean }> = [
    { to: '/', label: t('ops.nav.dashboard') },
  ];

  if (pathname.startsWith('/config/') && labelByPath.has('/config')) {
    trail.push({ to: '/config', label: t(labelByPath.get('/config')!) });
  }

  // A detail route (e.g. /work/RES-1234) links back to its list page as a middle crumb.
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 1 && !pathname.startsWith('/config/')) {
    const parent = `/${segments.slice(0, -1).join('/')}`;
    if (labelByPath.has(parent)) {
      trail.push({ to: parent, label: t(labelByPath.get(parent)!) });
    }
  }

  const hereKey = labelByPath.get(pathname);
  trail.push({
    to: pathname,
    label: hereKey ? t(hereKey) : (pathname.split('/').filter(Boolean).pop() ?? pathname),
    current: true,
  });

  return (
    <nav aria-label={t('ops.nav.breadcrumb')} className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {trail.map((c) => (
          <li key={c.to} className="flex items-center gap-1">
            {c.current ? (
              <span aria-current="page" className="font-medium text-foreground">
                {c.label}
              </span>
            ) : (
              <>
                <Link to={c.to} className="rounded hover:text-foreground hover:underline">
                  {c.label}
                </Link>
                <ChevronRight className="size-3 shrink-0 rtl:rotate-180" aria-hidden="true" />
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
