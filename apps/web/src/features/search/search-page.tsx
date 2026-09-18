import { useDebounced } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Loader2, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { SearchResultCard, useSearchColumns } from './search-columns';
import { PAGE_SIZES, activeFilterCount, useSearchState, type SearchKind } from './use-search-state';

import { DataTable } from '@/components/data-table/data-table';
import { FiltersSheet } from '@/components/filters-sheet';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { opsSearchReady, useOpsSearch, type SearchHit } from '@/lib/admin-hooks';
import { useLocationScope } from '@/lib/location-scope';
import { RENTAL_STATES, RESERVATION_STATES } from '@/lib/statuses';

/** Statuses that can exist for the selected kind (all of them when no kind is selected). */
function statusOptions(kind: SearchKind): string[] {
  if (kind === 'reservation') return RESERVATION_STATES;
  if (kind === 'rental') return RENTAL_STATES;
  return [...new Set([...RESERVATION_STATES, ...RENTAL_STATES])];
}

const getRowId = (h: SearchHit) => `${h.kind}:${h.reference}`;

/**
 * SCREEN-OPS-004 / FR-ADM-003 — one search across reservations and rentals. Free text matches a
 * reference, the primary driver, or (rentals) the vehicle plate; the kind tabs, the filters
 * panel and the page number all live in the URL, so a search is shareable and survives a refresh.
 * The text box is debounced (no submit button). Each row opens the surface that owns the next
 * action, already scrolled to the record.
 */
export function SearchPage() {
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const { state, update, reset } = useSearchState();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const columns = useSearchColumns();

  // seed the location filter from the global switcher on first load only — never fights a value
  // the operator has since set (or cleared) here. `options` is already narrowed to what this
  // actor may see, so the filter never offers a branch that would just come back empty.
  const { selected: globalLocation, options: locations } = useLocationScope();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (!state.location && globalLocation) update({ location: globalLocation });
  }, []);

  // The text box is debounced into the URL; every other control writes immediately.
  const [draft, setDraft] = useState(state.q);
  const debounced = useDebounced(draft.trim(), 350);
  // URL → box (back/forward, "clear all"); box → URL happens below once typing settles
  useEffect(() => setDraft(state.q), [state.q]);
  useEffect(() => {
    if (debounced !== state.q) update({ q: debounced });
  }, [debounced]);

  const params = {
    q: state.q || undefined,
    kind: state.kind || undefined,
    status: state.status || undefined,
    locationCode: state.location || undefined,
    from: state.from || undefined,
    to: state.to || undefined,
    page: state.page,
    pageSize: state.pageSize,
  };
  const ready = opsSearchReady(params);
  const search = useOpsSearch(params);
  const data = search.data;

  const filterCount = activeFilterCount(state);
  const anyFilter = !!(state.q || state.kind || filterCount);
  const tooShort = draft.trim().length === 1;

  // "All" is the sum of both kinds; the counts come from the API and ignore the kind tab
  const counts = data?.kindCounts;
  const tabLabel = (label: string, n: number | undefined) =>
    n === undefined ? label : `${label} (${fmt.number(n)})`;

  const chips: Array<{ key: keyof typeof state; label: string }> = [];
  if (state.status) chips.push({ key: 'status', label: t(`ops.status.${state.status}`) });
  if (state.location) {
    const name = locations.find((l) => l.code === state.location)?.name;
    chips.push({ key: 'location', label: name ?? state.location });
  }
  if (state.from)
    chips.push({ key: 'from', label: t('ops.search.fromChip', { date: fmt.date(state.from) }) });
  if (state.to)
    chips.push({ key: 'to', label: t('ops.search.toChip', { date: fmt.date(state.to) }) });

  const clearBadge = (
    <Button variant="outline" size="sm" onClick={reset} data-testid="ops-search-clear">
      {t('ops.search.clearAll')}
    </Button>
  );

  return (
    <Page>
      <PageHeader title={t('ops.search.title')} description={t('ops.search.subtitle')} />

      <Card className="overflow-hidden">
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute start-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('ops.search.queryHint')}
                aria-label={t('ops.search.queryLabel')}
                autoComplete="off"
                autoFocus
                data-testid="ops-search-q"
                className="h-11 ps-10 pe-10 text-base [&::-webkit-search-cancel-button]:hidden"
              />
              {search.isFetching && ready ? (
                <Loader2
                  className="absolute end-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              ) : draft ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraft('');
                    update({ q: '' });
                  }}
                  aria-label={t('action.clear')}
                  className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <Button
              variant="outline"
              className="h-11 sm:px-5"
              onClick={() => setFiltersOpen(true)}
              data-testid="ops-search-filters"
            >
              <SlidersHorizontal aria-hidden="true" />
              {t('ops.search.filters')}
              {filterCount ? (
                <Badge className="ms-0.5 px-1.5 tabular-nums">{filterCount}</Badge>
              ) : null}
            </Button>
          </div>

          {tooShort ? (
            <p className="text-xs text-muted-foreground" data-testid="ops-search-hint">
              {t('ops.search.minChars')}
            </p>
          ) : null}

          {chips.length ? (
            <ul className="flex flex-wrap items-center gap-2" aria-label={t('ops.search.filters')}>
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
        </div>

        <div className="border-t bg-muted/20 px-4 sm:px-5">
          <StateSwitcher
            variant="underline"
            className="py-3 sm:py-0"
            label={t('ops.search.kind')}
            value={state.kind || 'all'}
            onChange={(v) => update({ kind: (v === 'all' ? '' : v) as SearchKind })}
            testIdPrefix="ops-search-kind"
            options={[
              {
                value: 'all',
                label: tabLabel(
                  t('ops.search.anyKind'),
                  counts ? counts.reservation + counts.rental : undefined,
                ),
              },
              {
                value: 'reservation',
                label: tabLabel(t('ops.search.reservation'), counts?.reservation),
              },
              { value: 'rental', label: tabLabel(t('ops.search.rental'), counts?.rental) },
            ]}
          />
        </div>
      </Card>

      <section aria-label={t('ops.search.resultsLabel')} data-testid="ops-search-results">
        {!ready ? (
          <Card>
            <StateView
              icon={Search}
              title={t('ops.search.startTitle')}
              description={t('ops.search.start')}
              className="py-16"
            />
          </Card>
        ) : (
          <DataTable
            label={t('ops.search.resultsLabel')}
            columns={columns}
            data={data?.results ?? []}
            getRowId={getRowId}
            loading={search.isLoading}
            fetching={search.isFetching}
            onRowClick={(h) => navigate(h.href)}
            renderCard={(h) => <SearchResultCard hit={h} />}
            skeletonRows={Math.min(state.pageSize, 8)}
            error={
              search.isError ? (
                <StateView
                  kind="error"
                  title={t('ops.search.loadFail')}
                  description={t('state.failure.body')}
                  actionLabel={t('ops.st.retry')}
                  onAction={() => void search.refetch()}
                  className="py-14"
                />
              ) : undefined
            }
            empty={
              <StateView
                icon={SearchX}
                title={t('state.noResults.title')}
                description={t('ops.search.noHits')}
                className="py-14"
              >
                {anyFilter ? clearBadge : null}
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
        )}
      </section>

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        values={{ status: state.status, location: state.location, from: state.from, to: state.to }}
        statuses={statusOptions(state.kind)}
        locations={locations}
        onApply={(v) => update(v)}
      />
    </Page>
  );
}
