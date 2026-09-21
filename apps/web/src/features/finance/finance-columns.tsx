import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCheck, RotateCw } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { paths } from '@/app/paths';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ReconciliationException, RecoveryCase } from '@/lib/finance-hooks';

export interface CaseHandlers {
  onRetry: (c: RecoveryCase) => void;
  onResolve: (c: RecoveryCase) => void;
  /** id of the case whose retry is in flight */
  retrying: string | null;
}

const SEVERITY_TONE: Record<string, React.ComponentProps<typeof Badge>['variant']> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'warning',
  low: 'secondary',
};

export function SeverityBadge({ severity }: { severity: string }) {
  const { t } = useI18n();
  return (
    <Badge variant={SEVERITY_TONE[severity] ?? 'secondary'}>{t(`ops.fin.sev.${severity}`)}</Badge>
  );
}

/** Days-old text ("today", "3 days old"). */
export function useAge() {
  const { t } = useI18n();
  return (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return days <= 0 ? t('ops.fin.today') : t('ops.fin.daysOld', { n: days });
  };
}

/** A reservation or rental subject links to its record; anything else is plain text. */
export function SubjectLink({ type, reference }: { type: string; reference: string }) {
  const to =
    type === 'reservation'
      ? paths.reservation(reference)
      : type === 'rental'
        ? `/rentals/${encodeURIComponent(reference)}`
        : null;
  const label = (
    <span className="bidi-isolate whitespace-nowrap font-mono text-xs">{reference}</span>
  );
  return (
    <div className="space-y-0.5">
      {to ? (
        <Link to={to} className="font-medium text-primary underline-offset-4 hover:underline">
          {label}
        </Link>
      ) : (
        label
      )}
      <p className="text-xs text-muted-foreground">{type.replace(/_/g, ' ')}</p>
    </div>
  );
}

/** Retry + Resolve for a recovery case (hidden without `payment.reconcile`). */
export function CaseActions({ c, handlers }: { c: RecoveryCase; handlers: CaseHandlers }) {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  if (!hasPermission('payment.reconcile')) return null;
  return (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        loading={handlers.retrying === c.id}
        disabled={handlers.retrying !== null}
        onClick={() => handlers.onRetry(c)}
        data-testid={`case-retry-${c.id}`}
      >
        <RotateCw aria-hidden="true" />
        {t('ops.fin.retry')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => handlers.onResolve(c)}
        data-testid={`case-resolve-${c.id}`}
      >
        <CheckCheck aria-hidden="true" />
        {t('ops.fin.resolve')}
      </Button>
    </div>
  );
}

export function useCaseColumns(handlers: CaseHandlers): ColumnDef<RecoveryCase, unknown>[] {
  const { t } = useI18n();
  const age = useAge();
  return useMemo<ColumnDef<RecoveryCase, unknown>[]>(
    () => [
      {
        id: 'kind',
        header: t('ops.fin.kind'),
        cell: ({ row: { original: c } }) => (
          <div className="space-y-1">
            <p className="font-medium">{t(`ops.fin.caseKind.${c.kind}`)}</p>
            {c.state === 'in_progress' ? (
              <Badge variant="warning">{t('ops.fin.caseState.in_progress')}</Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'severity',
        header: t('ops.fin.severity'),
        cell: ({ row: { original: c } }) => <SeverityBadge severity={c.severity} />,
      },
      {
        id: 'subject',
        header: t('ops.fin.subject'),
        cell: ({ row: { original: c } }) => (
          <SubjectLink type={c.subjectType} reference={c.subjectRef} />
        ),
      },
      {
        id: 'summary',
        header: t('ops.fin.summary'),
        meta: { className: 'hidden max-w-xs xl:table-cell' },
        cell: ({ row: { original: c } }) => (
          <span className="text-muted-foreground">{c.summary}</span>
        ),
      },
      {
        id: 'retries',
        header: t('ops.fin.retries'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: c } }) => (
          <span className="tabular-nums">{c.detail?.retryCount ?? 0}</span>
        ),
      },
      {
        id: 'age',
        header: t('ops.fin.age'),
        cell: ({ row: { original: c } }) => (
          <span className="whitespace-nowrap text-muted-foreground">{age(c.createdAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'text-end' },
        cell: ({ row: { original: c } }) => <CaseActions c={c} handlers={handlers} />,
      },
    ],
    [t, age, handlers],
  );
}

export function CaseCard({ c, handlers }: { c: RecoveryCase; handlers: CaseHandlers }) {
  const { t } = useI18n();
  const age = useAge();
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">{t(`ops.fin.caseKind.${c.kind}`)}</p>
          <p className="text-xs text-muted-foreground">{age(c.createdAt)}</p>
        </div>
        <SeverityBadge severity={c.severity} />
      </div>
      <SubjectLink type={c.subjectType} reference={c.subjectRef} />
      <p className="text-sm text-muted-foreground">{c.summary}</p>
      <CaseActions c={c} handlers={handlers} />
    </div>
  );
}

/** The exception's kind — and, for a card dispute, what finance needs in order to act on it: why it
 *  was raised, where it stands, and the day the evidence is due. */
function ExceptionKind({ e }: { e: ReconciliationException }) {
  const { t, fmt } = useI18n();
  const d = e.kind === 'dispute' ? e.detail : null;
  return (
    <div className="space-y-1">
      <Badge variant="warning">{t(`ops.fin.excKind.${e.kind}`)}</Badge>
      {d?.dueBy ? (
        <p className="text-xs font-medium text-destructive">
          {t('ops.fin.disputeDue', { date: fmt.dateTime(d.dueBy) })}
        </p>
      ) : null}
      {d?.status ? (
        <p className="text-xs text-muted-foreground">
          {t('ops.fin.disputeStatus', { status: d.status.replaceAll('_', ' ') })}
        </p>
      ) : null}
      {d?.reason ? (
        <p className="text-xs text-muted-foreground">
          {t('ops.fin.disputeReason', { reason: d.reason.replaceAll('_', ' ') })}
        </p>
      ) : null}
    </div>
  );
}

export function useExceptionColumns(
  onResolve: (e: ReconciliationException) => void,
): ColumnDef<ReconciliationException, unknown>[] {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canWork = hasPermission('payment.reconcile');
  const money = (e: ReconciliationException, minor: number | null) =>
    minor == null ? '—' : fmt.money({ amountMinor: minor, currency: e.currency });

  return useMemo<ColumnDef<ReconciliationException, unknown>[]>(
    () => [
      {
        id: 'reference',
        header: t('ops.fin.reservation'),
        cell: ({ row: { original: e } }) =>
          e.reservationReference ? (
            <SubjectLink type="reservation" reference={e.reservationReference} />
          ) : (
            '—'
          ),
      },
      {
        id: 'kind',
        header: t('ops.fin.kind'),
        cell: ({ row: { original: e } }) => <ExceptionKind e={e} />,
      },
      {
        id: 'ledger',
        header: t('ops.fin.ledger'),
        meta: { className: 'text-end' },
        cell: ({ row: { original: e } }) => (
          <span className="tabular-nums">{money(e, e.ledgerAmountMinor)}</span>
        ),
      },
      {
        id: 'provider',
        header: t('ops.fin.provider'),
        meta: { className: 'text-end' },
        cell: ({ row: { original: e } }) => (
          <span className="tabular-nums">{money(e, e.providerAmountMinor)}</span>
        ),
      },
      {
        id: 'delta',
        header: t('ops.fin.delta'),
        meta: { className: 'text-end' },
        cell: ({ row: { original: e } }) => (
          <span
            className={
              e.deltaMinor ? 'font-semibold tabular-nums text-destructive' : 'tabular-nums'
            }
          >
            {money(e, e.deltaMinor)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'text-end' },
        cell: ({ row: { original: e } }) =>
          canWork ? (
            <Button size="sm" variant="outline" onClick={() => onResolve(e)}>
              <CheckCheck aria-hidden="true" />
              {t('ops.fin.resolve')}
            </Button>
          ) : null,
      },
    ],

    [t, fmt, canWork, onResolve],
  );
}

export function ExceptionCard({
  e,
  onResolve,
}: {
  e: ReconciliationException;
  onResolve: (e: ReconciliationException) => void;
}) {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const money = (minor: number | null) =>
    minor == null ? '—' : fmt.money({ amountMinor: minor, currency: e.currency });
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        {e.reservationReference ? (
          <SubjectLink type="reservation" reference={e.reservationReference} />
        ) : (
          <span>—</span>
        )}
        <ExceptionKind e={e} />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t('ops.fin.ledger')}</dt>
          <dd className="tabular-nums">{money(e.ledgerAmountMinor)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('ops.fin.provider')}</dt>
          <dd className="tabular-nums">{money(e.providerAmountMinor)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('ops.fin.delta')}</dt>
          <dd className="font-semibold tabular-nums text-destructive">{money(e.deltaMinor)}</dd>
        </div>
      </dl>
      {hasPermission('payment.reconcile') ? (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => onResolve(e)}>
            <CheckCheck aria-hidden="true" />
            {t('ops.fin.resolve')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
