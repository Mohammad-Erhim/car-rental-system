import { useI18n } from '@carrental/i18n/react';
import { PackageOpen, SearchX, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { RentalCard, useRentalColumns, type RentalAction } from './rental-columns';
import { IncidentDialog, PickupDialog, ReadinessDialog, ReturnDialog } from './rental-dialogs';

import { DataTable } from '@/components/data-table/data-table';
import { FilterChips } from '@/components/filter-chips';
import { FiltersSheet, useFilterFields } from '@/components/filters-sheet';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLocationScope } from '@/lib/location-scope';
import { useOpsRentals, type RentalBoardRow } from '@/lib/rental-hooks';
import { PAGE_SIZES, useListParams } from '@/lib/use-list-params';

const FILTERS = ['state', 'flow', 'location', 'from', 'to'] as const;
const STATE_TABS = ['', 'awaiting_pickup', 'active', 'overdue', 'closed'] as const;
const getRowId = (r: RentalBoardRow) => r.reference;

/**
 * SCREEN-OPS-009/012/016 — the rental board. State tabs (with live counts) narrow the list; the
 * rest of the filters sit behind a side sheet. Pickup, return, incident and readiness are modals
 * opened from a row, so the list never reflows around an inline form. Confined to the actor's
 * pickup locations by the API; an `active` rental past its return time is flagged overdue live.
 * Everything is URL-backed.
 */
export function RentalsPage() {
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const { state, update, reset } = useListParams(FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const fieldOf = useFilterFields();
  const [action, setAction] = useState<{ row: RentalBoardRow; kind: RentalAction } | null>(null);

  // seed the location filter from the global switcher on first load only
  const { selected: globalLocation, options: locations } = useLocationScope();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (!state.location && globalLocation) update({ location: globalLocation });
  }, []);

  const flow = state.flow === 'pickup' || state.flow === 'return' ? state.flow : undefined;
  const list = useOpsRentals({
    state: state.state || undefined,
    locationCode: state.location || undefined,
    flow,
    from: state.from || undefined,
    to: state.to || undefined,
    page: state.page,
    pageSize: state.pageSize,
  });
  const data = list.data;
  const columns = useRentalColumns((row, kind) => setAction({ row, kind }));

  const filterCount = [flow, state.location, state.from, state.to].filter(Boolean).length;
  const anyFilter = filterCount > 0 || !!state.state;
  const chips: Array<{ key: 'flow' | 'location' | 'from' | 'to'; label: string }> = [];
  if (flow) {
    chips.push({
      key: 'flow',
      label: flow === 'pickup' ? t('ops.rent.flowPickup') : t('ops.rent.flowReturn'),
    });
  }
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

  const counts = data?.stateCounts;
  const tabLabel = (value: (typeof STATE_TABS)[number]) => {
    const label = value ? t(`ops.rent.stateLabel.${value}`) : t('ops.rent.tabAll');
    const n = counts?.[value || 'all'];
    return n === undefined ? label : `${label} (${fmt.number(n)})`;
  };

  const closeAction = (open: boolean) => {
    if (!open) setAction(null);
  };

  return (
    <Page>
      <PageHeader title={t('ops.rent.title')} description={t('ops.rent.subtitle')} />

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:justify-between sm:p-5">
          <StateSwitcher
            className="flex-1 sm:flex-none"
            label={t('ops.rent.filterState')}
            value={state.state || 'all'}
            onChange={(v) => update({ state: v === 'all' ? '' : v })}
            testIdPrefix="ops-rent-tab"
            options={STATE_TABS.map((s) => ({ value: s || 'all', label: tabLabel(s) }))}
          />
          <Button
            variant="outline"
            className="h-11 shrink-0 sm:h-10"
            onClick={() => setFiltersOpen(true)}
            data-testid="ops-rent-filters"
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

      <section aria-label={t('ops.rent.title')} data-testid="rental-list">
        <DataTable
          label={t('ops.rent.title')}
          columns={columns}
          data={data?.results ?? []}
          getRowId={getRowId}
          loading={list.isLoading}
          fetching={list.isFetching}
          onRowClick={(r) => navigate(`/rentals/${encodeURIComponent(r.reference)}`)}
          cardBreakpoint="xl"
          renderCard={(r) => (
            <RentalCard row={r} onAction={(row, kind) => setAction({ row, kind })} />
          )}
          skeletonRows={Math.min(state.pageSize, 8)}
          error={
            list.isError ? (
              <StateView
                kind="error"
                title={t('ops.rent.loadFail')}
                description={t('state.failure.body')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void list.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={
            anyFilter ? (
              <StateView
                icon={SearchX}
                title={t('ops.rent.emptyFiltered')}
                description={t('ops.rent.emptyFilteredBody')}
                className="py-14"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  data-testid="rental-clear-filters"
                >
                  {t('ops.rent.clearFilters')}
                </Button>
              </StateView>
            ) : (
              <StateView
                icon={PackageOpen}
                title={t('ops.rent.empty')}
                description={t('ops.rent.emptyBody')}
                className="py-14"
              />
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
        fields={[
          {
            type: 'select',
            name: 'flow',
            label: t('ops.rent.filterFlow'),
            anyLabel: t('ops.rent.anyFlow'),
            options: [
              { value: 'pickup', label: t('ops.rent.flowPickup') },
              { value: 'return', label: t('ops.rent.flowReturn') },
            ],
          },
          fieldOf.location(locations),
          fieldOf.dates(),
        ]}
        values={{ flow: flow ?? '', location: state.location, from: state.from, to: state.to }}
        onApply={(v) =>
          update({ flow: v.flow ?? '', location: v.location, from: v.from, to: v.to })
        }
      />

      {action?.kind === 'pickup' ? (
        <PickupDialog
          reference={action.row.reference}
          defaultDriver={action.row.driverName}
          open
          onOpenChange={closeAction}
        />
      ) : null}
      {action?.kind === 'return' ? (
        <ReturnDialog
          reference={action.row.reference}
          currency={action.row.currency}
          odometerOutKm={action.row.odometerOutKm}
          fuelOutPct={action.row.fuelOutPct}
          open
          onOpenChange={closeAction}
        />
      ) : null}
      {action?.kind === 'incident' ? (
        <IncidentDialog
          reference={action.row.reference}
          categoryCode={action.row.categoryCode}
          locationCode={action.row.pickupLocationCode}
          open
          onOpenChange={closeAction}
        />
      ) : null}
      {action?.kind === 'readiness' ? (
        <ReadinessDialog reference={action.row.reference} open onOpenChange={closeAction} />
      ) : null}
    </Page>
  );
}
