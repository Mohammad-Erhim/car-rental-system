import { useI18n } from '@carrental/i18n/react';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { LocationOption } from '@/lib/location-hooks';
import { useLocationScope } from '@/lib/location-scope';
import { cn } from '@/lib/utils';

/** Show a search box once the list is long enough that scanning it stops being quicker. */
const SEARCH_FROM = 7;

/**
 * The one location filter for the whole console: which branches the page you are on is about.
 * Multi-select, searchable, always visible. What it shows depends on who you are and where you are:
 *  - a single reachable branch → a static badge (nothing to choose, but it says where you work);
 *  - a branch-aware page → the picker;
 *  - any other page (finance, catalogue, staff, settings…) → the picker, inactive, explaining that
 *    the page covers every location.
 */
export function LocationSwitcher() {
  const { t } = useI18n();
  const { options, selected, setSelected, clear, ready, restricted, scopedPage, nameOf } =
    useLocationScope();
  const [open, setOpen] = useState(false);

  const active = options.filter((o) => o.status === 'active');
  const archived = options.filter((o) => o.status !== 'active');

  const label = !selected.length
    ? restricted
      ? t('ops.locFilter.allMine')
      : t('ops.locFilter.all')
    : selected.length === 1
      ? nameOf(selected[0]!)
      : t('ops.locFilter.count', { count: selected.length });
  // phones: the icon plus a short token, so the active scope is never invisible
  const short = !selected.length
    ? t('ops.locFilter.allShort')
    : selected.length === 1
      ? selected[0]!
      : String(selected.length);

  // nothing to choose between: say where the account works instead of offering a dead dropdown
  if (ready && active.length + archived.length <= 1) {
    const only = options[0];
    if (!only) return null;
    return (
      <Badge
        variant="outline"
        className="h-9 max-w-[11rem] gap-1.5 px-2.5 font-normal"
        title={t('ops.locFilter.only', { name: only.name })}
      >
        <MapPin className="size-3.5 text-primary" aria-hidden="true" />
        <span className="truncate">{only.name}</span>
      </Badge>
    );
  }

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      disabled={!ready || !scopedPage}
      className="max-w-[11rem] gap-1.5 px-2.5 sm:max-w-[14rem]"
      aria-label={t('ops.locFilter.aria', { name: label })}
      data-testid="location-switcher"
    >
      <MapPin className="text-primary" aria-hidden="true" />
      <span className="hidden truncate sm:inline">{label}</span>
      <span className="truncate text-xs font-medium tabular-nums sm:hidden">{short}</span>
      <ChevronDown className="hidden text-muted-foreground sm:block" aria-hidden="true" />
    </Button>
  );

  if (!scopedPage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex" data-testid="location-switcher-inactive">
            {trigger}
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('ops.locFilter.orgWide')}</TooltipContent>
      </Tooltip>
    );
  }

  const toggle = (code: string) =>
    setSelected(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);

  const row = (o: LocationOption) => {
    const checked = selected.includes(o.code);
    return (
      <CommandItem
        key={o.code}
        value={`${o.name} ${o.code}`}
        onSelect={() => toggle(o.code)}
        className="px-3 py-2"
        data-testid={`location-option-${o.code}`}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-4 shrink-0 place-items-center rounded border',
            checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
          )}
        >
          {checked ? <Check className="size-3" /> : null}
        </span>
        <span className="min-w-0 flex-1 truncate">{o.name}</span>
        <span className="text-xs text-muted-foreground" dir="ltr">
          {o.code}
        </span>
        {checked ? <span className="sr-only">{t('ops.locFilter.selectedSr')}</span> : null}
      </CommandItem>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[19rem] max-w-[calc(100vw-1.5rem)]">
        <Command label={t('ops.locFilter.filterTitle')}>
          {options.length >= SEARCH_FROM ? (
            <CommandInput placeholder={t('ops.locFilter.search')} className="h-10" />
          ) : null}
          <CommandList className="max-h-72">
            <CommandEmpty>{t('ops.locFilter.none')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__ all locations"
                onSelect={clear}
                className="px-3 py-2"
                data-testid="location-option-all"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-4 shrink-0 place-items-center rounded-full border',
                    !selected.length
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input',
                  )}
                >
                  {!selected.length ? <Check className="size-3" /> : null}
                </span>
                <span className="flex-1 font-medium">
                  {restricted ? t('ops.locFilter.allMine') : t('ops.locFilter.all')}
                </span>
                {!selected.length ? (
                  <span className="sr-only">{t('ops.locFilter.selectedSr')}</span>
                ) : null}
              </CommandItem>
            </CommandGroup>
            <CommandGroup
              heading={t('ops.locFilter.activeGroup')}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {active.map(row)}
            </CommandGroup>
            {archived.length ? (
              <CommandGroup
                heading={t('ops.locFilter.archivedGroup')}
                className="text-muted-foreground"
              >
                {archived.map(row)}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
