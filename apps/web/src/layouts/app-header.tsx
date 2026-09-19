import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Menu } from 'lucide-react';

import { Breadcrumbs } from './breadcrumbs';
import { CommandMenu } from './command-menu';
import { LanguageMenu } from './language-menu';
import { LocationSwitcher } from './location-switcher';
import type { NavGroup } from './nav-config';
import { SystemStatus } from './system-status';
import { ThemeMenu } from './theme-menu';
import { UserMenu } from './user-menu';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSidebar } from '@/components/ui/sidebar';

/**
 * Sticky top bar: drawer toggle (mobile), breadcrumbs, then the global tools — quick search,
 * location filter, system health, theme, language, account. The account menu lives in the
 * sidebar footer on desktop and here on mobile, where the sidebar is a drawer.
 */
export function AppHeader({ groups }: { groups: NavGroup[] }) {
  const { t } = useI18n();
  const { actor } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:gap-3 sm:px-6">
      {isMobile ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpenMobile(true)}
          aria-label={t('ops.nav.openMenu')}
        >
          <Menu aria-hidden="true" />
        </Button>
      ) : null}
      <Separator orientation="vertical" className="hidden h-5 lg:hidden" />
      <div className="min-w-0 flex-1">
        <Breadcrumbs groups={groups} />
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <CommandMenu groups={groups} />
        <LocationSwitcher />
        <SystemStatus />
        <ThemeMenu />
        <LanguageMenu />
        {isMobile && actor ? <UserMenu /> : null}
      </div>
    </header>
  );
}
