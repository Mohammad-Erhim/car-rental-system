import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, ClipboardList, KeyRound } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import type { SearchHit } from '@/lib/admin-hooks';

/** `RES-1 → RES-2` when the return branch differs, else just the branch. */
function locationRange(h: SearchHit): string {
  return h.returnLocationCode !== h.locationCode
    ? `${h.locationCode} → ${h.returnLocationCode}`
    : h.locationCode;
}

/** Reservation vs rental, always as text + icon (never colour alone). */
export function KindBadge({ kind }: { kind: SearchHit['kind'] }) {
  const { t } = useI18n();
  return kind === 'rental' ? (
    <Badge variant="success">
      <KeyRound aria-hidden="true" />
      {t('ops.search.rental')}
    </Badge>
  ) : (
    <Badge variant="secondary">
      <ClipboardList aria-hidden="true" />
      {t('ops.search.reservation')}
    </Badge>
  );
}

/** Formatting shared by the table and the phone cards. */
export function useHitFormat() {
  const { fmt } = useI18n();
  return useMemo(
    () => ({
      window: (h: SearchHit) => `${fmt.date(h.pickupAt)} → ${fmt.date(h.returnAt)}`,
      location: locationRange,
      money: (h: SearchHit) =>
        h.totalMinor == null || !h.currency
          ? '—'
          : fmt.money({ amountMinor: h.totalMinor, currency: h.currency }),
      vehicle: (h: SearchHit) => [h.categoryCode, h.plate].filter(Boolean).join(' · ') || '—',
    }),
    [fmt],
  );
}

export function useSearchColumns(): ColumnDef<SearchHit, unknown>[] {
  const { t } = useI18n();
  const f = useHitFormat();

  return useMemo<ColumnDef<SearchHit, unknown>[]>(
    () => [
      {
        id: 'reference',
        header: t('ops.search.reference'),
        cell: ({ row: { original: h } }) => (
          <div className="space-y-0.5">
            <Link
              to={h.href}
              // the row itself is clickable — don't navigate twice
              onClick={(e) => e.stopPropagation()}
              className="bidi-isolate inline-block whitespace-nowrap font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {h.reference}
            </Link>
            {h.reservationReference ? (
              <p className="bidi-isolate whitespace-nowrap font-mono text-xs text-muted-foreground">
                ← {h.reservationReference}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'kind',
        header: t('ops.search.kind'),
        // the reference prefix and the tabs already say it — first to go on narrow screens
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row: { original: h } }) => <KindBadge kind={h.kind} />,
      },
      {
        id: 'status',
        header: t('ops.tbl.status'),
        cell: ({ row: { original: h } }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge status={h.status} />
            {h.overdue && h.status !== 'overdue' ? <StatusBadge status="overdue" /> : null}
          </div>
        ),
      },
      {
        id: 'driver',
        header: t('ops.search.driver'),
        cell: ({ row: { original: h } }) => (
          <span className="font-medium">{h.driverName ?? '—'}</span>
        ),
      },
      {
        id: 'vehicle',
        header: t('ops.search.vehicle'),
        meta: { className: 'hidden min-[1360px]:table-cell' },
        cell: ({ row: { original: h } }) => (
          <span className="text-muted-foreground">{f.vehicle(h)}</span>
        ),
      },
      {
        id: 'window',
        header: t('ops.search.window'),
        cell: ({ row: { original: h } }) => (
          <div className="space-y-0.5 text-muted-foreground">
            <p className="whitespace-nowrap">{f.window(h)}</p>
            <p className="text-xs">{f.location(h)}</p>
          </div>
        ),
      },
      {
        id: 'total',
        header: t('ops.search.total'),
        meta: { className: 'text-end' },
        cell: ({ row: { original: h } }) => (
          <span className="font-medium tabular-nums">{f.money(h)}</span>
        ),
      },
      {
        id: 'open',
        header: () => <span className="sr-only">{t('action.viewDetails')}</span>,
        meta: { className: 'w-10 pe-4 ps-0 text-end' },
        cell: () => (
          <ArrowRight
            className="size-4 text-muted-foreground rtl:-scale-x-100"
            aria-hidden="true"
          />
        ),
      },
    ],
    [t, f],
  );
}

/** Phone layout for one hit. */
export function SearchResultCard({ hit: h }: { hit: SearchHit }) {
  const f = useHitFormat();
  return (
    <Link
      to={h.href}
      className="block space-y-2 p-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-primary">{h.reference}</p>
          {h.reservationReference ? (
            <p className="font-mono text-xs text-muted-foreground">← {h.reservationReference}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <KindBadge kind={h.kind} />
          <StatusBadge status={h.status} />
        </div>
      </div>
      <p className="text-sm font-medium">{h.driverName ?? '—'}</p>
      <div className="flex items-end justify-between gap-3 text-xs text-muted-foreground">
        <div className="min-w-0 space-y-0.5">
          <p>
            {f.window(h)} · {f.location(h)}
          </p>
          <p>{f.vehicle(h)}</p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{f.money(h)}</p>
      </div>
    </Link>
  );
}
