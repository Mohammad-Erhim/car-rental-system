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
  collapsed = false,
  className,
}: {
  groups: OpsNavGroup[];
  /** Called after a link is chosen — the drawer uses it to close itself. */
  onNavigate?: () => void;
  /** Icon-only rail: labels + group headings hidden, label moves to the native tooltip. */
  collapsed?: boolean;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t('ops.nav.sections')}
      className={cn(collapsed ? 'space-y-2' : 'space-y-5', className)}
    >
      {groups.map((g, gi) => (
        <div key={g.titleKey ?? `g${gi}`} className="space-y-1">
          {g.titleKey ? (
            collapsed ? (
              gi > 0 ? (
                <div className="mx-3 my-2 border-t" aria-hidden="true" />
              ) : null
            ) : (
              <p className="px-3 pb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground/80">
                {t(g.titleKey)}
              </p>
            )
          ) : null}
          {g.items.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              title={collapsed ? t(label) : undefined}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center rounded-md text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
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
                  {collapsed ? (
                    <span className="sr-only">{t(label)}</span>
                  ) : (
                    <span className="truncate">{t(label)}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
