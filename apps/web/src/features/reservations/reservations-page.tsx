import { useI18n } from '@carrental/i18n/react';
import { CheckCircle2, SearchX, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AssignVehicleDialog } from './assign-vehicle-dialog';
import { ReservationCard, useReservationColumns } from './reservation-columns';

import { paths } from '@/app/paths';
import { DataTable } from '@/components/data-table/data-table';
import { FilterChips } from '@/components/filter-chips';
import { FiltersSheet, useFilterFields } from '@/components/filters-sheet';
import { ListError } from '@/components/list-error';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLocationScope } from '@/lib/location-scope';
import { useOpsReservations, type OpsReservationRow } from '@/lib/reservation-hooks';
import { RESERVATION_STATES } from '@/lib/statuses';
import { PAGE_SIZES, useListParams } from '@/lib/use-list-params';

const FILTERS = ['view', 'state', 'from', 'to'] as const;
const getRowId = (r: OpsReservationRow) => r.reference;

/**
 * SCREEN-OPS-004 — the staff reservation queue. Two views: "Needs action" (the actionable
 * default — confirmed reservations with no rental yet, soonest pickup first) and "All" (the
 * browsable list). Filters live behind a side sheet; assigning a vehicle is a modal. Confined to
 * the actor's locations by the API (the top-bar filter narrows further), and every control is URL-backed so a view is shareable
 * and survives a refresh.
 */
export function ReservationsPage() {
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const { state, update, reset } = useListParams(FILTERS);
  const view: 'queue' | 'all' = state.view === 'all' ? 'all' : 'queue';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const fieldOf = useFilterFields();
  const [assignTarget, setAssignTarget] = useState<OpsReservationRow | null>(null);

  // which branches — the top-bar filter, the single source (`?location=` in this URL)
  const { codes: locationCode } = useLocationScope();

  const list = useOpsReservations({
    view,
    state: view === 'all' ? state.state : undefined,
    locationCode,
    from: state.from,
    to: state.to,
    page: state.page,
    pageSize: state.pageSize,
  });
  const data = list.data;

  const columns = useReservationColumns(setAssignTarget);

  // switching views drops a status filter that only makes sense in "all"
  const setView = (v: string) => update({ view: v === 'all' ? 'all' : '', state: '' });

  const stateFilter = view === 'all' ? state.state : '';
  const filterCount = [stateFilter, state.from, state.to].filter(Boolean).length;
  const chips: Array<{ key: 'state' | 'from' | 'to'; label: string }> = [];
  if (stateFilter) chips.push({ key: 'state', label: t(`ops.status.${stateFilter}`) });
  if (state.from)
    chips.push({ key: 'from', label: t('ops.search.fromChip', { date: fmt.date(state.from) }) });
  if (state.to)
    chips.push({ key: 'to', label: t('ops.search.toChip', { date: fmt.date(state.to) }) });

  const queueCount = data?.queueCount;
  const emptyQueue = view === 'queue' && filterCount === 0;

  return (
    <Page>
      <PageHeader title={t('ops.queue.title')} description={t('ops.queue.subtitle')} />

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:justify-between sm:p-5">
          <StateSwitcher
            className="flex-1 sm:flex-none"
            label={t('ops.queue.title')}
            value={view}
            onChange={setView}
            testIdPrefix="ops-queue-tab"
            options={[
              {
                value: 'queue',
                label: queueCount
                  ? `${t('ops.queue.tabQueue')} (${fmt.number(queueCount)})`
                  : t('ops.queue.tabQueue'),
              },
              { value: 'all', label: t('ops.queue.tabAll') },
            ]}
          />
          <Button
            variant="outline"
            className="h-11 shrink-0 sm:h-10"
            onClick={() => setFiltersOpen(true)}
            data-testid="ops-queue-filters"
          >
            <SlidersHorizontal aria-hidden="true" />
            {t('ops.search.filters')}
            {filterCount ? (
              <Badge className="ms-0.5 px-1.5 tabular-nums">{filterCount}</Badge>
            ) : null}
          </Button>
        </div>

        <FilterChips chips={chips} onRemove={(key) => update({ [key]: '' })} />
      </Card>

      <section aria-label={t('ops.queue.title')} data-testid="ops-res-table">
        <DataTable
          label={t('ops.queue.title')}
          columns={columns}
          data={data?.results ?? []}
          getRowId={getRowId}
          loading={list.isLoading}
          fetching={list.isFetching}
          onRowClick={(r) => navigate(paths.reservation(r.reference))}
          renderCard={(r) => <ReservationCard row={r} onAssign={setAssignTarget} />}
          bodyTestId="ops-res-rows"
          skeletonRows={Math.min(state.pageSize, 8)}
          error={
            list.isError ? (
              <ListError
                error={list.error}
                title={t('ops.queue.loadFail')}
                onRetry={() => void list.refetch()}
              />
            ) : undefined
          }
          empty={
            emptyQueue ? (
              <StateView
                icon={CheckCircle2}
                title={t('ops.queue.tabQueue')}
                description={t('ops.queue.queueClear')}
                className="py-14 [&>span]:bg-success/10 [&>span]:text-success"
              />
            ) : (
              <StateView
                icon={SearchX}
                title={t('state.noResults.title')}
                description={t('ops.queue.empty')}
                className="py-14"
              >
                {filterCount ? (
                  <Button variant="outline" size="sm" onClick={reset}>
                    {t('ops.search.clearAll')}
                  </Button>
                ) : null}
              </StateView>
            )
          }
          pagination={
            data
              ? {
                  page: data.page,
                  pageSize: data.pageSize,
                  total: data.total,
                  pageSizeOptions: PAGE_SIZES,
                  onPageChange: (page) => update({ page }),
                  onPageSizeChange: (pageSize) => update({ pageSize }),
                }
              : undefined
          }
        />
      </section>

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        fields={[...(view === 'all' ? [fieldOf.status(RESERVATION_STATES)] : []), fieldOf.dates()]}
        values={{ status: stateFilter, from: state.from, to: state.to }}
        onApply={(v) => update({ state: v.status ?? '', from: v.from, to: v.to })}
      />

      {assignTarget ? (
        <AssignVehicleDialog
          target={assignTarget}
          open
          onOpenChange={(open) => {
            if (!open) setAssignTarget(null);
          }}
        />
      ) : null}
    </Page>
  );
}
