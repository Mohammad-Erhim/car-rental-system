import type { ConsentLogEntry } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Cookie, Download, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { consentLogCsv, consentLogQuery, LOG_ACTIONS, LOG_PAGE } from './consent-log-model';

import { DataTable } from '@/components/data-table/data-table';
import { FilterChips, type FilterChip } from '@/components/filter-chips';
import { FiltersSheet } from '@/components/filters-sheet';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useConsentLog, useConsentLogExport } from '@/lib/consent-hooks';
import { downloadCsvFile } from '@/lib/csv';
import { useListParams } from '@/lib/use-list-params';

const PARAMS = ['action', 'from', 'to', 'visitor'] as const;
const getRowId = (r: ConsentLogEntry) => r.id;

function Choice({ on }: { on: boolean }) {
  const { t } = useI18n();
  return on ? (
    <Badge variant="success">{t('ops.consent.log.yes')}</Badge>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function Stat({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      )}
    </Card>
  );
}

/**
 * The consent log: every consent choice from the append-only trail, for GDPR Art. 7
 * accountability. Clicking a visitor narrows to everything that visitor consented to. Paging is
 * keyset, so the cursors live in component state; filters live in the URL.
 */
export function ConsentLogPage() {
  const { t, fmt } = useI18n();
  const { state, update } = useListParams(PARAMS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const filterKey = PARAMS.map((k) => state[k]).join('|');
  useEffect(() => setCursorStack([]), [filterKey]);

  const query = consentLogQuery(state);
  const log = useConsentLog({
    ...query,
    limit: LOG_PAGE,
    cursor: cursorStack[cursorStack.length - 1],
  });
  const exporter = useConsentLogExport();
  const data = log.data;
  const s = data?.summary;

  const filterCount = [state.from, state.to, state.visitor].filter(Boolean).length;
  const chips: FilterChip<(typeof PARAMS)[number]>[] = [];
  if (state.from) chips.push({ key: 'from', label: `${t('ops.consent.log.from')} ${state.from}` });
  if (state.to) chips.push({ key: 'to', label: `${t('ops.consent.log.to')} ${state.to}` });
  if (state.visitor)
    chips.push({
      key: 'visitor',
      label: `${t('ops.consent.log.visitor')}: ${state.visitor.slice(0, 8)}…`,
    });

  async function exportCsv() {
    try {
      const { entries, truncated } = await exporter.mutateAsync(query);
      downloadCsvFile(
        `consent-log-${new Date().toISOString().slice(0, 10)}.csv`,
        consentLogCsv(entries),
      );
      if (truncated) toast.warning(t('ops.consent.log.exportTruncated', { n: entries.length }));
      else toast.success(t('ops.consent.log.exportDone', { n: entries.length }));
    } catch {
      toast.error(t('ops.consent.log.exportFail'));
    }
  }

  const columns = useMemo<ColumnDef<ConsentLogEntry, unknown>[]>(
    () => [
      {
        id: 'at',
        header: t('ops.consent.log.when'),
        cell: ({ row: { original: r } }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {fmt.dateTime(r.at)}
          </span>
        ),
      },
      {
        id: 'action',
        header: t('ops.consent.log.action'),
        cell: ({ row: { original: r } }) => (
          <span className="flex items-center gap-1.5">
            {t(`ops.consent.action.${r.action}`)}
            {r.staleVersion ? <Badge variant="warning">{t('ops.consent.log.stale')}</Badge> : null}
          </span>
        ),
      },
      {
        id: 'fn',
        header: t('ops.consent.cat.functional'),
        cell: ({ row: { original: r } }) => <Choice on={r.choices.functional} />,
      },
      {
        id: 'an',
        header: t('ops.consent.cat.analytics'),
        cell: ({ row: { original: r } }) => <Choice on={r.choices.analytics} />,
      },
      {
        id: 'mk',
        header: t('ops.consent.cat.marketing'),
        cell: ({ row: { original: r } }) => <Choice on={r.choices.marketing} />,
      },
      {
        id: 'v',
        header: t('ops.consent.log.policy'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: r } }) => <span className="text-xs">v{r.policyVersion}</span>,
      },
      {
        id: 'loc',
        header: t('ops.consent.log.locale'),
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row: { original: r } }) => r.locale,
      },
      {
        id: 'id',
        header: t('ops.consent.log.visitor'),
        cell: ({ row: { original: r } }) =>
          r.anonymousId ? (
            <button
              type="button"
              className="bidi-isolate font-mono text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
              title={t('ops.consent.log.filterByVisitor')}
              onClick={(e) => {
                e.stopPropagation();
                update({ visitor: r.anonymousId! });
              }}
            >
              {r.anonymousId.slice(0, 8)}
            </button>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],

    [t, fmt],
  );

  const from = cursorStack.length * LOG_PAGE + 1;
  const to = cursorStack.length * LOG_PAGE + (data?.entries.length ?? 0);
  const pct = (v: number | undefined) => (v == null ? '—' : `${v}%`);

  return (
    <Page>
      <PageHeader
        title={t('ops.consent.log.title')}
        description={t('ops.consent.log.subtitle')}
        actions={
          <Button
            variant="outline"
            onClick={() => void exportCsv()}
            loading={exporter.isPending}
            disabled={!data?.entries.length}
          >
            <Download aria-hidden="true" />
            {t('ops.consent.log.export')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={t('ops.consent.log.total')}
          value={s ? fmt.number(s.total) : '—'}
          loading={log.isLoading}
        />
        {(['functional', 'analytics', 'marketing'] as const).map((c) => (
          <Stat
            key={c}
            label={t('ops.consent.log.optIn', { c: t(`ops.consent.cat.${c}`) })}
            value={pct(s?.optInPct[c])}
            loading={log.isLoading}
          />
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:justify-between sm:p-5">
          <StateSwitcher
            className="flex-1 sm:flex-none"
            label={t('ops.consent.log.action')}
            value={state.action || 'all'}
            onChange={(v) => update({ action: v === 'all' ? '' : v })}
            testIdPrefix="clog-action"
            options={[
              { value: 'all', label: t('ops.consent.log.allActions') },
              ...LOG_ACTIONS.map((a) => ({ value: a, label: t(`ops.consent.action.${a}`) })),
            ]}
          />
          <Button
            variant="outline"
            className="h-11 shrink-0 sm:h-10"
            onClick={() => setFiltersOpen(true)}
            data-testid="clog-filters"
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

      <section aria-label={t('ops.consent.log.events')} data-testid="consent-log-table">
        <DataTable
          label={t('ops.consent.log.events')}
          columns={columns}
          data={data?.entries ?? []}
          getRowId={getRowId}
          loading={log.isLoading}
          fetching={log.isFetching}
          bodyTestId="consent-log-rows"
          renderCard={(r) => (
            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{t(`ops.consent.action.${r.action}`)}</span>
                {r.staleVersion ? (
                  <Badge variant="warning">{t('ops.consent.log.stale')}</Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {fmt.dateTime(r.at)} · v{r.policyVersion} · {r.locale}
              </p>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(['functional', 'analytics', 'marketing'] as const).map((c) => (
                  <Badge key={c} variant={r.choices[c] ? 'success' : 'outline'}>
                    {t(`ops.consent.cat.${c}`)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          error={
            log.isError ? (
              <StateView
                kind="error"
                title={t('ops.consent.log.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void log.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={<StateView icon={Cookie} title={t('ops.consent.log.empty')} className="py-14" />}
        />
        {data && data.total > 0 ? (
          <nav
            aria-label={t('ops.pager.label')}
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t('ops.consent.log.showing', { from, to, total: fmt.number(data.total) })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={cursorStack.length === 0}
                onClick={() => setCursorStack((c) => c.slice(0, -1))}
              >
                <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
                {t('ops.consent.log.prev')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.nextCursor}
                onClick={() => setCursorStack((c) => [...c, data.nextCursor!])}
              >
                {t('ops.consent.log.next')}
                <ChevronRight className="rtl:rotate-180" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        ) : null}
      </section>

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        fields={[
          {
            type: 'dateRange',
            fromLabel: t('ops.consent.log.from'),
            toLabel: t('ops.consent.log.to'),
          },
          {
            type: 'text',
            name: 'visitor',
            label: t('ops.consent.log.filterByVisitor'),
            hint: t('ops.consent.log.filterByVisitorHint'),
            mono: true,
          },
        ]}
        values={{ from: state.from, to: state.to, visitor: state.visitor }}
        onApply={(v) =>
          update({ from: v.from ?? '', to: v.to ?? '', visitor: v.visitor?.trim() ?? '' })
        }
      />
    </Page>
  );
}
