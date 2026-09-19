import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { paths } from '@/app/paths';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { useLocationAccess } from '@/lib/location-scope';
import type { OpsReservationRow } from '@/lib/reservation-hooks';

const carName = (u: { make: string | null; model: string | null }) =>
  [u.make, u.model].filter(Boolean).join(' ');

/** Formatting + permission logic shared by the table and the phone cards. */
export function useReservationRow() {
  const { fmt, t } = useI18n();
  const { hasPermission } = useAuth();
  // mirrors the detail page's identical check for the same assign action
  const canAssign = hasPermission('rental.pickup', 'fleet.manage');
  // assigning a car is the pickup branch's job — a one-way booking listed at its return branch is view-only
  const actsAt = useLocationAccess();
  return useMemo(
    () => ({
      canAssign,
      needsVehicle: (r: OpsReservationRow) =>
        r.state === 'confirmed' &&
        !r.assignedRentalRef &&
        canAssign &&
        actsAt(r.pickupLocationCode),
      money: (r: OpsReservationRow, minor: number) =>
        fmt.money({ amountMinor: minor, currency: r.currency }),
      locations: (r: OpsReservationRow) =>
        r.returnLocationCode !== r.pickupLocationCode
          ? `${r.pickupLocationCode} → ${r.returnLocationCode}`
          : r.pickupLocationCode,
      pickup: (r: OpsReservationRow) => fmt.dateTime(r.pickupAt),
      picked: (r: OpsReservationRow) =>
        r.pickedUnit ? t('ops.queue.picked', { car: carName(r.pickedUnit) }) : null,
    }),
    [fmt, t, canAssign, actsAt],
  );
}

/** The row's trailing action: open its rental, or assign a vehicle. */
function RowAction({
  row: r,
  onAssign,
  size = 'sm',
}: {
  row: OpsReservationRow;
  onAssign: (r: OpsReservationRow) => void;
  size?: 'sm' | 'default';
}) {
  const { t } = useI18n();
  const f = useReservationRow();

  if (r.assignedRentalRef) {
    return (
      <Link
        to={`/rentals/${encodeURIComponent(r.assignedRentalRef)}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-primary hover:underline"
      >
        {t('ops.queue.openRental')}
        <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
      </Link>
    );
  }
  if (f.needsVehicle(r)) {
    return (
      <Button
        size={size}
        variant="outline"
        data-testid={`assign-${r.reference}`}
        onClick={(e) => {
          e.stopPropagation();
          onAssign(r);
        }}
      >
        {t('ops.queue.assign')}
      </Button>
    );
  }
  return null;
}

export function useReservationColumns(
  onAssign: (r: OpsReservationRow) => void,
): ColumnDef<OpsReservationRow, unknown>[] {
  const { t } = useI18n();
  const f = useReservationRow();

  return useMemo<ColumnDef<OpsReservationRow, unknown>[]>(
    () => [
      {
        id: 'reference',
        header: t('ops.tbl.reference'),
        cell: ({ row: { original: r } }) => (
          <div className="space-y-0.5">
            <Link
              to={paths.reservation(r.reference)}
              onClick={(e) => e.stopPropagation()}
              className="bidi-isolate inline-block whitespace-nowrap font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {r.reference}
            </Link>
            {r.assignedRentalRef ? (
              <p className="bidi-isolate whitespace-nowrap font-mono text-xs text-muted-foreground">
                → {r.assignedRentalRef}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'state',
        header: t('ops.tbl.state'),
        cell: ({ row: { original: r } }) => <StatusBadge status={r.state} />,
      },
      {
        id: 'driver',
        header: t('ops.search.driver'),
        cell: ({ row: { original: r } }) => (
          <span className="font-medium">{r.driverName ?? '—'}</span>
        ),
      },
      {
        id: 'category',
        header: t('ops.tbl.category'),
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row: { original: r } }) => (
          <div className="space-y-0.5">
            <p>
              {r.categoryCode} <span className="text-muted-foreground">· {r.channel}</span>
            </p>
            {r.pickedUnit ? (
              <p className="text-xs text-primary" data-testid={`picked-${r.reference}`}>
                {f.picked(r)}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'pickup',
        header: t('ops.tbl.pickup'),
        cell: ({ row: { original: r } }) => (
          <div className="space-y-0.5">
            <p className="whitespace-nowrap">{f.pickup(r)}</p>
            <p className="text-xs text-muted-foreground">{f.locations(r)}</p>
          </div>
        ),
      },
      {
        id: 'total',
        header: t('ops.tbl.total'),
        meta: { className: 'text-end' },
        cell: ({ row: { original: r } }) => (
          <div className="space-y-0.5">
            <p className="font-medium tabular-nums">{f.money(r, r.totalMinor)}</p>
            <p className="text-xs text-muted-foreground">
              {t('ops.queue.paidOf', { paid: f.money(r, r.paidMinor) })}
            </p>
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'text-end' },
        cell: ({ row: { original: r } }) => <RowAction row={r} onAssign={onAssign} />,
      },
    ],
    [t, f, onAssign],
  );
}

/** Phone layout for one reservation. */
export function ReservationCard({
  row: r,
  onAssign,
}: {
  row: OpsReservationRow;
  onAssign: (r: OpsReservationRow) => void;
}) {
  const f = useReservationRow();
  return (
    <div className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          to={paths.reservation(r.reference)}
          className="bidi-isolate font-mono text-sm font-semibold text-primary"
        >
          {r.reference}
        </Link>
        <StatusBadge status={r.state} />
      </div>
      <p className="text-sm font-medium">{r.driverName ?? '—'}</p>
      <div className="flex items-end justify-between gap-3 text-xs text-muted-foreground">
        <div className="min-w-0 space-y-0.5">
          <p>
            {f.pickup(r)} · {f.locations(r)}
          </p>
          <p>
            {r.categoryCode} · {r.channel}
          </p>
          {r.pickedUnit ? <p className="text-primary">{f.picked(r)}</p> : null}
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {f.money(r, r.totalMinor)}
        </p>
      </div>
      <RowAction row={r} onAssign={onAssign} />
    </div>
  );
}
