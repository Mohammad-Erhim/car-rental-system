import { useI18n } from '@carrental/i18n/react';
import { CalendarClock, Download, Printer, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { AnalyticView, scopeLabel } from './analytic-view';
import { csvName } from './report-columns';
import { analyticCsv } from './report-csv';
import { ReportFilters } from './report-filters';
import { periodText } from './report-header';
import { BASIS_REPORTS, isReady, toApiParams, type ReportView } from './report-params';

import { StateView } from '@/components/state-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportPreview, useRunReport } from '@/lib/admin-hooks';
import { downloadCsvFile } from '@/lib/csv';

/**
 * One analytic report on screen: the filters, and the figures that follow them. Every change to a
 * filter recomputes the figures (nothing is saved); exporting saves the run — so there is a record
 * of what was taken out — and downloads the same figures as a spreadsheet.
 */
export function AnalyticPanel({
  code,
  title,
  view,
  patch,
  locationCode,
  nameOf,
  canExport,
  canSchedule,
  onSchedule,
}: {
  code: string;
  title: string;
  view: ReportView;
  patch: (
    p: Partial<
      Record<'preset' | 'from' | 'to' | 'compare' | 'basis' | 'gran' | 'cat' | 'cur', string>
    >,
  ) => void;
  locationCode: string | undefined;
  nameOf: (code: string) => string;
  canExport: boolean;
  canSchedule: boolean;
  onSchedule: () => void;
}) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const usesBasis = BASIS_REPORTS.has(code);
  const params = toApiParams(view, locationCode);
  const ready = isReady(view);
  const q = useReportPreview(code, params, ready);
  const runReport = useRunReport();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const report = q.data?.report;

  async function exportCsv() {
    try {
      const saved = await runReport.mutateAsync({ code, params });
      const r = saved.report;
      if (!r) return;
      const csv = analyticCsv(i18n, r, {
        title,
        scope: scopeLabel(t, r.scope.locations, nameOf),
        basis: usesBasis ? t(`ops.rpt.basis.${r.period.basis}`) : '',
        compare: r.period.compare ? t(`ops.rpt.compareKind.${r.period.compare.kind}`) : '',
        generated: fmt.dateTime(r.generatedAt),
      });
      downloadCsvFile(csvName(code, new Date(r.generatedAt)), csv);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.rpt.exportFail'));
    }
  }

  const summary = report
    ? periodText(fmt, report.period.from, report.period.to)
    : t(`ops.rpt.preset.${view.preset}`);

  return (
    <div className="space-y-6">
      <Card className="p-4 print:hidden" data-testid="report-filter-card">
        <div className="flex items-center justify-between gap-3 md:hidden">
          <p className="min-w-0 truncate text-sm">
            <span className="font-medium">{t(`ops.rpt.preset.${view.preset}`)}</span>
            <span className="text-muted-foreground"> · {summary}</span>
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal aria-hidden="true" />
            {t('ops.rpt.filters')}
          </Button>
        </div>
        <div className={filtersOpen ? 'mt-4 md:mt-0' : 'hidden md:block'}>
          <ReportFilters
            view={view}
            onChange={patch}
            usesBasis={usesBasis}
            categories={report?.categories ?? []}
          />
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void q.refetch()}
          loading={q.isFetching}
          disabled={!ready}
          data-testid="report-refresh"
        >
          <RefreshCw aria-hidden="true" />
          {t('ops.rpt.refresh')}
        </Button>
        {canExport ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportCsv()}
            loading={runReport.isPending}
            disabled={!report}
            data-testid="report-export"
          >
            <Download aria-hidden="true" />
            {t('ops.rpt.export')}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          disabled={!report}
          data-testid="report-print"
        >
          <Printer aria-hidden="true" />
          {t('ops.rpt.print')}
        </Button>
        {canSchedule ? (
          <Button variant="outline" size="sm" onClick={onSchedule} data-testid="report-schedule">
            <CalendarClock aria-hidden="true" />
            {t('ops.rpt.scheduleThis')}
          </Button>
        ) : null}
      </div>

      {!ready ? (
        <StateView
          title={t('ops.rpt.pickDates')}
          description={t('ops.rpt.pickDatesBody')}
          className="py-14"
        />
      ) : q.isError && !report ? (
        <StateView
          kind="error"
          title={t('ops.rpt.loadFail')}
          description={q.error instanceof Error ? q.error.message : undefined}
          actionLabel={t('ops.st.retry')}
          onAction={() => void q.refetch()}
          className="py-14"
        />
      ) : !report ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-10 w-2/3" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div
          aria-busy={q.isFetching}
          className={q.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}
          data-testid="report-result"
        >
          <AnalyticView
            report={report}
            usesBasis={usesBasis}
            nameOf={nameOf}
            onCurrency={(c) => patch({ cur: c })}
          />
        </div>
      )}
    </div>
  );
}
