import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { useMemo } from 'react';
import { Outlet } from 'react-router-dom';

import { AppHeader } from './app-header';
import { AppSidebar } from './app-sidebar';
import { BreadcrumbLabelProvider } from './breadcrumb-label';
import { visibleNavGroups } from './nav-config';

import { LocationScopeGate } from '@/components/location-scope-gate';
import { OrgWideGate } from '@/components/org-wide-gate';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LocationScopeProvider, useLocationScope } from '@/lib/location-scope';

/**
 * Shell for every authenticated staff screen: sidebar + sticky header + the routed page. Auth is
 * enforced per route (`RequireAuth`), so this only renders chrome — nav entries are filtered by
 * the actor's permissions.
 */
export function DashboardLayout() {
  return (
    <LocationScopeProvider>
      <DashboardShell />
    </LocationScopeProvider>
  );
}

function DashboardShell() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  // from the server (fresh), not the session snapshot: an administrator may have narrowed this account
  const { restricted } = useLocationScope();
  // `hasPermission` is a stable callback that changes with the actor, so this re-filters exactly
  // when the permission set does
  const groups = useMemo(
    () => visibleNavGroups(hasPermission, undefined, restricted),
    [hasPermission, restricted],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <BreadcrumbLabelProvider>
        <SidebarProvider>
          <a href="#ops-main" className="skip-link">
            {t('common.skipToContent')}
          </a>
          <div className="flex min-h-dvh w-full bg-muted/30">
            <AppSidebar groups={groups} />
            <SidebarInset>
              <AppHeader groups={groups} />
              <main id="ops-main" className="flex-1 p-4 sm:p-6 lg:p-8">
                <OrgWideGate>
                  <LocationScopeGate>
                    <Outlet />
                  </LocationScopeGate>
                </OrgWideGate>
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </BreadcrumbLabelProvider>
    </TooltipProvider>
  );
}
