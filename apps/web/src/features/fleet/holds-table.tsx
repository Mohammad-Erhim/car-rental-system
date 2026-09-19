import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';

import { useBlockKindLabel } from './fleet-dialogs';

import { DataTable } from '@/components/data-table/data-table';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocationScope } from '@/lib/location-scope';
import { useFleetBlocks, type FleetBlock } from '@/lib/ops-discovery-hooks';

const getRowId = (b: FleetBlock) => b.id;

/** Vehicles currently held out of bookings — maintenance, damage or an admin hold. */
export function HoldsTable({ onRelease }: { onRelease: (block: FleetBlock) => void }) {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('fleet.manage');
  const { codes: locationCode } = useLocationScope();
  const blocks = useFleetBlocks('active', locationCode);
  const kindLabel = useBlockKindLabel();

  const columns = useMemo<ColumnDef<FleetBlock, unknown>[]>(
    () => [
      {
        id: 'plate',
        header: t('ops.tbl.plate'),
        cell: ({ row: { original: b } }) => (
          <span className="bidi-isolate font-mono text-sm font-semibold">{b.plate}</span>
        ),
      },
      {
        id: 'kind',
        header: t('ops.fin.kind'),
        cell: ({ row: { original: b } }) => <Badge variant="warning">{kindLabel(b.kind)}</Badge>,
      },
      {
        id: 'reason',
        header: t('ops.fleet.reason'),
        cell: ({ row: { original: b } }) => (
          <span className="text-muted-foreground">
            {b.reasonCode ? b.reasonCode.replace(/_/g, ' ') : '—'}
          </span>
        ),
      },
      {
        id: 'since',
        header: t('ops.fleet.since'),
        cell: ({ row: { original: b } }) => (
          <span className="whitespace-nowrap text-muted-foreground">{fmt.dateTime(b.startAt)}</span>
        ),
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
              meta: { className: 'text-end' },
              cell: ({ row: { original: b } }: { row: { original: FleetBlock } }) => (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRelease(b)}
                  data-testid={`fleet-block-release-${b.id}`}
                >
                  {t('ops.fleet.release')}
                </Button>
              ),
            } satisfies ColumnDef<FleetBlock, unknown>,
          ]
        : []),
    ],
    [t, fmt, kindLabel, canManage, onRelease],
  );

  return (
    <DataTable
      label={t('ops.fleet.blocks')}
      columns={columns}
      data={blocks.data ?? []}
      getRowId={getRowId}
      loading={blocks.isLoading}
      fetching={blocks.isFetching}
      bodyTestId="fleet-block-rows"
      renderCard={(b) => (
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1">
            <p className="bidi-isolate font-mono text-sm font-semibold">{b.plate}</p>
            <p className="text-xs text-muted-foreground">
              {kindLabel(b.kind)} · {fmt.dateTime(b.startAt)}
            </p>
          </div>
          {canManage ? (
            <Button size="sm" variant="outline" onClick={() => onRelease(b)}>
              {t('ops.fleet.release')}
            </Button>
          ) : null}
        </div>
      )}
      error={
        blocks.isError ? (
          <StateView
            kind="error"
            title={t('ops.fleet.blocksLoadFail')}
            actionLabel={t('ops.st.retry')}
            onAction={() => void blocks.refetch()}
            className="py-14"
          />
        ) : undefined
      }
      empty={<StateView icon={ShieldCheck} title={t('ops.fleet.noBlocks')} className="py-14" />}
    />
  );
}
