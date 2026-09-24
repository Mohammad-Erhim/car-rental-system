import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CompleteDialog, RejectDialog } from './privacy-dialogs';

import { DataTable } from '@/components/data-table/data-table';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import {
  usePrivacyRequests,
  useReviewPrivacyRequest,
  type PrivacyRequestRow,
  type PrivacyStatus,
} from '@/lib/privacy-hooks';
import { useListParams } from '@/lib/use-list-params';

const VIEWS = ['open', 'done', 'all'] as const;
const KINDS = ['access', 'correction', 'closure'] as const;
const STATUS_TONE: Record<PrivacyStatus, BadgeProps['variant']> = {
  received: 'secondary',
  in_review: 'warning',
  blocked: 'destructive',
  completed: 'success',
  rejected: 'secondary',
  cancelled: 'secondary',
};
const OPEN: PrivacyStatus[] = ['received', 'in_review', 'blocked'];
const getRowId = (r: PrivacyRequestRow) => r.id;

type Dialog = { action: 'complete' | 'reject'; request: PrivacyRequestRow };

/**
 * FR-IAM-008 — data requests (DEC-041). Customers ask, from their account, for a copy of their data,
 * a correction, or to close the account; a reply is due within a month. Staff with `customer.manage`
 * work the queue here: review, then complete or reject with a reason the customer can read. A
 * closure is refused while the account has open activity, and completing one — which erases the
 * person for good — asks for a fresh password. Staff who can only read customers see the queue but
 * no actions.
 */
export function PrivacyPage() {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('customer.manage');
  const { state, update } = useListParams(['view', 'kind'] as const);
  const view = (VIEWS as readonly string[]).includes(state.view) ? state.view : 'open';
  const kind = (KINDS as readonly string[]).includes(state.kind) ? state.kind : '';
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const list = usePrivacyRequests({
    status: view === 'all' ? undefined : view,
    kind: kind || undefined,
    page: state.page,
    pageSize: state.pageSize,
  });
  const review = useReviewPrivacyRequest();

  async function onReview(r: PrivacyRequestRow) {
    try {
      await review.mutateAsync({ id: r.id });
      toast.success(t('ops.priv.reviewing'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('ops.priv.actionFail'));
    }
  }

  const actions = (r: PrivacyRequestRow) =>
    canManage && OPEN.includes(r.status) ? (
      <div className="flex flex-wrap justify-end gap-1.5">
        {r.status !== 'in_review' ? (
          <Button
            size="sm"
            variant="outline"
            loading={review.isPending && review.variables?.id === r.id}
            onClick={() => void onReview(r)}
            data-testid={`privacy-review-${r.id}`}
          >
            <Eye aria-hidden="true" />
            {t('ops.priv.review')}
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() => setDialog({ action: 'complete', request: r })}
          data-testid={`privacy-complete-${r.id}`}
        >
          <Check aria-hidden="true" />
          {t('ops.priv.complete')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDialog({ action: 'reject', request: r })}
          data-testid={`privacy-reject-${r.id}`}
        >
          <X aria-hidden="true" />
          {t('ops.priv.reject')}
        </Button>
      </div>
    ) : null;

  const due = (r: PrivacyRequestRow) => (
    <span className={r.overdue ? 'font-medium text-destructive' : undefined}>
      {fmt.date(r.dueAt)}
      {r.overdue ? (
        <Badge variant="destructive" className="ms-2">
          {t('ops.priv.overdue')}
        </Badge>
      ) : null}
    </span>
  );

  const columns = useMemo<ColumnDef<PrivacyRequestRow, unknown>[]>(
    () => [
      {
        id: 'customer',
        header: t('ops.priv.col.customer'),
        cell: ({ row: { original: r } }) => (
          <div>
            <p className="font-medium">{r.customer.name}</p>
            <p className="text-xs text-muted-foreground">{r.customer.email ?? '—'}</p>
          </div>
        ),
      },
      {
        id: 'kind',
        header: t('ops.priv.col.kind'),
        cell: ({ row: { original: r } }) => (
          <Badge variant="outline">{t(`ops.priv.kind.${r.kind}`)}</Badge>
        ),
      },
      {
        id: 'status',
        header: t('ops.priv.col.status'),
        cell: ({ row: { original: r } }) => (
          <div className="space-y-1">
            <Badge variant={STATUS_TONE[r.status]}>{t(`ops.priv.status.${r.status}`)}</Badge>
            {r.status === 'blocked'
              ? r.blockers.map((b) => (
                  <p key={b.code} className="text-xs text-muted-foreground">
                    {t(`privacy.blocker.${b.code}`, { count: b.count ?? 0 })}
                  </p>
                ))
              : null}
            {r.resolutionNote && !OPEN.includes(r.status) ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">{r.resolutionNote}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'filed',
        header: t('ops.priv.col.filed'),
        cell: ({ row: { original: r } }) => fmt.dateTime(r.createdAt),
      },
      {
        id: 'due',
        header: t('ops.priv.col.due'),
        cell: ({ row: { original: r } }) => (OPEN.includes(r.status) ? due(r) : '—'),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'text-end' },
        cell: ({ row: { original: r } }) => actions(r),
      },
    ],
    [t, fmt, canManage, review.isPending, review.variables],
  );

  const total = list.data?.total ?? 0;
  const pagination = {
    page: state.page,
    pageSize: state.pageSize,
    total,
    pageSizeOptions: [10, 25, 50],
    onPageChange: (p: number) => update({ page: p }),
    onPageSizeChange: (s: number) => update({ pageSize: s }),
  };

  return (
    <Page>
      <PageHeader title={t('ops.priv.title')} description={t('ops.priv.subtitle')} />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <StateSwitcher
            label={t('ops.priv.title')}
            value={view}
            onChange={(v) => update({ view: v === 'open' ? '' : v })}
            testIdPrefix="priv-view"
            options={VIEWS.map((v) => ({ value: v, label: t(`ops.priv.view.${v}`) }))}
          />
          <StateSwitcher
            label={t('ops.priv.col.kind')}
            value={kind}
            onChange={(v) => update({ kind: v })}
            testIdPrefix="priv-kind"
            variant="underline"
            options={[
              { value: '', label: t('ops.priv.kind.all') },
              ...KINDS.map((k) => ({ value: k, label: t(`ops.priv.kind.${k}`) })),
            ]}
          />
        </div>
      </Card>

      <section aria-label={t('ops.priv.title')} data-testid="privacy-table">
        <DataTable
          label={t('ops.priv.title')}
          columns={columns}
          data={list.data?.items ?? []}
          getRowId={getRowId}
          loading={list.isLoading}
          fetching={list.isFetching}
          bodyTestId="privacy-rows"
          renderCard={(r) => (
            <div className="space-y-3 p-4" data-testid={`privacy-card-${r.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{r.customer.name}</p>
                  <p className="text-xs text-muted-foreground">{r.customer.email ?? '—'}</p>
                </div>
                <Badge variant={STATUS_TONE[r.status]}>{t(`ops.priv.status.${r.status}`)}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{t(`ops.priv.kind.${r.kind}`)}</Badge>
                <span className="text-muted-foreground">{fmt.dateTime(r.createdAt)}</span>
                {OPEN.includes(r.status) ? due(r) : null}
              </div>
              {actions(r)}
            </div>
          )}
          error={
            list.isError ? (
              <StateView
                kind="error"
                title={t('ops.priv.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void list.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={<StateView icon={ShieldCheck} title={t('ops.priv.empty')} className="py-14" />}
          pagination={pagination}
        />
      </section>

      {dialog?.action === 'complete' ? (
        <CompleteDialog
          request={dialog.request}
          open
          onOpenChange={(o) => (o ? undefined : setDialog(null))}
        />
      ) : null}
      {dialog?.action === 'reject' ? (
        <RejectDialog
          request={dialog.request}
          open
          onOpenChange={(o) => (o ? undefined : setDialog(null))}
        />
      ) : null}
    </Page>
  );
}
