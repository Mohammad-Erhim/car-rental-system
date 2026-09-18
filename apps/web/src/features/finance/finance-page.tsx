import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  CaseCard,
  ExceptionCard,
  useCaseColumns,
  useExceptionColumns,
  type CaseHandlers,
} from './finance-columns';
import { ResolveDialog, type ResolveTarget } from './resolve-dialog';

import { CountPills } from '@/components/count-pills';
import { DataTable } from '@/components/data-table/data-table';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import {
  useReconciliationExceptions,
  useRecoveryCases,
  useRetryCase,
  useRunReconciliation,
  type ReconciliationException,
  type RecoveryCase,
} from '@/lib/finance-hooks';
import { PAGE_SIZES, useListParams } from '@/lib/use-list-params';

const FILTERS = ['view', 'severity'] as const;
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
/** The API returns at most this many open items, newest first. */
const API_CAP = 200;

const caseId = (c: RecoveryCase) => c.id;
const exceptionId = (e: ReconciliationException) => e.id;

/**
 * SCREEN-OPS-036/037 — recovery & reconciliation (FR-INT-002, FR-PAY-009). Two work queues on
 * two tabs: owned recovery cases (money moved, a downstream step failed) and payment
 * reconciliation exceptions. **Retry** re-signals a case and auto-resolves it once the records
 * agree again — never a silent close. Resolving anything needs a note (audit trail).
 *
 * Both queues are bounded, open-only lists, so they are paged in the browser.
 */
export function FinancePage() {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canWork = hasPermission('payment.reconcile');
  const { state, update } = useListParams(FILTERS);
  const view = state.view === 'reconciliation' ? 'reconciliation' : 'cases';
  const [resolving, setResolving] = useState<ResolveTarget | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const cases = useRecoveryCases();
  const exceptions = useReconciliationExceptions();
  const retry = useRetryCase();
  const run = useRunReconciliation();

  async function onRetry(c: RecoveryCase) {
    setRetrying(c.id);
    try {
      const r = await retry.mutateAsync(c.id);
      if (r.outcome === 'resolved') toast.success(t('ops.fin.retryResolved', { n: r.retryCount }));
      else toast.warning(t('ops.fin.retryStillOpen', { n: r.retryCount }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('ops.fin.retryFail'));
    } finally {
      setRetrying(null);
    }
  }

  async function onRun() {
    setRunError(null);
    try {
      const r = await run.mutateAsync();
      toast.success(t('ops.fin.ranReconcile', { n: r.exceptionsOpened }));
    } catch (e) {
      setRunError(e instanceof ApiError ? e.message : t('ops.fin.reconcileFail'));
    }
  }

  const handlers = useMemo<CaseHandlers>(
    () => ({
      onRetry: (c) => void onRetry(c),
      onResolve: (c) => setResolving({ type: 'case', id: c.id }),
      retrying,
    }),

    [retrying],
  );
  const caseColumns = useCaseColumns(handlers);
  const exceptionColumns = useExceptionColumns((e) =>
    setResolving({ type: 'exception', id: e.id }),
  );

  // severity pills work on the loaded queue
  const severity = SEVERITIES.includes(state.severity) ? state.severity : '';
  const allCases = cases.data ?? [];
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of allCases) counts[c.severity] = (counts[c.severity] ?? 0) + 1;
    return counts;
  }, [allCases]);
  const shownCases = severity ? allCases.filter((c) => c.severity === severity) : allCases;
  const allExceptions = exceptions.data ?? [];

  // client-side paging over the active list
  const source: unknown[] = view === 'cases' ? shownCases : allExceptions;
  const total = source.length;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  const page = Math.min(state.page, pageCount);
  const slice = <T,>(rows: T[]) => rows.slice((page - 1) * state.pageSize, page * state.pageSize);
  const pagination = {
    page,
    pageSize: state.pageSize,
    total,
    pageSizeOptions: PAGE_SIZES,
    onPageChange: (p: number) => update({ page: p }),
    onPageSizeChange: (s: number) => update({ pageSize: s }),
  };
  const capped = (view === 'cases' ? allCases.length : allExceptions.length) >= API_CAP;

  const tab = (label: string, n: number | undefined) =>
    n === undefined ? label : `${label} (${fmt.number(n)})`;

  return (
    <Page>
      <PageHeader
        title={t('ops.fin.title')}
        description={t('ops.fin.subtitle')}
        actions={
          canWork ? (
            <Button
              variant="outline"
              loading={run.isPending}
              onClick={() => void onRun()}
              data-testid="reconcile-run"
            >
              {run.isPending ? null : <RefreshCw aria-hidden="true" />}
              {t('ops.fin.runReconcile')}
            </Button>
          ) : null
        }
      />

      {runError ? (
        <Alert variant="destructive" data-testid="finance-result">
          <AlertDescription>{runError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <StateSwitcher
            label={t('ops.fin.title')}
            value={view}
            onChange={(v) => update({ view: v === 'reconciliation' ? v : '', severity: '' })}
            testIdPrefix="fin-tab"
            options={[
              { value: 'cases', label: tab(t('ops.fin.cases'), cases.data?.length) },
              {
                value: 'reconciliation',
                label: tab(t('ops.fin.reconciliation'), exceptions.data?.length),
              },
            ]}
          />
        </div>
        {view === 'cases' && allCases.length ? (
          <div className="border-t bg-muted/20 p-4 sm:p-5">
            <CountPills
              label={t('ops.fin.severity')}
              value={severity}
              onChange={(v) => update({ severity: v })}
              pills={[
                { value: '', label: t('ops.fin.allSeverities'), count: allCases.length },
                ...SEVERITIES.filter((s) => severityCounts[s]).map((s) => ({
                  value: s,
                  label: t(`ops.fin.sev.${s}`),
                  count: severityCounts[s],
                })),
              ]}
            />
          </div>
        ) : null}
      </Card>

      {capped ? (
        <Alert variant="warning">
          <AlertDescription>{t('ops.fin.capped', { n: API_CAP })}</AlertDescription>
        </Alert>
      ) : null}

      {view === 'cases' ? (
        <section aria-label={t('ops.fin.cases')} data-testid="recovery-case-table">
          <DataTable
            label={t('ops.fin.cases')}
            columns={caseColumns}
            data={slice(shownCases)}
            getRowId={caseId}
            loading={cases.isLoading}
            fetching={cases.isFetching}
            bodyTestId="recovery-case-rows"
            renderCard={(c) => <CaseCard c={c} handlers={handlers} />}
            error={
              cases.isError ? (
                <StateView
                  kind="error"
                  title={t('ops.fin.casesLoadFail')}
                  actionLabel={t('ops.st.retry')}
                  onAction={() => void cases.refetch()}
                  className="py-14"
                />
              ) : undefined
            }
            empty={
              <StateView
                icon={CheckCircle2}
                title={t('ops.fin.noCases')}
                className="py-14 [&>span]:bg-success/10 [&>span]:text-success"
              />
            }
            pagination={pagination}
          />
        </section>
      ) : (
        <section aria-label={t('ops.fin.reconciliation')} data-testid="reconciliation-table">
          <DataTable
            label={t('ops.fin.reconciliation')}
            columns={exceptionColumns}
            data={slice(allExceptions)}
            getRowId={exceptionId}
            loading={exceptions.isLoading}
            fetching={exceptions.isFetching}
            bodyTestId="reconciliation-rows"
            renderCard={(e) => (
              <ExceptionCard
                e={e}
                onResolve={(x) => setResolving({ type: 'exception', id: x.id })}
              />
            )}
            error={
              exceptions.isError ? (
                <StateView
                  kind="error"
                  title={t('ops.fin.excLoadFail')}
                  actionLabel={t('ops.st.retry')}
                  onAction={() => void exceptions.refetch()}
                  className="py-14"
                />
              ) : undefined
            }
            empty={
              <StateView
                icon={CheckCircle2}
                title={t('ops.fin.noExceptions')}
                className="py-14 [&>span]:bg-success/10 [&>span]:text-success"
              />
            }
            pagination={pagination}
          />
        </section>
      )}

      {resolving ? (
        <ResolveDialog
          target={resolving}
          open
          onOpenChange={(open) => {
            if (!open) setResolving(null);
          }}
        />
      ) : null}
    </Page>
  );
}
