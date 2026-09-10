import { useI18n } from '@carrental/i18n/react';
import { cn } from '@carrental/ui';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export interface OpsNavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  end?: boolean;
}

export interface OpsNavGroup {
  titleKey?: string;
  items: OpsNavItem[];
}

/**
 * The grouped operations navigation — one implementation shared by the desktop sidebar and the
 * mobile drawer (design §4.2). Active item: tinted fill + an inline-start accent bar so the
 * current location is obvious at a glance without relying on colour alone (FR-GBL-007).
 */
export function SidebarNav({
  groups,
  onNavigate,
  className,
}: {
  groups: OpsNavGroup[];
  /** Called after a link is chosen — the drawer uses it to close itself. */
  onNavigate?: () => void;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <nav aria-label={t('ops.nav.sections')} className={cn('space-y-5', className)}>
      {groups.map((g, gi) => (
        <div key={g.titleKey ?? `g${gi}`} className="space-y-1">
          {g.titleKey ? (
            <p className="px-3 pb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {t(g.titleKey)}
            </p>
          ) : null}
          {g.items.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  "before:absolute before:inset-y-1.5 before:start-0 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity before:content-['']",
                  isActive
                    ? 'bg-primary/10 text-primary before:opacity-100'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'size-4 shrink-0 transition-colors',
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground/70 group-hover:text-foreground',
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{t(label)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
