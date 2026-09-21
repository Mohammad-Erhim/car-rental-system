import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { ChevronDown, GitMerge, ShieldPlus, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  AddRestrictionDialog,
  MergeDialog,
  PrivacyRequestDecisionDialog,
  RestrictionDecisionDialog,
  UnmergeDialog,
} from './customer-dialogs';
import {
  ActivityCard,
  BalanceCard,
  DriversCard,
  MergeHistoryCard,
  PrivacyRequestsCard,
  ProfileCard,
  ReservationsCard,
  RestrictionsCard,
  type PrivacyRequestAction,
  type RestrictionAction,
} from './customer-sections';
import { CustomerStatus } from './customer-status';

import { Page, PageHeader } from '@/components/page-header';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { BreadcrumbLabelSetter } from '@/layouts/breadcrumb-label';
import {
  useCustomerRecord,
  type CustomerRestriction,
  type PrivacyRequest,
} from '@/lib/admin-hooks';
import { ApiError } from '@/lib/api';

type Modal =
  | { kind: 'addRestriction' }
  | { kind: 'decision'; action: RestrictionAction; restriction: CustomerRestriction }
  | { kind: 'privacyDecision'; action: PrivacyRequestAction; request: PrivacyRequest }
  | { kind: 'merge' }
  | { kind: 'unmerge' };

function DetailSkeleton() {
  return (
    <Page aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-52" />
        </div>
        <Skeleton className="h-40" />
      </div>
    </Page>
  );
}

/**
 * SCREEN-OPS-021 / 022 · FR-ADM-001/002 — one customer's consolidated record: contact, saved
 * drivers, reservations, rentals, balance, open cases, eligibility restrictions (create → a
 * different manager approves → active → lift) and the reversible duplicate merge. Every record
 * view is a PII access recorded on the audit trail (SRS-SEC-016). Actions are modals.
 */
export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [modal, setModal] = useState<Modal | null>(null);
  const record = useCustomerRecord(id);
  const r = record.data;

  if (record.isLoading) return <DetailSkeleton />;
  if (record.isError || !r) {
    const notFound = record.error instanceof ApiError && record.error.status === 404;
    return (
      <Page>
        <StateView
          kind={notFound ? 'empty' : 'error'}
          title={notFound ? t('ops.cust.noResults') : t('ops.cust.loadRecordFail')}
          actionLabel={notFound ? t('ops.rentd.back') : t('ops.st.retry')}
          onAction={notFound ? () => navigate('/customers') : () => void record.refetch()}
          className="py-24"
        />
      </Page>
    );
  }

  const canManage = hasPermission('customer.manage');
  const isMerged = r.status === 'merged';
  const openMerges = r.mergeHistory.filter((m) => !m.reversedAt);
  const hasActiveRestriction = r.restrictions.some((x) => x.status === 'active');
  const money = (minor: number, currency = r.balance.currency) =>
    fmt.money({ amountMinor: minor, currency });
  const close = (open: boolean) => {
    if (!open) setModal(null);
  };

  return (
    <Page data-testid="cust-record">
      <BreadcrumbLabelSetter label={r.fullName} />
      <PageHeader
        title={r.fullName}
        badge={
          <span className="flex items-center gap-2">
            <CustomerStatus status={r.status} />
            {hasActiveRestriction ? (
              <Badge variant="warning">{t('ops.cust.restricted')}</Badge>
            ) : null}
          </span>
        }
        description={r.email ?? r.phone ?? undefined}
        actions={
          canManage ? (
            <>
              {!isMerged ? (
                <Button onClick={() => setModal({ kind: 'addRestriction' })} data-testid="rstr-add">
                  <ShieldPlus aria-hidden="true" />
                  {t('ops.cust.rstrAdd')}
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" data-testid="cust-more">
                    {t('ops.resv.moreActions')}
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[13rem]">
                  {!isMerged ? (
                    <DropdownMenuItem
                      onSelect={() => setModal({ kind: 'merge' })}
                      data-testid="cust-merge-open"
                    >
                      <GitMerge aria-hidden="true" />
                      {t('ops.cust.mergeTitle')}
                    </DropdownMenuItem>
                  ) : null}
                  {isMerged || openMerges.length ? (
                    <DropdownMenuItem
                      onSelect={() => setModal({ kind: 'unmerge' })}
                      data-testid="cust-unmerge"
                    >
                      <Undo2 aria-hidden="true" />
                      {isMerged ? t('ops.cust.undoMerge') : t('ops.cust.undoLastMerge')}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-4 lg:col-span-2">
          <ProfileCard r={r} />
          <RestrictionsCard
            r={r}
            onAction={(restriction, action) => setModal({ kind: 'decision', restriction, action })}
          />
          <PrivacyRequestsCard
            r={r}
            onAction={(request, action) => setModal({ kind: 'privacyDecision', request, action })}
          />
          <ReservationsCard r={r} money={money} />
        </div>
        <div className="space-y-4">
          <BalanceCard r={r} money={money} />
          <DriversCard r={r} />
          <ActivityCard r={r} />
          <MergeHistoryCard r={r} />
        </div>
      </div>

      {modal?.kind === 'addRestriction' ? (
        <AddRestrictionDialog customerId={r.id} open onOpenChange={close} />
      ) : null}
      {modal?.kind === 'decision' ? (
        <RestrictionDecisionDialog
          customerId={r.id}
          action={modal.action}
          restriction={modal.restriction}
          open
          onOpenChange={close}
        />
      ) : null}
      {modal?.kind === 'privacyDecision' ? (
        <PrivacyRequestDecisionDialog
          customerId={r.id}
          action={modal.action}
          request={modal.request}
          open
          onOpenChange={close}
        />
      ) : null}
      {modal?.kind === 'merge' ? <MergeDialog record={r} open onOpenChange={close} /> : null}
      {modal?.kind === 'unmerge' ? <UnmergeDialog record={r} open onOpenChange={close} /> : null}
    </Page>
  );
}
