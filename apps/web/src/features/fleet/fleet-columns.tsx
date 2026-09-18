import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { CarFront, MoreHorizontal, Pencil, RotateCcw, Trash2, Truck, Wrench } from 'lucide-react';
import { useMemo } from 'react';

import { useBlockKindLabel } from './fleet-dialogs';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { OpsUnit } from '@/lib/ops-discovery-hooks';
import { cn } from '@/lib/utils';

export type UnitAction = 'edit' | 'block' | 'transfer' | 'retire';
export type UnitActionHandler = (unit: OpsUnit, action: UnitAction) => void;

/** unit state → badge tone. Always shown with its text label, never colour alone. */
const TONE: Record<string, React.ComponentProps<typeof Badge>['variant']> = {
  available: 'success',
  on_rent: 'default',
  prep: 'warning',
  maintenance: 'warning',
  out_of_service: 'warning',
  in_transit: 'secondary',
  retired: 'destructive',
};
const KNOWN = new Set(Object.keys(TONE));

export function useUnitStateLabel() {
  const { t } = useI18n();
  return (state: string) =>
    KNOWN.has(state) ? t(`ops.fleet.unitState.${state}`) : state.replace(/_/g, ' ');
}

/** Small round photo, or a car glyph when the unit has none. */
function Thumb({ unit, className }: { unit: OpsUnit; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground',
        className,
      )}
    >
      {unit.imageUrl ? (
        <img src={unit.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <CarFront className="size-5" aria-hidden="true" />
      )}
    </span>
  );
}

const vehicleName = (u: OpsUnit) => [u.year, u.make, u.model].filter(Boolean).join(' ');

/** The unit's state plus a "held" badge when an active block keeps it out of bookings. */
export function UnitState({ unit, holds }: { unit: OpsUnit; holds: string[] }) {
  const { t } = useI18n();
  const stateLabel = useUnitStateLabel();
  const kindLabel = useBlockKindLabel();
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge variant={TONE[unit.state] ?? 'secondary'}>{stateLabel(unit.state)}</Badge>
      {holds.length ? (
        <Badge variant="warning" data-testid={`fleet-held-${unit.id}`}>
          {t('ops.fleet.heldBadge', { kind: [...new Set(holds)].map(kindLabel).join(', ') })}
        </Badge>
      ) : null}
    </span>
  );
}

/** Permission-aware row menu. Hidden entirely for read-only users. */
export function UnitMenu({ unit, onAction }: { unit: OpsUnit; onAction: UnitActionHandler }) {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  if (!hasPermission('fleet.manage')) return null;
  const retired = unit.state === 'retired';

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('ops.resv.moreActions')}
            data-testid={`fleet-menu-${unit.id}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <DropdownMenuItem
            onSelect={() => onAction(unit, 'edit')}
            data-testid={`fleet-edit-${unit.id}`}
          >
            <Pencil aria-hidden="true" />
            {t('ops.fleet.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={unit.state === 'maintenance' || retired}
            onSelect={() => onAction(unit, 'block')}
            data-testid={`fleet-block-${unit.id}`}
          >
            <Wrench aria-hidden="true" />
            {t('ops.fleet.block')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={unit.state === 'on_rent' || retired}
            onSelect={() => onAction(unit, 'transfer')}
            data-testid={`fleet-transfer-${unit.id}`}
          >
            <Truck aria-hidden="true" />
            {t('ops.fleet.transfer')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onAction(unit, 'retire')}
            data-testid={`fleet-retire-${unit.id}`}
            className={retired ? undefined : 'text-destructive focus:text-destructive'}
          >
            {retired ? <RotateCcw aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
            {retired ? t('ops.fleet.restore') : t('ops.fleet.retire')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function useUnitColumns(
  holdsByUnit: Map<string, string[]>,
  onAction: UnitActionHandler,
): ColumnDef<OpsUnit, unknown>[] {
  const { t } = useI18n();

  return useMemo<ColumnDef<OpsUnit, unknown>[]>(
    () => [
      {
        id: 'vehicle',
        header: t('ops.tbl.vehicle'),
        cell: ({ row: { original: u } }) => (
          <div className="flex items-center gap-3">
            <Thumb unit={u} />
            <div className="min-w-0">
              <p className="bidi-isolate truncate font-medium">{vehicleName(u) || '—'}</p>
              {u.colour ? <p className="text-xs text-muted-foreground">{u.colour}</p> : null}
            </div>
          </div>
        ),
      },
      {
        id: 'plate',
        header: t('ops.tbl.plate'),
        cell: ({ row: { original: u } }) => (
          <span className="bidi-isolate font-mono text-sm font-semibold">{u.plate}</span>
        ),
      },
      {
        id: 'vin',
        header: t('ops.tbl.vin'),
        meta: { className: 'hidden min-[1360px]:table-cell' },
        cell: ({ row: { original: u } }) => (
          <span className="bidi-isolate font-mono text-xs text-muted-foreground">{u.vin}</span>
        ),
      },
      {
        id: 'category',
        header: t('ops.tbl.category'),
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row: { original: u } }) => u.categoryName,
      },
      {
        id: 'location',
        header: t('ops.tbl.location'),
        cell: ({ row: { original: u } }) => (
          <span className="bidi-isolate">{u.currentLocationCode}</span>
        ),
      },
      {
        id: 'state',
        header: t('ops.tbl.state'),
        cell: ({ row: { original: u } }) => (
          <UnitState unit={u} holds={holdsByUnit.get(u.id) ?? []} />
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'w-12 text-end' },
        cell: ({ row: { original: u } }) => <UnitMenu unit={u} onAction={onAction} />,
      },
    ],
    [t, holdsByUnit, onAction],
  );
}

/** Phone layout for one unit. */
export function UnitCard({
  unit: u,
  holds,
  onAction,
}: {
  unit: OpsUnit;
  holds: string[];
  onAction: UnitActionHandler;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 p-4">
      <Thumb unit={u} className="size-14" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="bidi-isolate truncate font-medium">{vehicleName(u) || '—'}</p>
        <p className="text-xs text-muted-foreground">
          <span className="bidi-isolate font-mono font-semibold text-foreground">{u.plate}</span> ·{' '}
          {u.categoryName} · <span className="bidi-isolate">{u.currentLocationCode}</span>
        </p>
        <UnitState unit={u} holds={holds} />
        <span className="sr-only">{t('ops.tbl.state')}</span>
      </div>
      <UnitMenu unit={u} onAction={onAction} />
    </div>
  );
}
