import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, Download, Eye, FileBarChart, Plus, Send } from 'lucide-react';
import { useMemo } from 'react';

import { scopeText } from './report-columns';
import { periodText } from './report-header';

import { DataTable } from '@/components/data-table/data-table';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ReportRunSummary, ReportSchedule } from '@/lib/admin-hooks';
import { useClientPage } from '@/lib/use-client-page';

type Paging = Parameters<typeof useClientPage>[1];
type Update = Parameters<typeof useClientPage>[2];

/** Reports that were exported or delivered: what, for which days, when, and a way back to them. */
export function RunsTab({
  runs,
  loading,
  fetching,
  error,
  onRetry,
  titleOf,
  nameOf,
  state,
  update,
  onOpen,
  onExport,
}: {
  runs: ReportRunSummary[];
  loading: boolean;
  fetching: boolean;
  error: boolean;
  onRetry: () => void;
  titleOf: (code: string) => string;
  nameOf: (code: string) => string;
  state: Paging;
  update: Update;
  onOpen: (run: ReportRunSummary) => void;
  onExport: (run: ReportRunSummary) => void;
}) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const { pageRows, pagination } = useClientPage(runs, state, update);
  const columns = useMemo<ColumnDef<ReportRunSummary, unknown>[]>(
    () => [
      {
        id: 'report',
        header: t('ops.rpt.report'),
        cell: ({ row: { original: r } }) => (
          <span className="font-medium">{titleOf(r.definitionCode)}</span>
        ),
      },
      {
        id: 'period',
        header: t('ops.rpt.f.period'),
        cell: ({ row: { original: r } }) =>
          r.periodFrom && r.periodTo ? (
            <bdi>{periodText(fmt, r.periodFrom, r.periodTo)}</bdi>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'scope',
        header: t('ops.rpt.scopeNote'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: r } }) => (
          <span className="text-muted-foreground">{scopeText(i18n, r.scopeNote, nameOf)}</span>
        ),
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
          <span className="inline-flex gap-1">
            {r.periodFrom ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpen(r)}
                data-testid={`run-open-${r.id}`}
              >
                <Eye aria-hidden="true" />
                {t('ops.rpt.open')}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => onExport(r)}>
              <Download aria-hidden="true" />
              {t('ops.rpt.export')}
            </Button>
          </span>
        ),
      },
    ],
    // titles and names follow the language and the loaded definitions
    [t, fmt, titleOf, nameOf, onOpen, onExport],
  );
  return (
    <section aria-label={t('ops.rpt.recent')} data-testid="report-runs">
      <DataTable
        label={t('ops.rpt.recent')}
        columns={columns}
        data={pageRows}
        getRowId={(r) => r.id}
        loading={loading}
        fetching={fetching}
        bodyTestId="report-run-rows"
        error={
          error ? (
            <StateView
              kind="error"
              title={t('ops.rpt.loadFail')}
              actionLabel={t('ops.st.retry')}
              onAction={onRetry}
              className="py-14"
            />
          ) : undefined
        }
        empty={<StateView icon={FileBarChart} title={t('ops.rpt.noRuns')} className="py-14" />}
        pagination={pagination}
      />
    </section>
  );
}

/** What is emailed, when, to whom — and for which period it always covers. */
export function SchedulesTab({
  schedules,
  loading,
  error,
  onRetry,
  titleOf,
  canSchedule,
  canCreate,
  onNew,
  onSend,
}: {
  schedules: ReportSchedule[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  titleOf: (code: string) => string;
  canSchedule: boolean;
  canCreate: boolean;
  onNew: () => void;
  onSend: (s: ReportSchedule) => void;
}) {
  const { t } = useI18n();
  const badge = (s: ReportSchedule) =>
    s.isActive !== 'true' ? (
      <Badge variant="warning">
        {s.lastSkipReason ? t(`ops.rpt.skip.${s.lastSkipReason}`) : t('ops.rpt.paused')}
      </Badge>
    ) : (
      <Badge variant="success">{t('ops.rpt.active')}</Badge>
    );
  const columns = useMemo<ColumnDef<ReportSchedule, unknown>[]>(
    () => [
      {
        id: 'report',
        header: t('ops.rpt.report'),
        cell: ({ row: { original: s } }) => (
          <span className="font-medium">{titleOf(s.definitionCode)}</span>
        ),
      },
      {
        id: 'covers',
        header: t('ops.rpt.covers'),
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row: { original: s } }) => {
          const preset = typeof s.params?.preset === 'string' ? s.params.preset : null;
          return preset ? (
            t(`ops.rpt.preset.${preset}`)
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
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
      { id: 'status', header: t('ops.tbl.status'), cell: ({ row: { original: s } }) => badge(s) },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'text-end' },
        cell: ({ row: { original: s } }) =>
          canSchedule ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSend(s)}
              data-testid={`schedule-send-${s.id}`}
            >
              <Send aria-hidden="true" />
              {t('ops.rpt.sendNow')}
            </Button>
          ) : null,
      },
    ],
    [t, titleOf, canSchedule, onSend],
  );
  return (
    <section aria-label={t('ops.rpt.schedule')} data-testid="report-schedules">
      <DataTable
        label={t('ops.rpt.schedule')}
        columns={columns}
        data={schedules}
        getRowId={(s) => s.id}
        loading={loading}
        bodyTestId="report-schedule-rows"
        error={
          error ? (
            <StateView
              kind="error"
              title={t('ops.rpt.loadFail')}
              actionLabel={t('ops.st.retry')}
              onAction={onRetry}
              className="py-14"
            />
          ) : undefined
        }
        empty={
          <StateView icon={CalendarClock} title={t('ops.rpt.noSchedules')} className="py-14">
            {canCreate ? (
              <Button size="sm" onClick={onNew}>
                <Plus aria-hidden="true" />
                {t('ops.rpt.newSchedule')}
              </Button>
            ) : null}
          </StateView>
        }
      />
    </section>
  );
}
