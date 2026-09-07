import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  PageHeader,
  Toolbar,
  type DataTableColumn,
} from '@carrental/ui';
import { useState } from 'react';

import { ApiError } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { formatMinor } from '../../lib/discovery-hooks.js';
import {
  useReconciliationExceptions,
  useRecoveryCases,
  useResolveCase,
  useResolveException,
  useRetryCase,
  useRunReconciliation,
  type ReconciliationException,
  type RecoveryCase,
} from '../../lib/finance-hooks.js';

/**
 * SCREEN-OPS-036/037 — recovery & reconciliation (FR-INT-002, FR-PAY-009). Owned recovery
 * cases (money moved, a downstream step failed) with a **Retry** that re-signals the case and
 * auto-resolves it once the world is consistent again — never a silent close; plus the payment
 * reconciliation exception list with a manual run.
 */
export function FinanceCasesPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canWork = hasPermission('payment.reconcile');

  const cases = useRecoveryCases();
  const exceptions = useReconciliationExceptions();
  const retry = useRetryCase();
  const resolveCase = useResolveCase();
  const resolveExc = useResolveException();
  const runReconcile = useRunReconciliation();
  const [msg, setMsg] = useState<string | null>(null);

  const age = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return days <= 0 ? t('ops.fin.today') : t('ops.fin.daysOld', { n: days });
  };

  async function doRetry(id: string) {
    setMsg(null);
    try {
      const r = await retry.mutateAsync(id);
      setMsg(
        r.outcome === 'resolved'
          ? t('ops.fin.retryResolved', { n: r.retryCount })
          : t('ops.fin.retryStillOpen', { n: r.retryCount }),
      );
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('ops.fin.retryFail'));
    }
  }

  async function doResolveCase(id: string) {
    const note = window.prompt(t('ops.fin.resolvePrompt'))?.trim();
    if (!note) return;
    setMsg(null);
    try {
      await resolveCase.mutateAsync({ id, note });
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('ops.fin.resolveFail'));
    }
  }

  async function doResolveExc(id: string) {
    const note = window.prompt(t('ops.fin.resolvePrompt'))?.trim();
    if (!note) return;
    setMsg(null);
    try {
      await resolveExc.mutateAsync({ id, note });
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('ops.fin.resolveFail'));
    }
  }

  async function doRun() {
    setMsg(null);
    try {
      const r = await runReconcile.mutateAsync();
      setMsg(t('ops.fin.ranReconcile', { n: r.exceptionsOpened }));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('ops.fin.reconcileFail'));
    }
  }

  const sevVariant = (s: string) =>
    s === 'critical' || s === 'high' ? 'destructive' : s === 'medium' ? 'warning' : 'neutral';

  const caseColumns: Array<DataTableColumn<RecoveryCase>> = [
    { key: 'kind', header: t('ops.fin.kind'), cell: (c) => c.kind, className: 'font-mono text-xs' },
    {
      key: 'severity',
      header: t('ops.fin.severity'),
      cell: (c) => <Badge variant={sevVariant(c.severity)}>{c.severity}</Badge>,
    },
    {
      key: 'subject',
      header: t('ops.fin.subject'),
      cell: (c) => (
        <span className="bidi-isolate">
          {c.subjectType} · {c.subjectRef}
        </span>
      ),
      className: 'text-xs',
    },
    { key: 'summary', header: t('ops.fin.summary'), cell: (c) => c.summary },
    {
      key: 'retries',
      header: t('ops.fin.retries'),
      cell: (c) => c.detail?.retryCount ?? 0,
      className: 'tabular-nums',
    },
    { key: 'age', header: t('ops.fin.age'), cell: (c) => age(c.createdAt), className: 'text-xs' },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (c) =>
        canWork ? (
          <span className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              loading={retry.isPending}
              onClick={() => doRetry(c.id)}
              data-testid={`case-retry-${c.id}`}
            >
              {t('ops.fin.retry')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => doResolveCase(c.id)}>
              {t('ops.fin.resolve')}
            </Button>
          </span>
        ) : null,
    },
  ];

  const excColumns: Array<DataTableColumn<ReconciliationException>> = [
    {
      key: 'ref',
      header: t('ops.fin.reservation'),
      cell: (e) => e.reservationReference ?? '—',
      className: 'bidi-isolate font-mono text-xs',
    },
    { key: 'kind', header: t('ops.fin.kind'), cell: (e) => e.kind, className: 'font-mono text-xs' },
    {
      key: 'ledger',
      header: t('ops.fin.ledger'),
      cell: (e) => (e.ledgerAmountMinor == null ? '—' : formatMinor(e.ledgerAmountMinor, 'USD')),
      className: 'tabular-nums',
    },
    {
      key: 'provider',
      header: t('ops.fin.provider'),
      cell: (e) =>
        e.providerAmountMinor == null ? '—' : formatMinor(e.providerAmountMinor, 'USD'),
      className: 'tabular-nums',
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (e) =>
        canWork ? (
          <Button size="sm" variant="ghost" onClick={() => doResolveExc(e.id)}>
            {t('ops.fin.resolve')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.fin.title')} description={t('ops.fin.subtitle')} />

      {msg ? (
        <p className="text-sm text-muted-foreground" data-testid="finance-msg">
          {msg}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.fin.cases')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={caseColumns}
            rows={cases.data}
            rowKey={(c) => c.id}
            isLoading={cases.isLoading}
            isError={cases.isError}
            onRetry={() => cases.refetch()}
            rowProps={(c) => ({ 'data-kind': c.kind })}
            testid="recovery-case-table"
            bodyTestid="recovery-case-rows"
            minWidth="48rem"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.fin.casesLoadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.fin.noCases'),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">{t('ops.fin.reconciliation')}</CardTitle>
          {canWork ? (
            <Toolbar aria-label={t('ops.fin.reconciliation')}>
              <Button
                size="sm"
                variant="outline"
                loading={runReconcile.isPending}
                onClick={doRun}
                data-testid="reconcile-run"
              >
                {t('ops.fin.runReconcile')}
              </Button>
            </Toolbar>
          ) : null}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={excColumns}
            rows={exceptions.data}
            rowKey={(e) => e.id}
            isLoading={exceptions.isLoading}
            isError={exceptions.isError}
            onRetry={() => exceptions.refetch()}
            testid="reconciliation-table"
            bodyTestid="reconciliation-rows"
            minWidth="40rem"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.fin.excLoadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.fin.noExceptions'),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
