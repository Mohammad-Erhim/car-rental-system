import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, Download, FileBarChart, Play, Plus, Send } from 'lucide-react';
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
import { ScheduleDialog } from './schedule-dialog';

import { ChoiceTabs } from '@/components/choice-tabs';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  fetchReportCsv,
  useReportDefinitions,
  useReportRuns,
  useReportSchedules,
  useRunReport,
  useSendReportSchedule,
  type ReportRunResult,
  type ReportRunSummary,
  type ReportSchedule,
} from '@/lib/admin-hooks';
import { humanize } from '@/lib/labels';
import { useLocationScope } from '@/lib/location-scope';
import { useClientPage } from '@/lib/use-client-page';
import { useListParams } from '@/lib/use-list-params';

const TABS = ['run', 'runs', 'schedules'] as const;
type Tab = (typeof TABS)[number];

/**
 * SCREEN-OPS-035 — Reports. Each report is a whitelisted aggregate (no free SQL). Rows are limited
 * to the operator's location scope (FR-RPT-004), and the scope actually used is shown with every
 * result. A finished run can be exported as CSV; a report can be scheduled for recurring email.
 */
export function ReportsPage() {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const { hasPermission } = useAuth();
  const canSchedule = hasPermission('report.export');
  const { state, update } = useListParams(['tab'] as const);
  const tab: Tab = (TABS as readonly string[]).includes(state.tab) ? (state.tab as Tab) : 'run';
  const {
    codes: locationCode,
    selected: locationSelection,
    options: locationOptions,
    nameOf,
  } = useLocationScope();

  const defsQuery = useReportDefinitions();
  // reports you can run first, branch-level ones before whole-organisation ones, then by name
  const defs = useMemo(() => {
    const list = [...(defsQuery.data ?? [])].sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        Number(a.scope === 'org_wide') - Number(b.scope === 'org_wide') ||
        reportTitle(i18n, a).localeCompare(reportTitle(i18n, b), i18n.locale),
    );
    return { ...defsQuery, data: defsQuery.data ? list : undefined };
  }, [defsQuery]);
  const runs = useReportRuns();
  const schedules = useReportSchedules();
  const run = useRunReport();
  const send = useSendReportSchedule();

  const [selected, setSelected] = useState('');
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  // the picker is tall; after a run, bring the answer into view
  useEffect(() => {
    if (ranAt) resultRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [ranAt]);
  const [runError, setRunError] = useState<string | null>(null);
  const [resultPage, setResultPage] = useState({ page: 1, pageSize: 25 });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sending, setSending] = useState<ReportSchedule | null>(null);
  const defOf = (c: string) => defs.data?.find((d) => d.code === c);
  const titleOf = (c: string) => {
    const d = defOf(c);
    return d ? reportTitle(i18n, d) : humanize(c);
  };
  const code = selected || defs.data?.find((d) => d.available)?.code || defs.data?.[0]?.code || '';
  const def = defs.data?.find((d) => d.code === code);

  async function doRun() {
    setRunError(null);
    try {
      // narrows within the actor's own scope; a report that doesn't filter by location ignores it
      const r = await run.mutateAsync({ code, params: locationCode ? { locationCode } : {} });
      setResult(r);
      setRanAt(new Date());
      setResultPage((p) => ({ ...p, page: 1 }));
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t('ops.rpt.runFail'));
    }
  }
  async function exportRun(runId: string, reportCode: string, on: Date) {
    try {
      downloadCsv(csvName(reportCode, on), await fetchReportCsv(runId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.rpt.exportFail'));
    }
  }

  // ---- result table: positional aggregate rows with a run-defined column set ----
  const cols = result
    ? visibleColumns(
        result.columns.length ? result.columns : Object.keys(result.rows[0] ?? {}),
        result.rows,
      )
    : [];
  const resultColumns = useMemo<ColumnDef<Record<string, unknown>, unknown>[]>(
    () =>
      cols.map((c) => {
        const numeric = isNumericColumn(c, result?.rows ?? []);
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
    [result, i18n.locale],
  );
  const resultRows = result?.rows ?? [];
  const resultOffset = (resultPage.page - 1) * resultPage.pageSize;
  // rows have no id of their own — their position in the result is the key
  const resultSlice = resultRows
    .slice(resultOffset, resultOffset + resultPage.pageSize)
    .map((r, i) => ({ ...r, __i: resultOffset + i }));

  // ---- runs ----
  const runList = useMemo(() => runs.data ?? [], [runs.data]);
  const { pageRows: runRows, pagination: runPaging } = useClientPage(runList, state, update);
  const runColumns = useMemo<ColumnDef<ReportRunSummary, unknown>[]>(
    () => [
      {
        id: 'report',
        header: t('ops.rpt.report'),
        cell: ({ row: { original: r } }) => (
          <span className="font-medium">{titleOf(r.definitionCode)}</span>
        ),
      },
      {
        id: 'scope',
        header: t('ops.rpt.scopeNote'),
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row: { original: r } }) => (
          <span className="text-muted-foreground">{scopeText(i18n, r.scopeNote, nameOf)}</span>
        ),
      },
      {
        id: 'rows',
        header: t('ops.rpt.thRows'),
        cell: ({ row: { original: r } }) => <span className="tabular-nums">{r.rowCount}</span>,
      },
      {
        id: 'when',
        header: t('ops.rpt.thWhen'),
        cell: ({ row: { original: r } }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {fmt.dateTime(r.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'text-end' },
        cell: ({ row: { original: r } }) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void exportRun(r.id, r.definitionCode, new Date(r.createdAt))}
          >
            <Download aria-hidden="true" />
            {t('ops.rpt.export')}
          </Button>
        ),
      },
    ],

    [t, fmt, defs.data, nameOf],
  );

  // ---- schedules ----
  const scheduleBadge = (s: ReportSchedule) =>
    s.isActive !== 'true' ? (
      <Badge variant="warning">
        {s.lastSkipReason ? t(`ops.rpt.skip.${s.lastSkipReason}`) : t('ops.rpt.paused')}
      </Badge>
    ) : (
      <Badge variant="success">{t('ops.rpt.active')}</Badge>
    );
  const scheduleColumns = useMemo<ColumnDef<ReportSchedule, unknown>[]>(
    () => [
      {
        id: 'report',
        header: t('ops.rpt.report'),
        cell: ({ row: { original: s } }) => (
          <span className="font-medium">{titleOf(s.definitionCode)}</span>
        ),
      },
      {
        id: 'cron',
        header: t('ops.rpt.cron'),
        cell: ({ row: { original: s } }) => (
          <span className="bidi-isolate font-mono text-xs">{s.cron}</span>
        ),
      },
      {
        id: 'recipients',
        header: t('ops.rpt.recipients'),
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row: { original: s } }) => t('ops.rpt.recipientCount', { n: s.recipients.length }),
      },
      {
        id: 'status',
        header: t('ops.tbl.status'),
        cell: ({ row: { original: s } }) => scheduleBadge(s),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'text-end' },
        cell: ({ row: { original: s } }) =>
          canSchedule ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSending(s)}
              data-testid={`schedule-send-${s.id}`}
            >
              <Send aria-hidden="true" />
              {t('ops.rpt.sendNow')}
            </Button>
          ) : null,
      },
    ],

    [t, canSchedule, defs.data],
  );

  const narrowing =
    locationSelection.length && locationOptions.length > 1 && def?.scope === 'location'
      ? locationSelection.map(nameOf).join(', ')
      : null;

  return (
    <Page>
      <PageHeader
        title={t('ops.rpt.title')}
        description={t('ops.rpt.subtitleScoped')}
        actions={
          canSchedule && tab === 'schedules' && defs.data?.length ? (
            <Button onClick={() => setScheduleOpen(true)} data-testid="schedule-new">
              <Plus aria-hidden="true" />
              {t('ops.rpt.newSchedule')}
            </Button>
          ) : null
        }
      />

      <StateSwitcher
        label={t('ops.rpt.title')}
        value={tab}
        onChange={(v) => update({ tab: v === 'run' ? '' : v })}
        testIdPrefix="rpt-tab"
        options={[
          { value: 'run', label: t('ops.rpt.run') },
          {
            value: 'runs',
            label: `${t('ops.rpt.recent')}${runs.data ? ` (${runs.data.length})` : ''}`,
          },
          {
            value: 'schedules',
            label: `${t('ops.rpt.schedule')}${schedules.data ? ` (${schedules.data.length})` : ''}`,
          },
        ]}
      />

      {tab === 'run' ? (
        <div className="space-y-6">
          <SectionCard icon={FileBarChart} title={t('ops.rpt.run')}>
            {defs.isError ? (
              <StateView
                kind="error"
                title={t('ops.rpt.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void defs.refetch()}
              />
            ) : (
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
                  options={(defs.data ?? []).map((d) => ({
                    value: d.code,
                    disabled: !d.available,
                    label: (
                      <span className="flex flex-wrap items-center gap-2">
                        {reportTitle(i18n, d)}
                        {d.scope === 'org_wide' ? (
                          <Badge variant="outline">{t('ops.rpt.orgWideTag')}</Badge>
                        ) : null}
                      </span>
                    ),
                    description: reportDescription(i18n, d),
                  }))}
                />
                <Button
                  onClick={() => void doRun()}
                  loading={run.isPending}
                  disabled={!code || def?.available === false}
                  data-testid="report-run"
                >
                  <Play aria-hidden="true" />
                  {def
                    ? t('ops.rpt.runNamed', { name: reportTitle(i18n, def) })
                    : t('ops.rpt.runAction')}
                </Button>
                {def?.scope === 'org_wide' ? (
                  <p className="text-xs text-muted-foreground" data-testid="report-org-wide">
                    {def.available ? t('ops.rpt.orgWideNote') : t('ops.rpt.orgWideBlocked')}
                  </p>
                ) : null}
                {narrowing ? (
                  <p className="text-xs text-muted-foreground" data-testid="report-location-filter">
                    {t('ops.rpt.locationFilter', { name: narrowing })}
                  </p>
                ) : null}
                {runError ? (
                  <p
                    role="alert"
                    className="text-sm text-destructive"
                    data-testid="report-run-error"
                  >
                    {runError}
                  </p>
                ) : null}
              </div>
            )}
          </SectionCard>

          {result ? (
            <section
              ref={resultRef}
              data-testid="report-result"
              aria-label={titleOf(result.code)}
              className="scroll-mt-20 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <h2 className="text-base font-semibold">{titleOf(result.code)}</h2>
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
                  onClick={() => void exportRun(result.runId, result.code, ranAt ?? new Date())}
                  data-testid="report-export"
                >
                  <Download aria-hidden="true" />
                  {t('ops.rpt.export')}
                </Button>
              </div>
              <DataTable
                label={titleOf(result.code)}
                columns={resultColumns}
                data={resultSlice}
                renderCard={(r) => <ReportRowCard row={r} columns={cols} rows={resultRows} />}
                getRowId={(r) => String(r.__i)}
                bodyTestId="report-rows"
                empty={<StateView title={t('ops.rpt.noData')} className="py-10" />}
                pagination={{
                  page: resultPage.page,
                  pageSize: resultPage.pageSize,
                  total: resultRows.length,
                  pageSizeOptions: [10, 25, 50, 100],
                  onPageChange: (p) => setResultPage((s) => ({ ...s, page: p })),
                  onPageSizeChange: (n) => setResultPage({ page: 1, pageSize: n }),
                }}
              />
            </section>
          ) : null}
        </div>
      ) : tab === 'runs' ? (
        <section aria-label={t('ops.rpt.recent')} data-testid="report-runs">
          <DataTable
            label={t('ops.rpt.recent')}
            columns={runColumns}
            data={runRows}
            getRowId={(r) => r.id}
            loading={runs.isLoading}
            fetching={runs.isFetching}
            bodyTestId="report-run-rows"
            error={
              runs.isError ? (
                <StateView
                  kind="error"
                  title={t('ops.rpt.loadFail')}
                  actionLabel={t('ops.st.retry')}
                  onAction={() => void runs.refetch()}
                  className="py-14"
                />
              ) : undefined
            }
            empty={<StateView icon={FileBarChart} title={t('ops.rpt.noRuns')} className="py-14" />}
            pagination={runPaging}
          />
        </section>
      ) : (
        <section aria-label={t('ops.rpt.schedule')} data-testid="report-schedules">
          <DataTable
            label={t('ops.rpt.schedule')}
            columns={scheduleColumns}
            data={schedules.data ?? []}
            getRowId={(s) => s.id}
            loading={schedules.isLoading}
            bodyTestId="report-schedule-rows"
            error={
              schedules.isError ? (
                <StateView
                  kind="error"
                  title={t('ops.rpt.loadFail')}
                  actionLabel={t('ops.st.retry')}
                  onAction={() => void schedules.refetch()}
                  className="py-14"
                />
              ) : undefined
            }
            empty={
              <StateView icon={CalendarClock} title={t('ops.rpt.noSchedules')} className="py-14">
                {canSchedule && defs.data?.length ? (
                  <Button size="sm" onClick={() => setScheduleOpen(true)}>
                    <Plus aria-hidden="true" />
                    {t('ops.rpt.newSchedule')}
                  </Button>
                ) : null}
              </StateView>
            }
          />
        </section>
      )}

      {scheduleOpen && defs.data ? (
        <ScheduleDialog
          definitions={defs.data}
          defaultCode={code}
          open
          onOpenChange={setScheduleOpen}
        />
      ) : null}
      {sending ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setSending(null)}
          title={t('ops.rpt.sendNowTitle')}
          description={t('ops.rpt.sendNowBody')}
          confirmLabel={t('ops.rpt.sendNow')}
          onConfirm={async () => {
            const r = await send.mutateAsync(sending.id);
            if (r.sent) toast.success(t('ops.rpt.sentNow', { n: r.recipients.length }));
            else toast.warning(t(`ops.rpt.skip.${r.reason}`));
          }}
        />
      ) : null}
    </Page>
  );
}
