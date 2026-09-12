import { useI18n } from '@carrental/i18n/react';
import { Button } from '@carrental/ui';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, MapPin } from 'lucide-react';

import { ALL_LOCATIONS, useLocationScope } from '../../lib/location-scope.js';

/**
 * The system-wide "which location am I looking at" switcher (the sidebar/header dropdown the
 * user asked for). Reads/writes `useLocationScope()`; every scoped page/query that opts in reads
 * the same selection, so switching here is felt across the dashboard, analytics, and reports in
 * one action instead of re-picking a location on each screen.
 *
 * A dropdown only when there is an actual choice to make — an actor confined to exactly one
 * location (or an org with only one) has nothing to switch between, so the caller falls back to
 * the plain-text scope label it already had (see `ops-layout.tsx`); rendering a menu with a
 * single, permanently-selected item would be UI clutter, not a feature.
 */
export function LocationSwitcher({ variant = 'header' }: { variant?: 'header' | 'drawer' }) {
  const { t } = useI18n();
  const { selected, setSelected, options, ready } = useLocationScope();

  const current = selected ? options.find((o) => o.code === selected) : undefined;
  const currentLabel = current ? current.name : t('ops.header.allLocations');

  if (variant === 'drawer') {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            disabled={!ready}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            <span className="flex items-center gap-2 truncate">
              <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">{currentLabel}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <LocationMenuContent
          align="start"
          options={options}
          selected={selected}
          setSelected={setSelected}
          allLabel={t('ops.header.allLocations')}
          menuLabel={t('ops.header.locationSwitcher.label')}
        />
      </DropdownMenu.Root>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!ready}
          className="hidden max-w-[12rem] gap-1.5 sm:inline-flex"
          aria-label={t('ops.header.locationSwitcher.aria', { name: currentLabel })}
        >
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{currentLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <LocationMenuContent
        align="end"
        options={options}
        selected={selected}
        setSelected={setSelected}
        allLabel={t('ops.header.allLocations')}
        menuLabel={t('ops.header.locationSwitcher.label')}
      />
    </DropdownMenu.Root>
  );
}

function LocationMenuContent({
  align,
  options,
  selected,
  setSelected,
  allLabel,
  menuLabel,
}: {
  align: 'start' | 'end';
  options: Array<{ code: string; name: string }>;
  selected: string | undefined;
  setSelected: (code: string) => void;
  allLabel: string;
  menuLabel: string;
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        className="z-50 max-h-80 min-w-[14rem] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {menuLabel}
        </DropdownMenu.Label>
        <DropdownMenu.Item
          onSelect={() => setSelected(ALL_LOCATIONS)}
          className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
        >
          {allLabel}
          {!selected && <Check className="size-4 text-primary" aria-hidden="true" />}
        </DropdownMenu.Item>
        {options.map((o) => (
          <DropdownMenu.Item
            key={o.code}
            onSelect={() => setSelected(o.code)}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
          >
            <span className="truncate">{o.name}</span>
            {selected === o.code && (
              <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
            )}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}
