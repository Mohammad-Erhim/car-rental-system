import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Input,
  PageHeader,
  Toolbar,
  type DataTableColumn,
} from '@carrental/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { formatMinor } from '../../lib/discovery-hooks.js';
import { useAssignVehicle } from '../../lib/rental-hooks.js';
import { useOpsReservations } from '../../lib/reservation-hooks.js';

type Row = NonNullable<ReturnType<typeof useOpsReservations>['data']>[number];

/**
 * SCREEN-OPS-004 — reservation queue. Filter by state / pickup location; read-only list for the
 * agent, with an inline "assign vehicle" action on confirmed rows.
 */
export function ReservationQueuePage() {
  const { t } = useI18n();
  // Filters live in the URL so the operational-dashboard cards can deep-link into a
  // pre-filtered queue (e.g. /work?state=confirmed) and the view stays shareable.
  const [params, setParams] = useSearchParams();
  const state = params.get('state') ?? '';
  const setState = (v: string) =>
    setParams(
      (p) => {
        if (v) p.set('state', v);
        else p.delete('state');
        return p;
      },
      { replace: true },
    );
  const [locationCode, setLocationCode] = useState(() => params.get('location') ?? '');
  const rows = useOpsReservations({
    state: state || undefined,
    locationCode: locationCode || undefined,
  });
  const assign = useAssignVehicle();
  const [assignMsg, setAssignMsg] = useState<string | null>(null);

  const selectClass =
    'flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  const columns: Array<DataTableColumn<Row>> = [
    {
      key: 'reference',
      header: t('ops.tbl.reference'),
      cell: (r) => r.reference,
      className: 'bidi-isolate font-mono text-xs',
    },
    {
      key: 'state',
      header: t('ops.tbl.state'),
      cell: (r) => (
        <Badge
          variant={
            r.state === 'confirmed' ? 'success' : r.state === 'cancelled' ? 'neutral' : 'warning'
          }
        >
          {r.state}
        </Badge>
      ),
    },
    { key: 'channel', header: t('ops.tbl.channel'), cell: (r) => r.channel },
    { key: 'category', header: t('ops.tbl.category'), cell: (r) => r.categoryCode },
    {
      key: 'pickup',
      header: t('ops.tbl.pickup'),
      cell: (r) => new Date(r.pickupAt).toLocaleString(),
    },
    {
      key: 'total',
      header: t('ops.tbl.total'),
      cell: (r) => formatMinor(r.totalMinor, r.currency),
    },
    { key: 'paid', header: t('ops.tbl.paid'), cell: (r) => formatMinor(r.paidMinor, r.currency) },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (r) =>
        r.state === 'confirmed' ? (
          <Button
            size="sm"
            variant="ghost"
            loading={assign.isPending}
            data-testid={`assign-${r.reference}`}
            onClick={async () => {
              setAssignMsg(null);
              try {
                await assign.mutateAsync(r.reference);
                setAssignMsg(t('ops.queue.assigned', { ref: r.reference }));
              } catch {
                setAssignMsg(t('ops.queue.assignFail', { ref: r.reference }));
              }
            }}
          >
            {t('ops.queue.assign')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.queue.title')} description={t('ops.queue.subtitle')} />

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">{t('ops.queue.card')}</CardTitle>
          <Toolbar aria-label={t('ops.queue.card')}>
            <select
              aria-label={t('ops.queue.filterState')}
              className={selectClass}
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">{t('ops.queue.allStates')}</option>
              {['pending', 'confirmed', 'cancelled', 'no_show', 'fulfilled'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Input
              placeholder={t('ops.queue.locPlaceholder')}
              aria-label={t('ops.queue.filterLoc')}
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
              className="max-w-[14rem]"
            />
          </Toolbar>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={rows.data}
            rowKey={(r) => r.reference}
            isLoading={rows.isLoading}
            isError={rows.isError}
            onRetry={() => rows.refetch()}
            rowProps={(r) => ({ 'data-ref': r.reference })}
            testid="ops-res-table"
            bodyTestid="ops-res-rows"
            minWidth="44rem"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.queue.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.queue.empty'),
            }}
          />
          {assignMsg ? (
            <p className="mt-2 text-sm text-muted-foreground" data-testid="assign-msg">
              {assignMsg}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
