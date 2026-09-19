import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCheck, EyeOff, MoreHorizontal, RefreshCw, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { findingActions, inTab, needsAction, SAMPLE_LINK, type Tab } from './dq-model';
import { NoteDialog } from './note-dialog';

import { paths } from '@/app/paths';
import { DataTable } from '@/components/data-table/data-table';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useAcknowledgeFinding,
  useDataQuality,
  useMarkFindingFalsePositive,
  useResolveFinding,
  type DataQualityCheck,
} from '@/lib/admin-hooks';
import { useClientPage } from '@/lib/use-client-page';
import { useListParams } from '@/lib/use-list-params';

const TABS: Tab[] = ['issues', 'all', 'clear'];
const STATE_TONE: Record<DataQualityCheck['findingState'], BadgeProps['variant']> = {
  clear: 'success',
  open: 'destructive',
  acknowledged: 'warning',
  resolved: 'secondary',
  false_positive: 'secondary',
};
const SEVERITY_TONE = (s: string): BadgeProps['variant'] =>
  s === 'high' ? 'destructive' : s === 'medium' ? 'warning' : 'secondary';
const getRowId = (c: DataQualityCheck) => c.id;

type Modal = { kind: 'resolve' | 'falsePositive'; check: DataQualityCheck };

/**
 * SCREEN-OPS-039 — Data quality. A read-only sweep of referential-integrity and drift checks, plus
 * FR-RPT-006's case layer over it: a finding someone has acknowledged, resolved or marked a false
 * positive stays that way for the same set of violations (only a materially different set reopens
 * it) instead of asking for attention on every visit. The checks never change this app's data —
 * acknowledging or resolving only writes the finding's own tracking row.
 */
export function DataQualityPage() {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('audit.manage');
  const { state, update } = useListParams(['tab'] as const);
  const tab: Tab = (TABS as string[]).includes(state.tab) ? (state.tab as Tab) : 'issues';
  const [modal, setModal] = useState<Modal | null>(null);

  const report = useDataQuality();
  const acknowledge = useAcknowledgeFinding();
  const resolve = useResolveFinding();
  const falsePositive = useMarkFindingFalsePositive();
  const checks = useMemo(() => report.data?.checks ?? [], [report.data]);
  const issues = checks.filter((c) => !c.ok);
  const open = checks.filter(needsAction);
  const count = (tb: Tab) => checks.filter((c) => inTab(c, tb)).length;
  const visible = useMemo(() => checks.filter((c) => inTab(c, tab)), [checks, tab]);
  const { pageRows, pagination } = useClientPage(visible, state, update);

  const doAcknowledge = async (c: DataQualityCheck) => {
    try {
      await acknowledge.mutateAsync({ checkId: c.id });
      toast.success(t('ops.dq.acknowledgeDone'));
    } catch {
      toast.error(t('ops.dq.actionFail'));
    }
  };

  const menu = (c: DataQualityCheck) => {
    const actions = canManage ? findingActions(c) : [];
    if (!actions.length) return null;
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('ops.resv.moreActions')}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            {actions.includes('acknowledge') ? (
              <DropdownMenuItem
                onSelect={() => void doAcknowledge(c)}
                data-testid={`dq-acknowledge-${c.id}`}
              >
                <CheckCheck aria-hidden="true" />
                {t('ops.dq.acknowledge')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={() => setModal({ kind: 'resolve', check: c })}
              data-testid={`dq-resolve-${c.id}`}
            >
              <ShieldCheck aria-hidden="true" />
              {t('ops.dq.resolve')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setModal({ kind: 'falsePositive', check: c })}
              data-testid={`dq-false-positive-${c.id}`}
            >
              <EyeOff aria-hidden="true" />
              {t('ops.dq.falsePositive')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const countCell = (c: DataQualityCheck) =>
    c.error ? (
      <Badge variant="warning" title={c.error}>
        {t('ops.dq.checkFailed')}
      </Badge>
    ) : c.ok ? (
      <Badge variant="success">{t('ops.dq.clear')}</Badge>
    ) : (
      <span className="font-semibold tabular-nums text-destructive">{c.count}</span>
    );
  const stateCell = (c: DataQualityCheck) =>
    c.error || c.findingState === 'clear' ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className="flex flex-col items-start gap-1">
        <Badge variant={STATE_TONE[c.findingState]}>{t(`ops.dq.state.${c.findingState}`)}</Badge>
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
  const sampleCell = (c: DataQualityCheck) => {
    if (c.error) return <span className="text-xs text-muted-foreground">{c.error}</span>;
    if (!c.sample.length) return <span className="text-muted-foreground">—</span>;
    const toHref = SAMPLE_LINK[c.id];
    return (
      <span className="bidi-isolate flex flex-wrap gap-x-1 font-mono text-xs text-muted-foreground">
        {c.sample.map((key, i) => (
          <span key={key}>
            {toHref ? (
              <Link to={toHref(key)} className="underline decoration-dotted hover:text-foreground">
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
  };

  const columns = useMemo<ColumnDef<DataQualityCheck, unknown>[]>(
    () => [
      {
        id: 'check',
        header: t('ops.dq.check'),
        cell: ({ row: { original: c } }) => (
          <span>
            <span className={c.ok ? '' : 'font-medium'}>{c.title}</span>
            <span className="bidi-isolate block font-mono text-xs text-muted-foreground">
              {c.id}
            </span>
          </span>
        ),
      },
      {
        id: 'severity',
        header: t('ops.dq.severity'),
        cell: ({ row: { original: c } }) => (
          <Badge variant={SEVERITY_TONE(c.severity)}>{c.severity}</Badge>
        ),
      },
      { id: 'count', header: t('ops.dq.count'), cell: ({ row: { original: c } }) => countCell(c) },
      {
        id: 'status',
        header: t('ops.dq.status'),
        cell: ({ row: { original: c } }) => stateCell(c),
      },
      {
        id: 'sample',
        header: t('ops.dq.sample'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: c } }) => sampleCell(c),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.dq.actions')}</span>,
        meta: { className: 'w-12 text-end' },
        cell: ({ row: { original: c } }) => menu(c),
      },
    ],

    [t, fmt, canManage],
  );

  const close = (o: boolean) => {
    if (!o) setModal(null);
  };

  return (
    <Page>
      <PageHeader
        title={t('ops.dq.title')}
        description={t('ops.dq.subtitle')}
        badge={
          report.data ? (
            report.data.ok ? (
              <Badge variant="success" data-testid="dq-summary">
                {t('ops.dq.allClear')}
              </Badge>
            ) : (
              <Badge variant="warning" data-testid="dq-summary">
                {t('ops.dq.issues', { n: issues.length })}
              </Badge>
            )
          ) : null
        }
        meta={
          report.data ? (
            <span>{t('ops.dq.checkedAt', { at: fmt.dateTime(report.data.checkedAt) })}</span>
          ) : null
        }
        actions={
          <Button
            variant="outline"
            onClick={() => void report.refetch()}
            loading={report.isFetching}
            data-testid="dq-refresh"
          >
            <RefreshCw aria-hidden="true" />
            {t('ops.dq.refresh')}
          </Button>
        }
      />

      {open.length ? (
        <Alert variant="warning">
          <AlertDescription>{t('ops.dq.openBanner', { n: open.length })}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="p-4 sm:p-5">
        <StateSwitcher
          label={t('ops.dq.card')}
          value={tab}
          onChange={(v) => update({ tab: v === 'issues' ? '' : v })}
          testIdPrefix="dq-tab"
          options={[
            { value: 'issues', label: `${t('ops.dq.tabIssues')} (${count('issues')})` },
            { value: 'clear', label: `${t('ops.dq.clear')} (${count('clear')})` },
            { value: 'all', label: `${t('ops.rp.tabAll')} (${count('all')})` },
          ]}
        />
      </Card>

      <p className="px-1 text-xs text-muted-foreground">
        {t('ops.dq.scheduleHint')}{' '}
        <Link to={paths.reports} className="underline decoration-dotted hover:text-foreground">
          {t('ops.dq.scheduleLinkText')}
        </Link>
      </p>

      <section aria-label={t('ops.dq.card')} data-testid="dq-table">
        <DataTable
          label={t('ops.dq.card')}
          columns={columns}
          data={pageRows}
          getRowId={getRowId}
          loading={report.isLoading}
          fetching={report.isFetching}
          bodyTestId="dq-rows"
          renderCard={(c) => (
            <div className="flex items-start gap-3 p-4" data-check={c.id} data-ok={String(c.ok)}>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{c.title}</span>
                  {countCell(c)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={SEVERITY_TONE(c.severity)}>{c.severity}</Badge>
                  {stateCell(c)}
                </div>
                {c.sample.length ? sampleCell(c) : null}
              </div>
              {menu(c)}
            </div>
          )}
          error={
            report.isError ? (
              <StateView
                kind="error"
                title={t('ops.dq.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void report.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={
            <StateView
              icon={ShieldCheck}
              title={t(tab === 'issues' ? 'ops.dq.allClear' : 'ops.dq.empty')}
              className="py-14"
            />
          }
          pagination={pagination}
        />
      </section>

      {modal?.kind === 'resolve' ? (
        <NoteDialog
          open
          onOpenChange={close}
          title={t('ops.dq.resolveTitle')}
          body={t('ops.dq.resolveBody')}
          label={t('ops.dq.resolveReason')}
          confirmLabel={t('ops.dq.resolve')}
          onConfirm={async (note) => {
            await resolve.mutateAsync({ checkId: modal.check.id, note });
            toast.success(t('ops.dq.resolveDone'));
          }}
        />
      ) : null}
      {modal?.kind === 'falsePositive' ? (
        <NoteDialog
          open
          onOpenChange={close}
          title={t('ops.dq.falsePositiveTitle')}
          body={t('ops.dq.falsePositiveBody')}
          label={t('ops.dq.falsePositiveReason')}
          confirmLabel={t('ops.dq.falsePositive')}
          onConfirm={async (note) => {
            await falsePositive.mutateAsync({ checkId: modal.check.id, note });
            toast.success(t('ops.dq.falsePositiveDone'));
          }}
        />
      ) : null}
    </Page>
  );
}
