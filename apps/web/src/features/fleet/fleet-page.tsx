import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { CarFront, FileUp, Loader2, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { UnitCard, useUnitColumns, useUnitStateLabel } from './fleet-columns';
import { BlockDialog, RetireDialog, ReleaseDialog, TransferDialog } from './fleet-dialogs';
import { HoldsTable } from './holds-table';
import { ImportUnitsDialog } from './import-units-dialog';
import { UnitSheet } from './unit-sheet';

import { CountPills } from '@/components/count-pills';
import { DataTable } from '@/components/data-table/data-table';
import { FiltersSheet } from '@/components/filters-sheet';
import { ListError } from '@/components/list-error';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLocationScope } from '@/lib/location-scope';
import {
  useFleetBlocks,
  useOpsCategories,
  useOpsUnits,
  type FleetBlock,
  type OpsUnit,
} from '@/lib/ops-discovery-hooks';
import { PAGE_SIZES, useListParams } from '@/lib/use-list-params';
import { useSearchBox } from '@/lib/use-search-box';

const FILTERS = ['view', 'q', 'state', 'category'] as const;
const UNIT_STATES = ['available', 'on_rent', 'prep', 'maintenance', 'out_of_service', 'retired'];
const getRowId = (u: OpsUnit) => u.id;

type Modal =
  | { kind: 'sheet'; unit: OpsUnit | null }
  | { kind: 'block' | 'transfer' | 'retire'; unit: OpsUnit }
  | { kind: 'release'; block: FleetBlock }
  | { kind: 'import' };

/**
 * SCREEN-OPS-013 / 017 / 018 — fleet inventory. Find a vehicle (search + state pills + filters),
 * and — for a `fleet.manage` holder — add, edit, hold, transfer or retire it. A second view lists
 * the active holds. Every write is a sheet or a modal; nothing edits inline. Confined to the
 * actor's locations by the API; all state lives in the URL.
 */
export function FleetPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('fleet.manage');
  const stateLabel = useUnitStateLabel();
  const { state, update, reset } = useListParams(FILTERS);
  const view = state.view === 'holds' ? 'holds' : 'vehicles';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);

  // which branches — the top-bar filter, the single source (`?location=` in this URL). Cars can
  // only be added at an active branch the account may see.
  const { codes: locationCode, options } = useLocationScope();
  const createLocations = useMemo(() => options.filter((o) => o.status === 'active'), [options]);

  const search = useSearchBox(state.q, (q) => update({ q }));
  const categories = useOpsCategories();
  const holds = useFleetBlocks('active', locationCode);

  const units = useOpsUnits(
    {
      locationCode,
      categoryCode: state.category || undefined,
      state: state.state || undefined,
      q: state.q || undefined,
      page: state.page,
      pageSize: state.pageSize,
    },
    { keepPrevious: true },
  );
  const data = units.data;

  // a `damage` / `admin_block` doesn't change the unit's state, so a row can read "available"
  // while the vehicle is actually held out of bookings — surface that on the row
  const holdsByUnit = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const b of holds.data ?? []) map.set(b.unitId, [...(map.get(b.unitId) ?? []), b.kind]);
    return map;
  }, [holds.data]);

  const columns = useUnitColumns(holdsByUnit, (unit, action) =>
    setModal(action === 'edit' ? { kind: 'sheet', unit } : { kind: action, unit }),
  );

  const filterCount = [state.category].filter(Boolean).length;
  const anyFilter = filterCount > 0 || !!state.q || !!state.state;
  const chips: Array<{ key: 'category'; label: string }> = [];
  if (state.category) {
    chips.push({
      key: 'category',
      label: categories.data?.find((c) => c.code === state.category)?.displayName ?? state.category,
    });
  }

  const counts = data?.stateCounts;
  const pills = [
    { value: '', label: t('ops.fleet.tabAllStates'), count: counts?.all },
    ...UNIT_STATES.map((s) => ({ value: s, label: stateLabel(s), count: counts?.[s] ?? 0 })),
  ];

  const close = (open: boolean) => {
    if (!open) setModal(null);
  };

  return (
    <Page>
      <PageHeader
        title={t('ops.fleet.title')}
        description={t('ops.fleet.subtitle')}
        actions={
          canManage ? (
            <>
              <Button variant="outline" onClick={() => setModal({ kind: 'import' })}>
                <FileUp aria-hidden="true" />
                {t('ops.fleet.import')}
              </Button>
              <Button
                onClick={() => setModal({ kind: 'sheet', unit: null })}
                data-testid="fleet-add"
              >
                <Plus aria-hidden="true" />
                {t('ops.fleet.addVehicle')}
              </Button>
            </>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:justify-between sm:p-5">
          <StateSwitcher
            className="flex-1 sm:flex-none"
            label={t('ops.fleet.title')}
            value={view}
            onChange={(v) => update({ view: v === 'holds' ? 'holds' : '' })}
            testIdPrefix="fleet-tab"
            options={[
              { value: 'vehicles', label: t('ops.fleet.tabVehicles') },
              {
                value: 'holds',
                label: holds.data
                  ? `${t('ops.fleet.tabHolds')} (${holds.data.length})`
                  : t('ops.fleet.tabHolds'),
              },
            ]}
          />
          {view === 'vehicles' ? (
            <Button
              variant="outline"
              className="h-11 shrink-0 sm:h-10"
              onClick={() => setFiltersOpen(true)}
              data-testid="fleet-filters"
            >
              <SlidersHorizontal aria-hidden="true" />
              {t('ops.search.filters')}
              {filterCount ? (
                <Badge className="ms-0.5 px-1.5 tabular-nums">{filterCount}</Badge>
              ) : null}
            </Button>
          ) : null}
        </div>

        {view === 'vehicles' ? (
          <div className="space-y-4 border-t bg-muted/20 p-4 sm:p-5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search.draft}
                onChange={(e) => search.setDraft(e.target.value)}
                placeholder={t('ops.fleet.searchPlaceholder')}
                aria-label={t('ops.fleet.searchLabel')}
                autoComplete="off"
                data-testid="fleet-search"
                className="h-11 bg-background ps-10 pe-10 text-base [&::-webkit-search-cancel-button]:hidden"
              />
              {units.isFetching ? (
                <Loader2
                  className="absolute end-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              ) : search.draft ? (
                <button
                  type="button"
                  onClick={search.clear}
                  aria-label={t('action.clear')}
                  className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <CountPills
              label={t('ops.fleet.filterState')}
              pills={pills}
              value={state.state}
              onChange={(v) => update({ state: v })}
            />

            {chips.length ? (
              <ul
                className="flex flex-wrap items-center gap-2"
                aria-label={t('ops.search.filters')}
              >
                {chips.map((c) => (
                  <li key={c.key}>
                    <Badge
                      variant="secondary"
                      className="gap-1 py-1 ps-2.5 pe-1 text-xs font-medium"
                    >
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
          </div>
        ) : null}
      </Card>

      {view === 'holds' ? (
        <section aria-label={t('ops.fleet.blocks')} data-testid="fleet-block-table">
          <HoldsTable onRelease={(block) => setModal({ kind: 'release', block })} />
        </section>
      ) : (
        <section aria-label={t('ops.fleet.title')} data-testid="fleet-table">
          <DataTable
            label={t('ops.fleet.title')}
            columns={columns}
            data={data?.results ?? []}
            getRowId={getRowId}
            loading={units.isLoading}
            fetching={units.isFetching}
            bodyTestId="fleet-rows"
            renderCard={(u) => (
              <UnitCard
                unit={u}
                holds={holdsByUnit.get(u.id) ?? []}
                onAction={(unit, action) =>
                  setModal(action === 'edit' ? { kind: 'sheet', unit } : { kind: action, unit })
                }
              />
            )}
            skeletonRows={Math.min(state.pageSize, 8)}
            error={
              units.isError ? (
                <ListError
                  error={units.error}
                  title={t('ops.fleet.loadFail')}
                  onRetry={() => void units.refetch()}
                />
              ) : undefined
            }
            empty={
              <StateView
                icon={CarFront}
                title={anyFilter ? t('state.noResults.title') : t('ops.fleet.empty')}
                description={anyFilter ? t('ops.fleet.emptyFiltered') : undefined}
                className="py-14"
              >
                {anyFilter ? (
                  <Button variant="outline" size="sm" onClick={reset} data-testid="fleet-clear">
                    {t('ops.search.clearAll')}
                  </Button>
                ) : canManage ? (
                  <Button size="sm" onClick={() => setModal({ kind: 'sheet', unit: null })}>
                    <Plus aria-hidden="true" />
                    {t('ops.fleet.addVehicle')}
                  </Button>
                ) : null}
              </StateView>
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
      )}

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        fields={[
          {
            type: 'select',
            name: 'category',
            label: t('ops.tbl.category'),
            anyLabel: t('ops.fleet.anyCategory'),
            options: (categories.data ?? []).map((c) => ({ value: c.code, label: c.displayName })),
          },
        ]}
        values={{ category: state.category }}
        onApply={(v) => update({ category: v.category ?? '' })}
      />

      {modal?.kind === 'sheet' ? (
        <UnitSheet unit={modal.unit} locations={createLocations} open onOpenChange={close} />
      ) : null}
      {modal?.kind === 'block' ? (
        <BlockDialog
          unit={modal.unit}
          activeHolds={holdsByUnit.get(modal.unit.id)?.length ?? 0}
          open
          onOpenChange={close}
        />
      ) : null}
      {modal?.kind === 'transfer' ? (
        <TransferDialog unit={modal.unit} open onOpenChange={close} />
      ) : null}
      {modal?.kind === 'retire' ? (
        <RetireDialog unit={modal.unit} open onOpenChange={close} />
      ) : null}
      {modal?.kind === 'release' ? (
        <ReleaseDialog block={modal.block} open onOpenChange={close} />
      ) : null}
      {modal?.kind === 'import' ? <ImportUnitsDialog open onOpenChange={close} /> : null}
    </Page>
  );
}
