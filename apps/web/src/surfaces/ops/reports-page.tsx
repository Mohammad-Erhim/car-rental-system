import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@carrental/ui';
import { useState } from 'react';

import {
  fetchReportCsv,
  useReportDefinitions,
  useReportRuns,
  useReportSchedules,
  useRunReport,
  useScheduleReport,
  type ReportRunResult,
} from '../../lib/admin-hooks.js';
import { ApiError } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';

/**
 * SCREEN-OPS-035 — Reports. Each report is a whitelisted aggregate (no free SQL). Rows are
 * limited to the operator's location scope (FR-RPT-004); the scope in force is shown with every
 * result. A completed run can be exported as CSV or scheduled for recurring delivery.
 */
export function ReportsPage() {
  const { hasPermission } = useAuth();
  const canSchedule = hasPermission('report.export');

  const defs = useReportDefinitions();
  const runs = useReportRuns();
  const schedules = useReportSchedules();
  const run = useRunReport();
  const schedule = useScheduleReport();

  const [selected, setSelected] = useState<string>('');
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState<string | null>(null);

  const [sched, setSched] = useState({ cron: '0 7 * * 1', recipients: '' });
  const [schedError, setSchedError] = useState<string | null>(null);

  const code = selected || defs.data?.[0]?.code || '';

  async function doRun() {
    setRunError(null);
    setCsvOpen(null);
    try {
      const r = await run.mutateAsync({ code });
      setResult(r);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : 'Report run failed.');
    }
  }

  async function showCsv(runId: string) {
    try {
      const text = await fetchReportCsv(runId);
      setCsvOpen(text);
    } catch {
      setCsvOpen('Export failed.');
    }
  }

  function downloadCsv(runId: string, text: string) {
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${runId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSchedError(null);
    const recipients = sched.recipients
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await schedule.mutateAsync({ definitionCode: code, cron: sched.cron, recipients });
      setSched((s) => ({ ...s, recipients: '' }));
    } catch (err) {
      setSchedError(err instanceof ApiError ? err.message : 'Could not save the schedule.');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Operational and financial summaries. Results are limited to the locations you are scoped
          to; every run records the scope it used.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run a report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {defs.isLoading ? (
            <AppStateView kind="loading" inline title="Loading…" />
          ) : defs.isError ? (
            <AppStateView
              kind="failure"
              inline
              title="Couldn't load reports"
              primaryAction={{ label: 'Retry', onClick: () => defs.refetch() }}
            />
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label="Report" htmlFor="rpt-select" className="w-full sm:w-72">
                  {({ id }) => (
                    <select
                      id={id}
                      data-testid="report-select"
                      className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={code}
                      onChange={(e) => {
                        setSelected(e.target.value);
                        setResult(null);
                      }}
                    >
                      {(defs.data ?? []).map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Button onClick={doRun} loading={run.isPending} data-testid="report-run">
                  Run
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {defs.data?.find((d) => d.code === code)?.description}
              </p>
            </>
          )}

          {runError ? (
            <p className="text-sm text-destructive" data-testid="report-run-error">
              {runError}
            </p>
          ) : null}

          {result ? (
            <div className="space-y-2" data-testid="report-result">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="neutral" data-testid="report-scope-note">
                  {result.scopeNote}
                </Badge>
                <span className="text-muted-foreground">
                  {result.rowCount} row{result.rowCount === 1 ? '' : 's'}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => showCsv(result.runId)}
                  data-testid="report-export"
                >
                  Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm" data-testid="report-table">
                  <thead className="text-start text-xs uppercase text-muted-foreground">
                    <tr>
                      {(result.columns.length
                        ? result.columns
                        : Object.keys(result.rows[0] ?? {})
                      ).map((c) => (
                        <th key={c} className="py-1 pe-3 text-start font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.length ? (
                      result.rows.map((row, i) => (
                        <tr key={i} className="border-t">
                          {(result.columns.length ? result.columns : Object.keys(row)).map((c) => (
                            <td key={c} className="py-2 pe-3 font-mono text-xs">
                              {String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t">
                        <td
                          className="py-2 text-muted-foreground"
                          colSpan={result.columns.length || 1}
                        >
                          No data for this scope yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {csvOpen !== null ? (
                <div className="space-y-2">
                  <pre
                    className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 text-xs"
                    data-testid="report-csv"
                  >
                    {csvOpen}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadCsv(result.runId, csvOpen)}
                  >
                    Download file
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent runs</CardTitle>
          </CardHeader>
          <CardContent>
            {runs.isLoading ? (
              <AppStateView kind="loading" inline title="Loading…" />
            ) : !runs.data?.length ? (
              <AppStateView kind="empty" inline title="No runs yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[24rem] text-sm">
                  <tbody data-testid="report-run-rows">
                    {runs.data.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-2 pe-3 font-medium">{r.definitionCode}</td>
                        <td className="py-2 pe-3 text-muted-foreground">{r.scopeNote ?? '—'}</td>
                        <td className="py-2 pe-3">{r.rowCount}</td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scheduled delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {schedules.isLoading ? (
              <AppStateView kind="loading" inline title="Loading…" />
            ) : !schedules.data?.length ? (
              <p className="text-sm text-muted-foreground">No schedules yet.</p>
            ) : (
              <ul className="space-y-2 text-sm" data-testid="report-schedule-rows">
                {schedules.data.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 border-b pb-2">
                    <span>
                      <span className="font-medium">{s.definitionCode}</span>{' '}
                      <span className="font-mono text-xs text-muted-foreground">{s.cron}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.recipients.length} recipient{s.recipients.length === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {canSchedule ? (
              <form onSubmit={submitSchedule} className="space-y-3" noValidate>
                <Field label="Cron" htmlFor="sch-cron" hint="minute hour day month weekday">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={sched.cron}
                      onChange={(e) => setSched((s) => ({ ...s, cron: e.target.value }))}
                      className="font-mono"
                    />
                  )}
                </Field>
                <Field label="Recipients" htmlFor="sch-to" hint="comma-separated email addresses">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="text"
                      placeholder="ops@example.test, finance@example.test"
                      value={sched.recipients}
                      onChange={(e) => setSched((s) => ({ ...s, recipients: e.target.value }))}
                    />
                  )}
                </Field>
                <Button
                  type="submit"
                  size="sm"
                  loading={schedule.isPending}
                  data-testid="report-schedule"
                >
                  Schedule “{defs.data?.find((d) => d.code === code)?.title ?? code}”
                </Button>
                {schedError ? (
                  <p className="text-sm text-destructive" data-testid="report-schedule-error">
                    {schedError}
                  </p>
                ) : null}
              </form>
            ) : (
              <p className="text-xs text-muted-foreground">
                Scheduling requires the report.export permission.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
