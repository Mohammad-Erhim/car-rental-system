import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Ban, CarFront, ChevronDown, CircleDollarSign, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AssignVehicleDialog } from './assign-vehicle-dialog';
import {
  BookingSummaryCard,
  ChargesCard,
  DriversCard,
  HistoryCard,
  InvoicesCard,
  LineItemsCard,
} from './detail-sections';
import { CancelDialog, NoShowDialog, RefundDialog } from './reservation-action-dialogs';

import { Page, PageHeader } from '@/components/page-header';
import { StateView } from '@/components/state-view';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useOpsInvoices } from '@/lib/invoice-hooks';
import { useReservationDetail, useReservationHistory } from '@/lib/reservation-hooks';

type Dialog = 'assign' | 'noShow' | 'cancel' | 'refund' | null;

function DetailSkeleton() {
  return (
    <Page aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-52" />
          <Skeleton className="h-44" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-52" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </Page>
  );
}

/**
 * SCREEN-OPS-004 (detail) — a single reservation for staff: the booking window, charges,
 * drivers and full history, plus the lifecycle actions an agent needs. The primary action (assign
 * a vehicle) sits in the header; the rarer, riskier ones (no-show, cancel, refund) live in a
 * menu. Every action is its own modal that reports the exact API error inline and stays open on
 * failure (design §12.5).
 */
export function ReservationDetailPage() {
  const { reference = '' } = useParams();
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);

  const detail = useReservationDetail(reference);
  const history = useReservationHistory(reference);
  const invoices = useOpsInvoices(reference);

  if (detail.isLoading) return <DetailSkeleton />;

  if (detail.isError || !detail.data) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <Page>
        <StateView
          kind={notFound ? 'empty' : 'error'}
          title={notFound ? t('ops.resv.notFound') : t('state.failure.title')}
          description={notFound ? t('ops.resv.notFoundBody') : t('ops.resv.loadError')}
          actionLabel={notFound ? t('ops.resv.backToQueue') : t('action.retry')}
          onAction={notFound ? () => navigate('/work') : () => void detail.refetch()}
          className="py-24"
        />
      </Page>
    );
  }

  const d = detail.data;
  const money = (minor: number) => fmt.money({ amountMinor: minor, currency: d.currency });

  const canModify = hasPermission('reservation.modify');
  const canCancel = hasPermission('reservation.cancel', 'reservation.modify');
  const canAssign = hasPermission('rental.pickup', 'fleet.manage');
  const canRefund = hasPermission('payment.refund');
  const refundableMinor = d.paidMinor - d.refundedMinor;

  const showAssign = canAssign && d.state === 'confirmed' && !d.assignedRentalRef;
  const showNoShow = canModify && d.state === 'confirmed';
  const showCancel = canCancel && d.cancellable;
  const showRefund = canRefund && refundableMinor > 0;
  const hasMenu = showNoShow || showCancel || showRefund;

  return (
    <Page>
      <PageHeader
        title={<span className="bidi-isolate font-mono">{d.reference}</span>}
        badge={<StatusBadge status={d.state} className="text-sm" />}
        description={
          d.assignedRentalRef ? (
            <Link
              to={`/rentals/${encodeURIComponent(d.assignedRentalRef)}`}
              className="font-medium text-primary hover:underline"
            >
              {t('ops.queue.openRental')} →{' '}
              <span className="bidi-isolate">{d.assignedRentalRef}</span>
            </Link>
          ) : (
            t('ops.resv.noRentalYet')
          )
        }
        actions={
          showAssign || hasMenu ? (
            <>
              {showAssign ? (
                <Button onClick={() => setDialog('assign')} data-testid="reservation-assign">
                  <CarFront aria-hidden="true" />
                  {t('ops.queue.assign')}
                </Button>
              ) : null}
              {hasMenu ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" data-testid="reservation-more">
                      {t('ops.resv.moreActions')}
                      <ChevronDown aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[13rem]">
                    {showNoShow ? (
                      <DropdownMenuItem onSelect={() => setDialog('noShow')}>
                        <UserX aria-hidden="true" />
                        {t('ops.resv.markNoShow')}
                      </DropdownMenuItem>
                    ) : null}
                    {showRefund ? (
                      <DropdownMenuItem
                        onSelect={() => setDialog('refund')}
                        data-testid="reservation-refund"
                      >
                        <CircleDollarSign aria-hidden="true" />
                        {t('ops.resv.refund')}
                      </DropdownMenuItem>
                    ) : null}
                    {showCancel && (showNoShow || showRefund) ? <DropdownMenuSeparator /> : null}
                    {showCancel ? (
                      <DropdownMenuItem
                        onSelect={() => setDialog('cancel')}
                        className="text-destructive focus:text-destructive"
                      >
                        <Ban aria-hidden="true" />
                        {t('ops.resv.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </>
          ) : null
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-4 lg:col-span-2">
          <BookingSummaryCard d={d} />
          <LineItemsCard d={d} money={money} />
          <InvoicesCard invoices={invoices.data ?? []} money={money} />
        </div>
        <div className="space-y-4">
          <ChargesCard d={d} money={money} />
          <DriversCard drivers={d.drivers} />
          <HistoryCard events={history.data} loading={history.isLoading} money={money} />
        </div>
      </div>

      {showAssign ? (
        <AssignVehicleDialog
          target={d}
          open={dialog === 'assign'}
          onOpenChange={(open) => setDialog(open ? 'assign' : null)}
        />
      ) : null}
      {showNoShow ? (
        <NoShowDialog
          reference={reference}
          open={dialog === 'noShow'}
          onOpenChange={(open) => setDialog(open ? 'noShow' : null)}
        />
      ) : null}
      {showCancel ? (
        <CancelDialog
          reference={reference}
          currency={d.currency}
          open={dialog === 'cancel'}
          onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
        />
      ) : null}
      {showRefund ? (
        <RefundDialog
          reference={reference}
          currency={d.currency}
          refundableMinor={refundableMinor}
          open={dialog === 'refund'}
          onOpenChange={(open) => setDialog(open ? 'refund' : null)}
        />
      ) : null}
    </Page>
  );
}
