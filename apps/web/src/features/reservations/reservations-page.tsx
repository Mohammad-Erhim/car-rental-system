import { useI18n } from '@carrental/i18n/react';
import { CheckCircle2, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AssignVehicleDialog } from './assign-vehicle-dialog';
import { ReservationCard, useReservationColumns } from './reservation-columns';

import { DataTable } from '@/components/data-table/data-table';
import { FiltersSheet } from '@/components/filters-sheet';
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

const FILTERS = ['view', 'state', 'location', 'from', 'to'] as const;
const getRowId = (r: OpsReservationRow) => r.reference;

/**
 * SCREEN-OPS-004 — the staff reservation queue. Two views: "Needs action" (the actionable
 * default — confirmed reservations with no rental yet, soonest pickup first) and "All" (the
 * browsable list). Filters live behind a side sheet; assigning a vehicle is a modal. Confined to
 * the actor's pickup locations by the API, and every control is URL-backed so a view is shareable
 * and survives a refresh.
 */
export function ReservationsPage() {
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const { state, update, reset } = useListParams(FILTERS);
  const view: 'queue' | 'all' = state.view === 'all' ? 'all' : 'queue';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<OpsReservationRow | null>(null);

  // seed the location filter from the global switcher on first load only — never fights a value
  // the operator has since set (or cleared) here
  const { selected: globalLocation, options: locations } = useLocationScope();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (!state.location && globalLocation) update({ location: globalLocation });
  }, []);

  const list = useOpsReservations({
    view,
    state: view === 'all' ? state.state : undefined,
    locationCode: state.location,
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
  const filterCount = [stateFilter, state.location, state.from, state.to].filter(Boolean).length;
  const chips: Array<{ key: 'state' | 'location' | 'from' | 'to'; label: string }> = [];
  if (stateFilter) chips.push({ key: 'state', label: t(`ops.status.${stateFilter}`) });
  if (state.location) {
    chips.push({
      key: 'location',
      label: locations.find((l) => l.code === state.location)?.name ?? state.location,
    });
  }
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

        {chips.length ? (
          <ul
            className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-4 py-3 sm:px-5"
            aria-label={t('ops.search.filters')}
          >
            {chips.map((c) => (
              <li key={c.key}>
                <Badge variant="secondary" className="gap-1 py-1 ps-2.5 pe-1 text-xs font-medium">
                  {c.label}
                  <button
                    type="button"
                    onClick={() => update({ [c.key]: '' })}
                    aria-label={t('ops.search.removeFilter', { name: c.label })}
                    className="grid size-4 place-items-center rounded-full hover:bg-foreground/10"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <section aria-label={t('ops.queue.title')} data-testid="ops-res-table">
        <DataTable
          label={t('ops.queue.title')}
          columns={columns}
          data={data?.results ?? []}
          getRowId={getRowId}
          loading={list.isLoading}
          fetching={list.isFetching}
          onRowClick={(r) => navigate(`/work/${encodeURIComponent(r.reference)}`)}
          renderCard={(r) => <ReservationCard row={r} onAssign={setAssignTarget} />}
          bodyTestId="ops-res-rows"
          skeletonRows={Math.min(state.pageSize, 8)}
          error={
            list.isError ? (
              <StateView
                kind="error"
                title={t('ops.queue.loadFail')}
                description={t('state.failure.body')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void list.refetch()}
                className="py-14"
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
        values={{ status: stateFilter, location: state.location, from: state.from, to: state.to }}
        statuses={view === 'all' ? RESERVATION_STATES : []}
        locations={locations}
        onApply={(v) => update({ state: v.status, location: v.location, from: v.from, to: v.to })}
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
