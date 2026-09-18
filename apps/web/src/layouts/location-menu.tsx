import { useI18n } from '@carrental/i18n/react';
import { Check, ChevronDown, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ALL_LOCATIONS, useLocationScope } from '@/lib/location-scope';

/**
 * System-wide "which location am I looking at" filter. Reads/writes `useLocationScope()`; every
 * scoped page that opts in reads the same selection. Rendered only when the actor actually has
 * more than one location to choose between (see `AppHeader`).
 */
export function LocationMenu() {
  const { t } = useI18n();
  const { selected, setSelected, options, ready } = useLocationScope();
  const current = selected ? options.find((o) => o.code === selected) : undefined;
  const label = current ? current.name : t('ops.header.allLocations');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!ready}
          className="max-w-[11rem] px-2.5 sm:max-w-[13rem]"
          aria-label={t('ops.header.locationSwitcher.aria', { name: label })}
        >
          <MapPin className="text-primary" aria-hidden="true" />
          <span className="hidden truncate sm:inline">{label}</span>
          <ChevronDown className="hidden text-muted-foreground sm:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 min-w-[14rem] overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t('ops.header.locationSwitcher.label')}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setSelected(ALL_LOCATIONS)} className="justify-between">
          {t('ops.header.allLocations')}
          {!selected ? <Check className="text-primary" aria-hidden="true" /> : null}
        </DropdownMenuItem>
        {options.map((o) => (
          <DropdownMenuItem
            key={o.code}
            onSelect={() => setSelected(o.code)}
            className="justify-between"
          >
            <span className="truncate">{o.name}</span>
            {selected === o.code ? (
              <Check className="shrink-0 text-primary" aria-hidden="true" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
