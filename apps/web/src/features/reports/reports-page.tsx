import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { ArrowLeft, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AnalyticPanel } from './analytic-panel';
import { AnalyticView, scopeLabel } from './analytic-view';
import { ChecksPanel } from './checks-panel';
import { csvName, reportDescription, reportTitle } from './report-columns';
import { analyticCsv } from './report-csv';
import { downloadCsv } from './report-model';
import {
  BASIS_REPORTS,
  DEFAULT_REPORT,
  LEGACY_REPORTS,
  readView,
  toScheduleParams,
  VIEW_KEYS,
  type ViewKey,
} from './report-params';
import { RunsTab, SchedulesTab } from './runs-tabs';
import { ScheduleDialog } from './schedule-dialog';

import { ChoiceTabs } from '@/components/choice-tabs';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchReportCsv,
  useReportDefinitions,
  useReportRunView,
  useReportRuns,
  useReportSchedules,
  useSendReportSchedule,
  type ReportDefinition,
  type ReportRunResult,
  type ReportRunSummary,
  type ReportSchedule,
} from '@/lib/admin-hooks';
import { apiFetch } from '@/lib/api';
import { downloadCsvFile } from '@/lib/csv';
import { humanize } from '@/lib/labels';
import { useLocationScope } from '@/lib/location-scope';
import { useListParams } from '@/lib/use-list-params';

const TABS = ['run', 'runs', 'schedules'] as const;
type Tab = (typeof TABS)[number];
const CHECKS = 'checks';
/** the order the reports are offered in: the overview first, then by what a manager asks next */
const ORDER = ['overview', 'sales', 'bookings', 'fleet', 'payments', 'operations'];

/**
 * SCREEN-OPS-035 — Reports. Six reports answer for a period (the overview, sales, bookings, fleet,
 * payments, operations), each with a comparison, headline figures, a trend and breakdowns; the
 * checks without a period sit beside them. Everything is limited to the operator's branches
 * (FR-RPT-004) and says which branches, which days and which currency it is about. A report can be
 * exported, printed, or scheduled for e-mail.
 */
export function ReportsPage() {
  const i18n = useI18n();
  const { t } = i18n;
  const { hasPermission } = useAuth();
  const canExport = hasPermission('report.export');
  const { state, update } = useListParams(['tab', 'saved', ...VIEW_KEYS] as const);
  const tab: Tab = (TABS as readonly string[]).includes(state.tab) ? (state.tab as Tab) : 'run';
  const view = readView(state as unknown as Record<ViewKey, string>);
  const { codes: locationCode, nameOf } = useLocationScope();

  const defsQuery = useReportDefinitions();
  const defs = useMemo(() => defsQuery.data ?? [], [defsQuery.data]);
  const analytic = useMemo(
    () =>
      defs
        .filter((d) => d.queryKind.startsWith('analytic:'))
        .sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code)),
    [defs],
  );
  const checks = useMemo(
    () => defs.filter((d) => !d.queryKind.startsWith('analytic:') && !LEGACY_REPORTS.has(d.code)),
    [defs],
  );
  const runs = useReportRuns();
  const schedules = useReportSchedules();
  const send = useSendReportSchedule();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sending, setSending] = useState<ReportSchedule | null>(null);

  const titleOf = useCallback(
    (code: string) => {
      const d = defs.find((x) => x.code === code);
      return d ? reportTitle(i18n, d) : humanize(code);
    },
    // titles follow the language and the loaded definitions
    [defs, i18n],
  );

  const patch = (p: Partial<Record<Exclude<ViewKey, 'report'> | 'saved', string>>) => update(p);
  const selected =
    view.report === CHECKS
      ? CHECKS
      : analytic.some((d) => d.code === view.report)
        ? view.report
        : (analytic[0]?.code ?? DEFAULT_REPORT);
  const def = analytic.find((d) => d.code === selected);

  const openRun = useCallback((r: ReportRunSummary) => update({ tab: '', saved: r.id }), [update]);
  const exportRun = useCallback(
    async (r: ReportRunSummary) => {
      try {
        if (!r.periodFrom) {
          downloadCsv(csvName(r.definitionCode, new Date(r.createdAt)), await fetchReportCsv(r.id));
          return;
        }
        const run = await apiFetch<ReportRunResult>(`/ops/reports/runs/${r.id}`);
        const rep = run.report;
        if (!rep) return;
        downloadCsvFile(
          csvName(r.definitionCode, new Date(r.createdAt)),
          analyticCsv(i18n, rep, {
            title: titleOf(r.definitionCode),
            scope: scopeLabel(t, rep.scope.locations, nameOf),
            basis: BASIS_REPORTS.has(r.definitionCode)
              ? t(`ops.rpt.basis.${rep.period.basis}`)
              : '',
            compare: rep.period.compare ? t(`ops.rpt.compareKind.${rep.period.compare.kind}`) : '',
            generated: i18n.fmt.dateTime(rep.generatedAt),
          }),
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('ops.rpt.exportFail'));
      }
    },
    [i18n, nameOf, t, titleOf],
  );

  return (
    <Page>
      <PageHeader
        title={t('ops.rpt.title')}
        description={t('ops.rpt.subtitleScoped')}
        actions={
          canExport && tab === 'schedules' && defs.length ? (
            <Button onClick={() => setScheduleOpen(true)} data-testid="schedule-new">
              <Plus aria-hidden="true" />
              {t('ops.rpt.newSchedule')}
            </Button>
          ) : null
        }
      />

      <div className="print:hidden">
        <StateSwitcher
          label={t('ops.rpt.title')}
          value={tab}
          onChange={(v) => update({ tab: v === 'run' ? '' : v, saved: '' })}
          testIdPrefix="rpt-tab"
          options={[
            { value: 'run', label: t('ops.rpt.reports') },
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
      </div>

      {tab === 'run' ? (
        state.saved ? (
          <SavedRun
            runId={state.saved}
            onBack={() => update({ saved: '', tab: 'runs' })}
            nameOf={nameOf}
          />
        ) : defsQuery.isError ? (
          <StateView
            kind="error"
            title={t('ops.rpt.loadFail')}
            actionLabel={t('ops.st.retry')}
            onAction={() => void defsQuery.refetch()}
          />
        ) : defsQuery.isLoading ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="space-y-6">
            <div className="space-y-2 print:hidden">
              <ChoiceTabs
                label={t('ops.rpt.report')}
                value={selected}
                onChange={(v) => update({ report: v === DEFAULT_REPORT ? '' : v })}
                testIdPrefix="report-choice"
                options={[
                  ...analytic.map((d) => ({
                    value: d.code,
                    label: reportTitle(i18n, d),
                    disabled: !d.available,
                  })),
                  ...(checks.length ? [{ value: CHECKS, label: t('ops.rpt.checks') }] : []),
                ]}
              />
              {def ? (
                <p className="text-sm text-muted-foreground">{reportDescription(i18n, def)}</p>
              ) : null}
            </div>
            {selected === CHECKS ? (
              <ChecksPanel defs={checks} nameOf={nameOf} />
            ) : def ? (
              <div className="space-y-2">
                <h2 className="hidden text-xl font-semibold print:block">
                  {reportTitle(i18n, def)}
                </h2>
                <AnalyticPanel
                  key={def.code}
                  code={def.code}
                  title={reportTitle(i18n, def)}
                  view={view}
                  patch={patch}
                  locationCode={locationCode}
                  nameOf={nameOf}
                  canExport={canExport}
                  canSchedule={canExport}
                  onSchedule={() => setScheduleOpen(true)}
                />
              </div>
            ) : null}
          </div>
        )
      ) : tab === 'runs' ? (
        <RunsTab
          runs={runs.data ?? []}
          loading={runs.isLoading}
          fetching={runs.isFetching}
          error={runs.isError}
          onRetry={() => void runs.refetch()}
          titleOf={titleOf}
          nameOf={nameOf}
          state={state}
          update={update}
          onOpen={openRun}
          onExport={(r) => void exportRun(r)}
        />
      ) : (
        <SchedulesTab
          schedules={schedules.data ?? []}
          loading={schedules.isLoading}
          error={schedules.isError}
          onRetry={() => void schedules.refetch()}
          titleOf={titleOf}
          canSchedule={canExport}
          canCreate={canExport && defs.length > 0}
          onNew={() => setScheduleOpen(true)}
          onSend={setSending}
        />
      )}

      {scheduleOpen && defs.length ? (
        <ScheduleDialog
          definitions={defs.filter((d) => !LEGACY_REPORTS.has(d.code)) as ReportDefinition[]}
          defaultCode={selected === CHECKS ? (checks[0]?.code ?? '') : selected}
          defaults={toScheduleParams(view)}
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

/** A run that was saved earlier, exactly as it was shown. */
function SavedRun({
  runId,
  onBack,
  nameOf,
}: {
  runId: string;
  onBack: () => void;
  nameOf: (c: string) => string;
}) {
  const { t, fmt } = useI18n();
  const q = useReportRunView(runId);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 text-sm print:hidden">
        <span>
          {q.data
            ? t('ops.rpt.savedRun', { when: fmt.dateTime(q.data.createdAt) })
            : t('ops.rpt.savedRunLoading')}
        </span>
        <Button size="sm" variant="outline" onClick={onBack}>
          <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
          {t('ops.rpt.backToRuns')}
        </Button>
      </div>
      {q.isError ? (
        <StateView
          kind="error"
          title={t('ops.rpt.loadFail')}
          actionLabel={t('ops.st.retry')}
          onAction={() => void q.refetch()}
        />
      ) : !q.data?.report ? (
        <Skeleton className="h-64" />
      ) : (
        <AnalyticView
          report={q.data.report}
          usesBasis={BASIS_REPORTS.has(q.data.code)}
          nameOf={nameOf}
        />
      )}
    </div>
  );
}
