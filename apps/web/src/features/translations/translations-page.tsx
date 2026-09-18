import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { editorPath, pivotCoverage, type PivotRow } from './translation-model';

import { DataTable } from '@/components/data-table/data-table';
import { FilterChips } from '@/components/filter-chips';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Card } from '@/components/ui/card';
import { useTranslationCompleteness } from '@/lib/api-hooks';
import { useClientPage } from '@/lib/use-client-page';
import { useListParams } from '@/lib/use-list-params';

const PARAMS = ['view', 'locale'] as const;
const getRowId = (r: PivotRow) => r.namespace;

/** A language's share of one namespace as a small bar; the whole cell opens that editor. */
function CoverageCell({
  namespace,
  locale,
  pct,
  missing,
}: {
  namespace: string;
  locale: string;
  pct: number;
  missing: number;
}) {
  const { t } = useI18n();
  return (
    <Link
      to={editorPath(namespace, locale)}
      onClick={(e) => e.stopPropagation()}
      aria-label={t('ops.trans.openEditor', { namespace, locale, pct })}
      className="group flex min-w-[7rem] items-center gap-2 rounded-md px-1 py-1 hover:bg-muted"
    >
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted group-hover:bg-background">
        <span
          className={`block h-full ${pct === 100 ? 'bg-success' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-14 text-end text-xs tabular-nums text-muted-foreground">
        {pct}%{missing ? ` · ${missing}` : ''}
      </span>
    </Link>
  );
}

/**
 * SCREEN-OPS-034 — Translation catalogue (FR-ADM-012, SRS-I18N-003). This page shows how much of
 * each namespace is translated in each language; opening a cell goes to that namespace + language
 * editor. Publishing is blocked while a mandatory legal string is untranslated.
 */
export function TranslationsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { state, update } = useListParams(PARAMS);
  const completeness = useTranslationCompleteness();

  const allLocales = useMemo(
    () => (completeness.data?.locales ?? []).filter((l) => l !== 'en'),
    [completeness.data],
  );
  const locales = state.locale ? allLocales.filter((l) => l === state.locale) : allLocales;
  const pivot = useMemo(
    () => pivotCoverage(completeness.data?.rows ?? [], locales),
    [completeness.data, locales],
  );
  const view = state.view === 'all' ? 'all' : 'todo';
  const todo = pivot.filter((r) => r.gaps > 0);
  const visible = view === 'todo' ? todo : pivot;
  const { pageRows, pagination } = useClientPage(visible, state, update);

  const columns = useMemo<ColumnDef<PivotRow, unknown>[]>(
    () => [
      {
        id: 'namespace',
        header: t('ops.tbl.namespace'),
        cell: ({ row: { original: r } }) => (
          <span className="bidi-isolate font-mono text-xs">{r.namespace}</span>
        ),
      },
      ...locales.map<ColumnDef<PivotRow, unknown>>((l) => ({
        id: `loc-${l}`,
        header: () => <span className="uppercase">{l}</span>,
        cell: ({ row: { original: r } }) => {
          const c = r.cells.get(l);
          return (
            <CoverageCell
              namespace={r.namespace}
              locale={l}
              pct={c?.coveragePct ?? 0}
              missing={c?.missing ?? 0}
            />
          );
        },
      })),
      {
        id: 'gaps',
        header: t('ops.tbl.missing'),
        meta: { className: 'text-end' },
        cell: ({ row: { original: r } }) => <span className="tabular-nums">{r.gaps}</span>,
      },
    ],
    [t, locales],
  );

  const firstGap = (r: PivotRow) =>
    locales.find((l) => (r.cells.get(l)?.missing ?? 0) > 0) ?? locales[0];

  return (
    <Page>
      <PageHeader title={t('ops.trans.title')} description={t('ops.trans.subtitle')} />

      <Card className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <StateSwitcher
            label={t('ops.trans.coverage')}
            value={view}
            onChange={(v) => update({ view: v === 'todo' ? '' : v })}
            testIdPrefix="trans-view"
            options={[
              { value: 'todo', label: `${t('ops.trans.needsWork')} (${todo.length})` },
              { value: 'all', label: `${t('ops.rp.tabAll')} (${pivot.length})` },
            ]}
          />
        </div>
        <FilterChips
          chips={
            state.locale ? [{ key: 'locale' as const, label: state.locale.toUpperCase() }] : []
          }
          onRemove={() => update({ locale: '' })}
        />
      </Card>

      <section aria-label={t('ops.trans.coverage')} data-testid="translation-coverage">
        <DataTable
          label={t('ops.trans.coverage')}
          columns={columns}
          data={pageRows}
          getRowId={getRowId}
          loading={completeness.isLoading}
          fetching={completeness.isFetching}
          bodyTestId="translation-rows"
          onRowClick={(r) => {
            const l = firstGap(r);
            if (l) navigate(editorPath(r.namespace, l));
          }}
          cardBreakpoint="lg"
          renderCard={(r) => (
            <div className="space-y-2 p-4" data-row={r.namespace}>
              <p className="bidi-isolate font-mono text-xs font-medium">{r.namespace}</p>
              {locales.map((l) => (
                <div key={l} className="flex items-center gap-3">
                  <span className="w-8 text-xs font-medium uppercase text-muted-foreground">
                    {l}
                  </span>
                  <div className="flex-1">
                    <CoverageCell
                      namespace={r.namespace}
                      locale={l}
                      pct={r.cells.get(l)?.coveragePct ?? 0}
                      missing={r.cells.get(l)?.missing ?? 0}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          error={
            completeness.isError ? (
              <StateView
                kind="error"
                title={t('ops.trans.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void completeness.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={
            <StateView icon={CheckCircle2} title={t('ops.trans.allComplete')} className="py-14" />
          }
          pagination={pagination}
        />
      </section>
    </Page>
  );
}
