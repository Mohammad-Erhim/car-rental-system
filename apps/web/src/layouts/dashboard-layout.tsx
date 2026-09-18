import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { useMemo } from 'react';
import { Outlet } from 'react-router-dom';

import { AppHeader } from './app-header';
import { AppSidebar } from './app-sidebar';
import { visibleNavGroups } from './nav-config';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Shell for every authenticated staff screen: sidebar + sticky header + the routed page. Auth is
 * enforced per route (`RequireAuth`), so this only renders chrome — nav entries are filtered by
 * the actor's permissions.
 */
export function DashboardLayout() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  // `hasPermission` is a stable callback that changes with the actor, so this re-filters exactly
  // when the permission set does
  const groups = useMemo(() => visibleNavGroups(hasPermission), [hasPermission]);

  return (
    <TooltipProvider delayDuration={150}>
      <SidebarProvider>
        <a href="#ops-main" className="skip-link">
          {t('common.skipToContent')}
        </a>
        <div className="flex min-h-dvh w-full bg-muted/30">
          <AppSidebar groups={groups} />
          <SidebarInset>
            <AppHeader groups={groups} />
            <main id="ops-main" className="flex-1 p-4 sm:p-6 lg:p-8">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
