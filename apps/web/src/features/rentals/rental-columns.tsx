import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ClipboardCheck, KeyRound, MoreHorizontal, Undo2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RentalBoardRow } from '@/lib/rental-hooks';

/** What a board action opens. The page owns the modal; rows only ask for it. */
export type RentalAction = 'pickup' | 'return' | 'incident' | 'readiness';
export type PrimaryAction = Exclude<RentalAction, 'incident'>;
export type RentalActionHandler = (row: RentalBoardRow, action: RentalAction) => void;

/** The state that drives the badge: a live-overdue `active` rental reads as overdue. */
export const displayState = (r: RentalBoardRow) => (r.overdue ? 'overdue' : r.state);

/** Which actions the actor may run on a row, mirroring the API's per-action @Permissions. */
export function useRentalActions() {
  const { hasPermission } = useAuth();
  const canPickup = hasPermission('rental.pickup');
  const canReturn = hasPermission('rental.return');
  const canIncident = hasPermission('rental.pickup', 'rental.return');
  const canReady = hasPermission('fleet.manage', 'rental.return');
  return useMemo(
    () => ({
      primary: (r: RentalBoardRow): PrimaryAction | null =>
        r.state === 'awaiting_pickup' && canPickup
          ? 'pickup'
          : (r.state === 'active' || r.state === 'overdue') && canReturn
            ? 'return'
            : r.state === 'closed' && !r.readinessOutcome && canReady
              ? 'readiness'
              : null,
      canIncident: (r: RentalBoardRow) =>
        canIncident && (r.state === 'active' || r.state === 'overdue'),
    }),
    [canPickup, canReturn, canIncident, canReady],
  );
}

const PRIMARY = {
  pickup: { icon: KeyRound, labelKey: 'ops.rent.runPickup', variant: 'default' },
  return: { icon: Undo2, labelKey: 'ops.rent.runReturn', variant: 'outline' },
  readiness: { icon: ClipboardCheck, labelKey: 'ops.rent.readinessTitle', variant: 'outline' },
} as const;

/** Trailing cell: the state's primary action, plus a menu for the rarer ones. */
function RowActions({ row: r, onAction }: { row: RentalBoardRow; onAction: RentalActionHandler }) {
  const { t } = useI18n();
  const actions = useRentalActions();
  const primary = actions.primary(r);
  const incident = actions.canIncident(r);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (!primary && !incident) {
    return r.state === 'closed' && r.readinessOutcome ? (
      <span
        className="text-xs text-muted-foreground"
        data-testid={`readiness-outcome-${r.reference}`}
      >
        {r.readinessOutcome === 'passed'
          ? t('ops.rent.readyOutcomePassed')
          : t('ops.rent.readyOutcomeFailed')}
      </span>
    ) : null;
  }

  const p = primary ? PRIMARY[primary] : null;
  return (
    <div className="flex items-center justify-end gap-1.5" onClick={stop}>
      {p && primary ? (
        <Button
          size="sm"
          variant={p.variant}
          data-testid={`${primary}-open-${r.reference}`}
          onClick={() => onAction(r, primary)}
        >
          <p.icon aria-hidden="true" />
          {t(p.labelKey)}
        </Button>
      ) : null}
      {incident ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('ops.resv.moreActions')}
              data-testid={`more-${r.reference}`}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => onAction(r, 'incident')}
              data-testid={`incident-open-${r.reference}`}
            >
              <AlertTriangle aria-hidden="true" />
              {t('ops.rent.reportIncident')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/** Formatting shared by the table and the phone cards. */
export function useRentalFormat() {
  const { fmt, t } = useI18n();
  return useMemo(
    () => ({
      window: (r: RentalBoardRow) =>
        `${fmt.dateTime(r.scheduledPickupAt)} → ${fmt.dateTime(r.scheduledReturnAt)}`,
      location: (r: RentalBoardRow) =>
        r.returnLocationCode !== r.pickupLocationCode
          ? `${r.pickupLocationCode} → ${r.returnLocationCode}`
          : r.pickupLocationCode,
      person: (r: RentalBoardRow) => r.customerName ?? r.driverName ?? '—',
      driverNote: (r: RentalBoardRow) =>
        r.customerName && r.driverName && r.customerName !== r.driverName
          ? t('ops.rent.driverIs', { name: r.driverName })
          : null,
      settlement: (r: RentalBoardRow) =>
        r.settlementMinor
          ? fmt.money({ amountMinor: r.settlementMinor, currency: r.currency })
          : null,
    }),
    [fmt, t],
  );
}

export function useRentalColumns(
  onAction: RentalActionHandler,
): ColumnDef<RentalBoardRow, unknown>[] {
  const { t } = useI18n();
  const f = useRentalFormat();

  return useMemo<ColumnDef<RentalBoardRow, unknown>[]>(
    () => [
      {
        id: 'reference',
        header: t('ops.tbl.reference'),
        cell: ({ row: { original: r } }) => (
          <div className="space-y-0.5">
            <Link
              to={`/rentals/${encodeURIComponent(r.reference)}`}
              onClick={(e) => e.stopPropagation()}
              className="bidi-isolate inline-block whitespace-nowrap font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {r.reference}
            </Link>
            <p className="bidi-isolate whitespace-nowrap font-mono text-xs text-muted-foreground">
              ← {r.reservationReference}
            </p>
          </div>
        ),
      },
      {
        id: 'state',
        header: t('ops.tbl.state'),
        cell: ({ row: { original: r } }) => (
          <span data-testid={`rental-state-${r.reference}`}>
            <StatusBadge status={displayState(r)} />
          </span>
        ),
      },
      {
        id: 'vehicle',
        header: t('ops.search.vehicle'),
        cell: ({ row: { original: r } }) => (
          <div className="space-y-0.5">
            <p className="bidi-isolate font-medium">{r.vehicle ?? t('ops.rent.noVehicle')}</p>
            {r.plate ? (
              <p className="bidi-isolate font-mono text-xs text-muted-foreground">{r.plate}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'customer',
        header: t('ops.rentd.customer'),
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row: { original: r } }) => (
          <div className="space-y-0.5">
            <p>{f.person(r)}</p>
            {f.driverNote(r) ? (
              <p className="text-xs text-muted-foreground">{f.driverNote(r)}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'window',
        header: t('ops.rentd.window'),
        cell: ({ row: { original: r } }) => (
          <div className="space-y-0.5">
            <p className="whitespace-nowrap">{f.window(r)}</p>
            <p className="text-xs text-muted-foreground">
              {f.location(r)}
              {f.settlement(r) ? ` · ${t('ops.rent.settlement')} ${f.settlement(r)}` : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'text-end' },
        cell: ({ row: { original: r } }) => <RowActions row={r} onAction={onAction} />,
      },
    ],
    [t, f, onAction],
  );
}

/** Phone layout for one rental. */
export function RentalCard({
  row: r,
  onAction,
}: {
  row: RentalBoardRow;
  onAction: RentalActionHandler;
}) {
  const { t } = useI18n();
  const f = useRentalFormat();
  return (
    <div className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/rentals/${encodeURIComponent(r.reference)}`}
            className="bidi-isolate font-mono text-sm font-semibold text-primary"
          >
            {r.reference}
          </Link>
          <p className="bidi-isolate font-mono text-xs text-muted-foreground">
            ← {r.reservationReference}
          </p>
        </div>
        <StatusBadge status={displayState(r)} />
      </div>
      <p className="text-sm font-medium">
        {r.vehicle ?? t('ops.rent.noVehicle')}
        {r.plate ? (
          <span className="bidi-isolate ms-2 font-mono text-xs font-normal text-muted-foreground">
            {r.plate}
          </span>
        ) : null}
      </p>
      <p className="text-sm">{f.person(r)}</p>
      <p className="text-xs text-muted-foreground">
        {f.window(r)} · {f.location(r)}
      </p>
      <RowActions row={r} onAction={onAction} />
    </div>
  );
}
