import { Slot } from '@radix-ui/react-slot';
import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/**
 * Application sidebar primitives. Desktop (`lg+`): a sticky rail that toggles between full width
 * and an icon-only rail (remembered per browser). Below `lg`: the same content inside an
 * off-canvas Sheet. The rest of the shell composes these — no navigation data lives here.
 */
const STORAGE_KEY = 'carrental.ops.sidebar';

interface SidebarContextValue {
  /** desktop rail collapsed to icons */
  collapsed: boolean;
  toggleCollapsed: () => void;
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within <SidebarProvider>');
  return ctx;
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = React.useState(readCollapsed);
  const [openMobile, setOpenMobile] = React.useState(false);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
      } catch {
        /* storage unavailable — the toggle still works for this session */
      }
      return next;
    });
  }, []);

  // the drawer is meaningless once the viewport grows past the mobile breakpoint
  React.useEffect(() => {
    if (!isMobile) setOpenMobile(false);
  }, [isMobile]);

  const value = React.useMemo(
    () => ({ collapsed, toggleCollapsed, isMobile, openMobile, setOpenMobile }),
    [collapsed, toggleCollapsed, isMobile, openMobile],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function Sidebar({
  className,
  children,
  label,
  closeLabel,
}: {
  className?: string;
  children: React.ReactNode;
  /** accessible name for the mobile drawer */
  label: string;
  closeLabel: string;
}) {
  const { collapsed, isMobile, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="start"
          hideClose
          closeLabel={closeLabel}
          className="w-[19rem] max-w-[85vw] gap-0 bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">{label}</SheetTitle>
          <SheetDescription className="sr-only">{label}</SheetDescription>
          <div className="flex h-full min-h-0 flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'group/sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out lg:flex',
        collapsed ? 'w-[4.5rem]' : 'w-64',
        className,
      )}
    >
      {children}
    </aside>
  );
}

/** The page column to the side of the sidebar. */
export function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex min-h-dvh min-w-0 flex-1 flex-col', className)} {...props} />;
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex h-16 shrink-0 items-center border-b border-sidebar-border px-4',
        className,
      )}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('shrink-0 space-y-1 border-t border-sidebar-border p-3', className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-3', className)}
      {...props}
    />
  );
}

/** True when the icon rail is showing (desktop + collapsed). */
function useRail(): boolean {
  const { collapsed, isMobile } = useSidebar();
  return collapsed && !isMobile;
}

export function SidebarGroup({
  label,
  defaultOpen = true,
  children,
}: {
  /** heading text; omit for an un-headed group */
  label?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const rail = useRail();
  const [open, setOpen] = React.useState(defaultOpen);

  // a route change can land inside a group that was collapsed — reveal it
  React.useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  if (!label) return <div className="pb-1">{children}</div>;

  if (rail) {
    return (
      <div className="border-t border-sidebar-border pt-2 first:border-t-0 first:pt-0">
        {children}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="pt-2">
      <CollapsibleTrigger className="group/label flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
        <ChevronDown
          className="size-3.5 transition-transform duration-200 group-data-[state=closed]/label:-rotate-90 rtl:group-data-[state=closed]/label:rotate-90"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('flex flex-col gap-0.5', className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn('relative', className)} {...props} />;
}

export interface SidebarMenuButtonProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean;
  isActive?: boolean;
  /** text shown in a tooltip while the rail is collapsed */
  tooltip?: string;
}

/**
 * One navigation entry. Use `asChild` with a router `<NavLink>`; the label is any child text and
 * is visually hidden (still announced) in the icon rail.
 */
export const SidebarMenuButton = React.forwardRef<HTMLElement, SidebarMenuButtonProps>(
  ({ asChild = false, isActive = false, tooltip, className, ...props }, ref) => {
    const rail = useRail();
    const Comp = asChild ? Slot : 'button';
    const button = (
      <Comp
        ref={ref as React.Ref<HTMLButtonElement>}
        data-active={isActive || undefined}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group/item relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active]:bg-primary/10 data-[active]:text-primary [&>svg]:size-[1.125rem] [&>svg]:shrink-0',
          "before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity before:content-[''] data-[active]:before:opacity-100",
          rail && 'justify-center px-0 [&>span]:sr-only',
          className,
        )}
        {...props}
      />
    );

    if (!rail || !tooltip) return button;
    // Radix tooltips are not direction-aware — point them away from the rail in RTL too.
    const side = document.documentElement.dir === 'rtl' ? 'left' : 'right';
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    );
  },
);
SidebarMenuButton.displayName = 'SidebarMenuButton';
