import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  cellText,
  columnLabel,
  csvName,
  isNumericColumn,
  reportDescription,
  reportTitle,
  scopeText,
  visibleColumns,
} from './report-columns';
import { downloadCsv } from './report-model';
import { ReportRowCard } from './report-row-card';

import { ChoiceTabs } from '@/components/choice-tabs';
import { DataTable } from '@/components/data-table/data-table';
import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  fetchReportCsv,
  useRunReport,
  type ReportDefinition,
  type ReportRunResult,
} from '@/lib/admin-hooks';

/**
 * The whole-organisation checks that have no period — open recovery cases and the data-quality
 * sweep. They are run on demand and shown as a plain table.
 */
export function ChecksPanel({
  defs,
  nameOf,
}: {
  defs: ReportDefinition[];
  nameOf: (code: string) => string;
}) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const run = useRunReport();
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState({ page: 1, pageSize: 25 });
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ranAt) resultRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [ranAt]);

  const code = selected || defs.find((d) => d.available)?.code || defs[0]?.code || '';
  const def = defs.find((d) => d.code === code);
  const title = (c: string) => {
    const d = defs.find((x) => x.code === c);
    return d ? reportTitle(i18n, d) : c;
  };

  async function doRun() {
    setError(null);
    try {
      const r = await run.mutateAsync({ code });
      setResult(r);
      setRanAt(new Date());
      setPage((p) => ({ ...p, page: 1 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ops.rpt.runFail'));
    }
  }
  async function exportRun(r: ReportRunResult) {
    try {
      downloadCsv(csvName(r.code, ranAt ?? new Date()), await fetchReportCsv(r.runId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.rpt.exportFail'));
    }
  }

  const rows = result?.rows ?? [];
  const cols = result
    ? visibleColumns(result.columns.length ? result.columns : Object.keys(rows[0] ?? {}), rows)
    : [];
  const columns = useMemo<ColumnDef<Record<string, unknown>, unknown>[]>(
    () =>
      cols.map((c) => {
        const numeric = isNumericColumn(c, rows);
        return {
          id: c,
          header: columnLabel(i18n, c),
          meta: { className: numeric ? 'text-end' : undefined },
          cell: ({ row }) => (
            <span className={numeric ? 'tabular-nums' : undefined}>
              {cellText(i18n, c, row.original)}
            </span>
          ),
        };
      }),
    // the run and the language are what change how a cell reads
    [result, i18n.locale],
  );
  const offset = (page.page - 1) * page.pageSize;
  const slice = rows
    .slice(offset, offset + page.pageSize)
    .map((r, i) => ({ ...r, __i: offset + i }));

  return (
    <div className="space-y-6">
      <SectionCard title={t('ops.rpt.checks')} description={t('ops.rpt.checksBody')}>
        <div className="space-y-4">
          <ChoiceTabs
            layout="list"
            className="sm:grid-cols-2"
            label={t('ops.rpt.report')}
            value={code}
            onChange={(v) => {
              setSelected(v);
              setResult(null);
            }}
            testIdPrefix="report-choice"
            options={defs.map((d) => ({
              value: d.code,
              disabled: !d.available,
              label: reportTitle(i18n, d),
              description: reportDescription(i18n, d),
            }))}
          />
          {def && !def.available ? (
            <p className="text-xs text-muted-foreground">{t('ops.rpt.orgWideBlocked')}</p>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="report-org-wide">
              {t('ops.rpt.orgWideNote')}
            </p>
          )}
          <Button
            onClick={() => void doRun()}
            loading={run.isPending}
            disabled={!code || def?.available === false}
            data-testid="report-run"
          >
            <Play aria-hidden="true" />
            {def ? t('ops.rpt.runNamed', { name: reportTitle(i18n, def) }) : t('ops.rpt.runAction')}
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive" data-testid="report-run-error">
              {error}
            </p>
          ) : null}
        </div>
      </SectionCard>

      {result ? (
        <section
          ref={resultRef}
          data-testid="report-result"
          aria-label={title(result.code)}
          className="scroll-mt-20 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <h2 className="text-base font-semibold">{title(result.code)}</h2>
              <Badge variant="secondary" data-testid="report-scope-note">
                {scopeText(i18n, result.scopeNote, nameOf)}
              </Badge>
              <span className="text-muted-foreground">
                {t('ops.rpt.rows', { n: result.rowCount })}
                {ranAt ? ` · ${t('ops.rpt.ranAt', { when: fmt.dateTime(ranAt) })}` : ''}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void exportRun(result)}
              data-testid="report-export"
            >
              <Download aria-hidden="true" />
              {t('ops.rpt.export')}
            </Button>
          </div>
          <DataTable
            label={title(result.code)}
            columns={columns}
            data={slice}
            renderCard={(r) => <ReportRowCard row={r} columns={cols} rows={rows} />}
            getRowId={(r) => String(r.__i)}
            bodyTestId="report-rows"
            empty={<StateView title={t('ops.rpt.noData')} className="py-10" />}
            pagination={{
              page: page.page,
              pageSize: page.pageSize,
              total: rows.length,
              pageSizeOptions: [10, 25, 50, 100],
              onPageChange: (p) => setPage((s) => ({ ...s, page: p })),
              onPageSizeChange: (n) => setPage({ page: 1, pageSize: n }),
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
