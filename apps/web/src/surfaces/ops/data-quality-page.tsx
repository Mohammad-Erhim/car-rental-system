import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
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
  useToast,
  type DataTableColumn,
} from '@carrental/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  useAcknowledgeFinding,
  useDataQuality,
  useMarkFindingFalsePositive,
  useResolveFinding,
  type DataQualityCheck,
} from '../../lib/admin-hooks.js';

/** Checks whose `sample` keys are a record reference this app already has a detail page for —
 *  the drill-down pattern used across the audit/consent-log/staff-roles pages, so a flagged
 *  reference is one click away from the actual record instead of a plain string to copy by hand.
 *  Not every check's key format has a matching route yet (e.g. a plate or a `kind:key` pair) —
 *  those stay plain text rather than link to a page that can't filter by them. */
const SAMPLE_LINK: Partial<Record<string, (key: string) => string>> = {
  reservation_orphan_account: (key) => `/ops/work/${key}`,
  rental_active_without_unit: (key) => `/ops/rentals/${key}`,
};

const STATE_VARIANT: Record<
  DataQualityCheck['findingState'],
  'success' | 'destructive' | 'warning' | 'neutral'
> = {
  clear: 'success',
  open: 'destructive',
  acknowledged: 'warning',
  resolved: 'neutral',
  false_positive: 'neutral',
};

/**
 * SCREEN-OPS-039 — Data quality. A read-only sweep of referential-integrity / drift checks, plus
 * FR-RPT-006's case-management layer over it: a finding an ops person has already acknowledged,
 * resolved, or marked false-positive stays that way for the exact same violating set (only a
 * materially different one reopens it) instead of re-demanding attention on every visit. The
 * checks themselves never mutate any of *this app's* data — acknowledging/resolving only writes
 * to the finding's own tracking row.
 */
export function DataQualityPage() {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('audit.manage');
  const report = useDataQuality();
  const acknowledge = useAcknowledgeFinding();
  const resolve = useResolveFinding();
  const falsePositive = useMarkFindingFalsePositive();

  const [resolving, setResolving] = useState<DataQualityCheck | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [markingFalsePositive, setMarkingFalsePositive] = useState<DataQualityCheck | null>(null);
  const [fpNote, setFpNote] = useState('');

  const sevVariant = (s: string) =>
    s === 'high' ? 'destructive' : s === 'medium' ? 'warning' : 'neutral';

  async function doAcknowledge(checkId: string) {
    try {
      await acknowledge.mutateAsync({ checkId });
      toast({ title: t('ops.dq.acknowledgeDone'), variant: 'success' });
    } catch {
      toast({ title: t('ops.dq.actionFail') });
    }
  }

  async function doResolve() {
    // throwing (not just returning) keeps ConfirmDialog open with the inline error visible,
    // instead of silently closing on an empty reason
    if (!resolveNote.trim() || !resolving) throw new Error('reason required');
    try {
      await resolve.mutateAsync({ checkId: resolving.id, note: resolveNote.trim() });
      toast({ title: t('ops.dq.resolveDone'), variant: 'success' });
      setResolving(null);
      setResolveNote('');
    } catch {
      toast({ title: t('ops.dq.actionFail') });
      throw new Error('resolve failed');
    }
  }

  async function doFalsePositive() {
    if (!fpNote.trim() || !markingFalsePositive) throw new Error('reason required');
    try {
      await falsePositive.mutateAsync({ checkId: markingFalsePositive.id, note: fpNote.trim() });
      toast({ title: t('ops.dq.falsePositiveDone'), variant: 'success' });
      setMarkingFalsePositive(null);
      setFpNote('');
    } catch {
      toast({ title: t('ops.dq.actionFail') });
      throw new Error('false positive failed');
    }
  }

  const columns: Array<DataTableColumn<DataQualityCheck>> = [
    {
      key: 'check',
      header: t('ops.dq.check'),
      cell: (c) => (
        <span className={c.ok ? '' : 'font-medium'}>
          {c.title}
          <span className="ms-2 font-mono text-xs text-muted-foreground">{c.id}</span>
        </span>
      ),
    },
    {
      key: 'severity',
      header: t('ops.dq.severity'),
      cell: (c) => <Badge variant={sevVariant(c.severity)}>{c.severity}</Badge>,
    },
    {
      key: 'count',
      header: t('ops.dq.count'),
      cell: (c) =>
        c.error ? (
          <Badge variant="warning" title={c.error}>
            {t('ops.dq.checkFailed')}
          </Badge>
        ) : c.ok ? (
          <Badge variant="success">{t('ops.dq.clear')}</Badge>
        ) : (
          <span className="font-semibold tabular-nums text-destructive">{c.count}</span>
        ),
    },
    {
      key: 'status',
      header: t('ops.dq.status'),
      cell: (c) => {
        if (c.error || c.findingState === 'clear') return '—';
        return (
          <span className="flex flex-col gap-0.5">
            <Badge variant={STATE_VARIANT[c.findingState]}>
              {t(`ops.dq.state.${c.findingState}`)}
            </Badge>
            {c.findingState === 'open' && c.firstSeenAt ? (
              <span className="text-xs text-muted-foreground">
                {t('ops.dq.firstSeen', { at: fmt.dateTime(c.firstSeenAt) })}
              </span>
            ) : null}
            {(c.findingState === 'resolved' || c.findingState === 'false_positive') &&
            c.resolutionNote ? (
              <span
                className="max-w-[16rem] truncate text-xs text-muted-foreground"
                title={c.resolutionNote}
              >
                {c.resolutionNote}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'sample',
      header: t('ops.dq.sample'),
      cell: (c) => {
        if (c.error) return <span className="text-xs text-muted-foreground">{c.error}</span>;
        if (!c.sample.length) return '—';
        const toHref = SAMPLE_LINK[c.id];
        return (
          <span className="bidi-isolate flex flex-wrap gap-x-1 font-mono text-xs text-muted-foreground">
            {c.sample.map((key, i) => (
              <span key={key}>
                {toHref ? (
                  <Link
                    to={toHref(key)}
                    className="underline decoration-dotted hover:text-foreground"
                  >
                    {key}
                  </Link>
                ) : (
                  key
                )}
                {i < c.sample.length - 1 ? ',' : ''}
              </span>
            ))}
          </span>
        );
      },
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: t('ops.dq.actions'),
            cell: (c: DataQualityCheck) => {
              if (c.error || c.findingState === 'clear' || c.findingState === 'resolved') {
                return null;
              }
              if (c.findingState === 'false_positive') return null;
              return (
                <span className="flex flex-wrap gap-1.5">
                  {c.findingState === 'open' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={acknowledge.isPending}
                      onClick={() => doAcknowledge(c.id)}
                      data-testid={`dq-acknowledge-${c.id}`}
                    >
                      {t('ops.dq.acknowledge')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setResolving(c)}
                    data-testid={`dq-resolve-${c.id}`}
                  >
                    {t('ops.dq.resolve')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setMarkingFalsePositive(c)}
                    data-testid={`dq-false-positive-${c.id}`}
                  >
                    {t('ops.dq.falsePositive')}
                  </Button>
                </span>
              );
            },
          },
        ]
      : []),
  ];

  const issues = (report.data?.checks ?? []).filter((c) => !c.ok);

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.dq.title')} description={t('ops.dq.subtitle')} />

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">{t('ops.dq.card')}</CardTitle>
          <Toolbar aria-label={t('ops.dq.card')}>
            {report.data ? (
              <span className="text-sm" data-testid="dq-summary">
                {report.data.ok ? (
                  <Badge variant="success">{t('ops.dq.allClear')}</Badge>
                ) : (
                  <Badge variant="warning">{t('ops.dq.issues', { n: issues.length })}</Badge>
                )}
                <span className="ms-2 text-xs text-muted-foreground">
                  {t('ops.dq.checkedAt', {
                    at: fmt.dateTime(report.data.checkedAt),
                  })}
                </span>
              </span>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              loading={report.isFetching}
              onClick={() => report.refetch()}
              data-testid="dq-refresh"
            >
              {t('ops.dq.refresh')}
            </Button>
          </Toolbar>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t('ops.dq.scheduleHint')}{' '}
            <Link to="/ops/insights" className="underline decoration-dotted hover:text-foreground">
              {t('ops.dq.scheduleLinkText')}
            </Link>
          </p>
          <DataTable
            columns={columns}
            rows={report.data?.checks}
            rowKey={(c) => c.id}
            isLoading={report.isLoading}
            isError={report.isError}
            onRetry={() => report.refetch()}
            rowProps={(c) => ({ 'data-check': c.id, 'data-ok': String(c.ok) })}
            testid="dq-table"
            bodyTestid="dq-rows"
            minWidth="54rem"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.dq.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.dq.empty'),
            }}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!resolving}
        onOpenChange={(v) => {
          if (!v) {
            setResolving(null);
            setResolveNote('');
          }
        }}
        title={t('ops.dq.resolveTitle')}
        description={
          <div className="space-y-3">
            <p>{t('ops.dq.resolveBody')}</p>
            <Field
              label={t('ops.dq.resolveReason')}
              htmlFor="dq-resolve-note"
              required
              error={resolving && !resolveNote.trim() ? t('ops.dq.reasonRequired') : undefined}
            >
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  data-testid="dq-resolve-note"
                />
              )}
            </Field>
          </div>
        }
        confirmLabel={t('ops.dq.resolve')}
        onConfirm={doResolve}
      />

      <ConfirmDialog
        open={!!markingFalsePositive}
        onOpenChange={(v) => {
          if (!v) {
            setMarkingFalsePositive(null);
            setFpNote('');
          }
        }}
        title={t('ops.dq.falsePositiveTitle')}
        description={
          <div className="space-y-3">
            <p>{t('ops.dq.falsePositiveBody')}</p>
            <Field
              label={t('ops.dq.falsePositiveReason')}
              htmlFor="dq-fp-note"
              required
              error={
                markingFalsePositive && !fpNote.trim() ? t('ops.dq.reasonRequired') : undefined
              }
            >
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={fpNote}
                  onChange={(e) => setFpNote(e.target.value)}
                  data-testid="dq-fp-note"
                />
              )}
            </Field>
          </div>
        }
        confirmLabel={t('ops.dq.falsePositive')}
        onConfirm={doFalsePositive}
      />
    </div>
  );
}
