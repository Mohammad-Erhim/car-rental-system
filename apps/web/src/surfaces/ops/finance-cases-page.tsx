import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DataTable,
  Field,
  PageHeader,
  Textarea,
  Toolbar,
  type DataTableColumn,
} from '@carrental/ui';
import { useState } from 'react';

import { ApiError } from '../../lib/api.js';
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
 * SCREEN-OPS-036/037 — recovery & reconciliation (FR-INT-002, FR-PAY-009). Owned recovery cases
 * (money moved, a downstream step failed) with a **Retry** that re-signals the case and
 * auto-resolves it once the world is consistent again — never a silent close; plus the payment
 * reconciliation exception list with a manual run. Resolving anything needs a note (audit trail).
 */
export function FinanceCasesPage() {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canWork = hasPermission('payment.reconcile');

  const cases = useRecoveryCases();
  const exceptions = useReconciliationExceptions();
  const retry = useRetryCase();
  const resolveCase = useResolveCase();
  const resolveExc = useResolveException();
  const runReconcile = useRunReconciliation();

  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [resolving, setResolving] = useState<null | { type: 'case' | 'exception'; id: string }>(
    null,
  );
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);

  const errText = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);
  const money = (m: number, c: string) => fmt.money({ amountMinor: m, currency: c });

  const age = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return days <= 0 ? t('ops.fin.today') : t('ops.fin.daysOld', { n: days });
  };

  async function doRetry(id: string) {
    setResult(null);
    try {
      const r = await retry.mutateAsync(id);
      setResult({
        ok: true,
        text:
          r.outcome === 'resolved'
            ? t('ops.fin.retryResolved', { n: r.retryCount })
            : t('ops.fin.retryStillOpen', { n: r.retryCount }),
      });
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.fin.retryFail')) });
    }
  }

  async function doResolve() {
    if (!resolving) return;
    if (!note.trim()) {
      setNoteError(true);
      throw new Error('note required'); // keeps the ConfirmDialog open
    }
    setNoteError(false);
    setResult(null);
    try {
      if (resolving.type === 'case') {
        await resolveCase.mutateAsync({ id: resolving.id, note: note.trim() });
      } else {
        await resolveExc.mutateAsync({ id: resolving.id, note: note.trim() });
      }
      setResult({ ok: true, text: t('ops.fin.resolved') });
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.fin.resolveFail')) });
    } finally {
      setResolving(null);
      setNote('');
    }
  }

  async function doRun() {
    setResult(null);
    try {
      const r = await runReconcile.mutateAsync();
      setResult({ ok: true, text: t('ops.fin.ranReconcile', { n: r.exceptionsOpened }) });
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.fin.reconcileFail')) });
    }
  }

  const sevVariant = (s: string) =>
    s === 'critical' || s === 'high' ? 'destructive' : s === 'medium' ? 'warning' : 'neutral';

  const caseColumns: Array<DataTableColumn<RecoveryCase>> = [
    {
      key: 'kind',
      header: t('ops.fin.kind'),
      cell: (c) => (
        <span className="flex flex-wrap items-center gap-1">
          {t(`ops.fin.caseKind.${c.kind}`)}
          {c.state === 'in_progress' ? (
            <Badge variant="warning">{t('ops.fin.caseState.in_progress')}</Badge>
          ) : null}
        </span>
      ),
      className: 'text-xs',
    },
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
              loading={retry.isPending && retry.variables === c.id}
              disabled={retry.isPending}
              onClick={() => doRetry(c.id)}
              data-testid={`case-retry-${c.id}`}
            >
              {t('ops.fin.retry')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setResolving({ type: 'case', id: c.id })}
            >
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
    {
      key: 'kind',
      header: t('ops.fin.kind'),
      cell: (e) => t(`ops.fin.excKind.${e.kind}`),
      className: 'text-xs',
    },
    {
      key: 'ledger',
      header: t('ops.fin.ledger'),
      cell: (e) => (e.ledgerAmountMinor == null ? '—' : money(e.ledgerAmountMinor, e.currency)),
      className: 'tabular-nums',
    },
    {
      key: 'provider',
      header: t('ops.fin.provider'),
      cell: (e) => (e.providerAmountMinor == null ? '—' : money(e.providerAmountMinor, e.currency)),
      className: 'tabular-nums',
    },
    {
      key: 'delta',
      header: t('ops.fin.delta'),
      cell: (e) =>
        e.deltaMinor == null ? (
          '—'
        ) : (
          <span className={e.deltaMinor === 0 ? '' : 'font-medium text-destructive'}>
            {money(e.deltaMinor, e.currency)}
          </span>
        ),
      className: 'tabular-nums',
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (e) =>
        canWork ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setResolving({ type: 'exception', id: e.id })}
          >
            {t('ops.fin.resolve')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.fin.title')} description={t('ops.fin.subtitle')} />

      {result ? (
        <Alert variant={result.ok ? 'success' : 'destructive'} data-testid="finance-result">
          <AlertTitle>{result.ok ? t('state.success.title') : t('state.failure.title')}</AlertTitle>
          <AlertDescription>{result.text}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">{t('ops.fin.cases')}</CardTitle>
          {cases.data ? (
            <span className="text-sm text-muted-foreground" data-testid="finance-case-count">
              {t('ops.fin.openCount', { n: cases.data.length })}
            </span>
          ) : null}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{t('ops.fin.reconciliation')}</CardTitle>
            {exceptions.data ? (
              <span className="text-sm text-muted-foreground" data-testid="finance-exc-count">
                {t('ops.fin.openCount', { n: exceptions.data.length })}
              </span>
            ) : null}
          </div>
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
            minWidth="44rem"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.fin.excLoadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.fin.noExceptions'),
            }}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!resolving}
        onOpenChange={(v) => {
          if (!v) {
            setResolving(null);
            setNote('');
            setNoteError(false);
          }
        }}
        title={t('ops.fin.resolveTitle')}
        description={
          <div className="space-y-3">
            <p>{t('ops.fin.resolveBody')}</p>
            <Field
              label={t('ops.fin.resolutionNote')}
              htmlFor="fin-note"
              required
              error={noteError ? t('ops.fin.noteRequired') : undefined}
            >
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    if (e.target.value.trim()) setNoteError(false);
                  }}
                  data-testid="finance-resolve-note"
                />
              )}
            </Field>
          </div>
        }
        confirmLabel={t('ops.fin.resolve')}
        onConfirm={doResolve}
      />
    </div>
  );
}
