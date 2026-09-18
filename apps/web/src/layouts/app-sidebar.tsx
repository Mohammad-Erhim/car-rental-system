import { useI18n } from '@carrental/i18n/react';
import { ExternalLink, LayoutDashboard, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

import type { NavGroup, NavItem } from './nav-config';
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
import { cn } from '@/lib/utils';

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || '/';

function isActive(pathname: string, item: NavItem): boolean {
  if (item.end || item.to === '/') return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/**
 * The most specific match wins — `/config` (exact) and `/config/branding` are separate entries,
 * and a detail route (`/work/RES-1`) keeps its list entry highlighted.
 */
function activeTo(pathname: string, groups: NavGroup[]): string | null {
  const matches = groups.flatMap((g) => g.items).filter((it) => isActive(pathname, it));
  matches.sort((a, b) => b.to.length - a.to.length);
  return matches[0]?.to ?? null;
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
  const current = activeTo(pathname, groups);

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
        {groups.map((g, gi) => (
          <SidebarGroup
            key={g.titleKey ?? `g${gi}`}
            label={g.titleKey ? t(g.titleKey) : undefined}
            defaultOpen={!g.titleKey || g.items.some((it) => it.to === current) || gi <= 1}
          >
            <SidebarMenu>
              {g.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={item.to === current} tooltip={t(item.label)}>
                    <NavLink to={item.to} end={item.end} onClick={() => setOpenMobile(false)}>
                      <item.icon aria-hidden="true" />
                      <span className="truncate">{t(item.label)}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className={cn(rail && 'px-2')}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t('ops.nav.viewSite')}>
              <a href={SITE_URL}>
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
