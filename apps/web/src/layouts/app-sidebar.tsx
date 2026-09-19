import { useI18n } from '@carrental/i18n/react';
import {
  ChevronRight,
  ExternalLink,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { findEntry, firstPath, navKey, type NavGroup, type NavItem } from './nav-config';
import { UserMenu } from './user-menu';

import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { SITE_ORIGIN } from '@/lib/site-origin';
import { cn } from '@/lib/utils';

const OPEN_KEY = 'carrental.ops.nav';

/** Which groups and folders the person opened or closed, remembered between visits. */
function useRememberedOpen() {
  const [stored, setStored] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const set = useCallback((key: string, open: boolean) => {
    setStored((prev) => {
      const next = { ...prev, [key]: open };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        /* private mode: the choice just isn't kept */
      }
      return next;
    });
  }, []);
  return [stored, set] as const;
}

/** Whether `path` is this entry's page or anywhere below it in the tree. */
function containsPath(item: NavItem, path: string | null): boolean {
  if (!path) return false;
  return item.to === path || (item.children ?? []).some((c) => containsPath(c, path));
}

function NavNode({
  item,
  current,
  depth,
  rail,
  open,
  onToggle,
  onNavigate,
}: {
  item: NavItem;
  current: string | null;
  depth: number;
  rail: boolean;
  open: (key: string, fallback: boolean) => boolean;
  onToggle: (key: string, open: boolean) => void;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const key = navKey(item);
  const kids = item.children ?? [];
  const inside = containsPath(item, current);
  const expanded = open(key, inside);
  const label = t(item.label);
  const target = firstPath(item);

  // a collapsed icon rail has no room for a tree: top-level entries lead to their first page
  if (rail) {
    return depth === 0 && target ? (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={inside} tooltip={label}>
          <NavLink to={target} end={item.end} onClick={onNavigate}>
            <item.icon aria-hidden="true" />
            <span className="truncate">{label}</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ) : null;
  }

  const row = item.to ? (
    <SidebarMenuButton asChild isActive={item.to === current} tooltip={label}>
      <NavLink to={item.to} end={item.end} onClick={onNavigate}>
        <item.icon aria-hidden="true" />
        <span className="truncate">{label}</span>
      </NavLink>
    </SidebarMenuButton>
  ) : (
    <SidebarMenuButton
      isActive={false}
      aria-expanded={expanded}
      onClick={() => onToggle(key, !expanded)}
      className={inside ? 'text-foreground' : undefined}
    >
      <item.icon aria-hidden="true" />
      <span className="truncate">{label}</span>
    </SidebarMenuButton>
  );

  return (
    <SidebarMenuItem>
      <div className="flex items-center gap-0.5">
        <div className="min-w-0 flex-1">{row}</div>
        {kids.length ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-expanded={expanded}
            aria-label={t(expanded ? 'ops.nav.collapseItem' : 'ops.nav.expandItem', {
              name: label,
            })}
            onClick={() => onToggle(key, !expanded)}
          >
            <ChevronRight
              className={cn(
                'transition-transform rtl:-scale-x-100',
                expanded && 'rotate-90 rtl:rotate-90',
              )}
              aria-hidden="true"
            />
          </Button>
        ) : null}
      </div>
      {kids.length && expanded ? (
        <SidebarMenu className="ms-5 mt-0.5 border-s ps-2">
          {kids.map((c) => (
            <NavNode
              key={navKey(c)}
              item={c}
              current={current}
              depth={depth + 1}
              rail={rail}
              open={open}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </SidebarMenu>
      ) : null}
    </SidebarMenuItem>
  );
}

/** Brand block at the top of the sidebar. */
function Brand() {
  const { t } = useI18n();
  const { collapsed, isMobile } = useSidebar();
  const rail = collapsed && !isMobile;
  return (
    <NavLink
      to="/"
      aria-label={t('app.ops.name')}
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring',
        rail && 'mx-auto',
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <LayoutDashboard className="size-[1.125rem]" aria-hidden="true" />
      </span>
      {rail ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold tracking-tight">
            {t('app.name')}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{t('app.ops.name')}</span>
        </span>
      )}
    </NavLink>
  );
}

export function AppSidebar({ groups }: { groups: NavGroup[] }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { collapsed, isMobile, toggleCollapsed, setOpenMobile } = useSidebar();
  const rail = collapsed && !isMobile;
  const current = findEntry(groups, pathname)?.item.to ?? null;
  const [stored, setStored] = useRememberedOpen();
  const isOpen = (key: string, fallback: boolean) => stored[key] ?? fallback;

  // arriving on a page inside a closed group or folder opens it (and keeps it open)
  useEffect(() => {
    if (!current) return;
    const entry = findEntry(groups, pathname);
    if (!entry) return;
    entry.ancestors.forEach((a) => {
      if (stored[navKey(a)] === false) setStored(navKey(a), true);
    });
    if (entry.group.titleKey && stored[entry.group.titleKey] === false) {
      setStored(entry.group.titleKey, true);
    }
    // only a navigation should reopen; the person closing it again must not fight this
  }, [pathname]);

  return (
    <Sidebar label={t('ops.nav.sections')} closeLabel={t('ops.nav.closeMenu')}>
      <SidebarHeader className={cn(rail && 'justify-center px-2', isMobile && 'justify-between')}>
        <Brand />
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpenMobile(false)}
            aria-label={t('ops.nav.closeMenu')}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </SidebarHeader>

      <SidebarContent aria-label={t('ops.nav.sections')} role="navigation">
        {groups.map((g, gi) => {
          const groupKey = g.titleKey ?? `g${gi}`;
          const holdsCurrent = g.items.some((it) => containsPath(it, current));
          return (
            <SidebarGroup
              key={groupKey}
              label={g.titleKey ? t(g.titleKey) : undefined}
              open={g.titleKey ? isOpen(groupKey, holdsCurrent || gi <= 1) : true}
              onOpenChange={(o) => setStored(groupKey, o)}
            >
              <SidebarMenu>
                {g.items.map((item) => (
                  <NavNode
                    key={navKey(item)}
                    item={item}
                    current={current}
                    depth={0}
                    rail={rail}
                    open={isOpen}
                    onToggle={setStored}
                    onNavigate={() => setOpenMobile(false)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className={cn(rail && 'px-2')}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t('ops.nav.viewSite')}>
              <a href={SITE_ORIGIN}>
                <ExternalLink aria-hidden="true" />
                <span className="truncate">{t('ops.nav.viewSite')}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {isMobile ? null : (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleCollapsed}
                aria-label={collapsed ? t('ops.nav.expandSidebar') : t('ops.nav.collapseSidebar')}
                tooltip={collapsed ? t('ops.nav.expandSidebar') : undefined}
              >
                {collapsed ? (
                  <PanelLeftOpen className="rtl:-scale-x-100" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="rtl:-scale-x-100" aria-hidden="true" />
                )}
                <span className="truncate">{t('ops.nav.collapseSidebar')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
        <UserMenu variant={rail ? 'compact' : 'full'} />
      </SidebarFooter>
    </Sidebar>
  );
}
