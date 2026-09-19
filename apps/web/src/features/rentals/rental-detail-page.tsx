import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  AlertTriangle,
  CalendarPlus,
  CarFront,
  ChevronDown,
  ClipboardCheck,
  KeyRound,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AssignVehicleDialog } from '../reservations/assign-vehicle-dialog';

import { ConditionCard, RentalSummaryCard, SettlementCard } from './rental-detail-sections';
import {
  ExtendDialog,
  IncidentDialog,
  PickupDialog,
  ReadinessDialog,
  ReturnDialog,
} from './rental-dialogs';

import { paths } from '@/app/paths';
import { HistoryCard } from '@/components/history-card';
import { Page, PageHeader } from '@/components/page-header';
import { StateView } from '@/components/state-view';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useLocationAccess } from '@/lib/location-scope';
import { useOpsRentalDetail } from '@/lib/rental-hooks';

type Dialog = 'pickup' | 'return' | 'extend' | 'incident' | 'readiness' | 'reassign' | null;

function DetailSkeleton() {
  return (
    <Page aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-44" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </Page>
  );
}

/**
 * SCREEN-OPS-016 (detail) — one rental for staff: who and when, the vehicle's condition out vs.
 * in, the settlement and inspection findings, and the full history. The action that moves the
 * rental to its next state (pickup / return / readiness) is the header's primary button; the
 * rarer ones (extend, incident, reassign) live in a menu. Every action is its own modal that
 * shows the exact API error inline and stays open on failure.
 */
export function RentalDetailPage() {
  const { reference = '' } = useParams();
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);
  const detail = useOpsRentalDetail(reference);

  if (detail.isLoading) return <DetailSkeleton />;

  if (detail.isError || !detail.data) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <Page>
        <StateView
          kind={notFound ? 'empty' : 'error'}
          title={notFound ? t('ops.rentd.notFound') : t('state.failure.title')}
          description={notFound ? t('ops.rentd.notFoundBody') : t('ops.rentd.loadError')}
          actionLabel={notFound ? t('ops.rentd.back') : t('action.retry')}
          onAction={notFound ? () => navigate('/rentals') : () => void detail.refetch()}
          className="py-24"
        />
      </Page>
    );
  }

  const d = detail.data;
  const money = (minor: number) => fmt.money({ amountMinor: minor, currency: d.currency });
  const overdue =
    d.state === 'overdue' ||
    (d.state === 'active' && new Date(d.scheduledReturnAt).getTime() < Date.now());
  const inProgress = d.state === 'active' || d.state === 'overdue';

  // mirrors the API's per-action @Permissions
  const actsAt = useLocationAccess(); // pickup actions belong to the pickup branch, return actions to the return branch
  const canPickup =
    d.state === 'awaiting_pickup' && hasPermission('rental.pickup') && actsAt(d.pickupLocationCode);
  const canReturn = inProgress && hasPermission('rental.return') && actsAt(d.returnLocationCode);
  const canReady =
    d.state === 'closed' &&
    !d.readinessOutcome &&
    hasPermission('rental.pickup', 'rental.return', 'fleet.manage');
  const canExtend = inProgress && hasPermission('rental.pickup', 'rental.return');
  const canIncident = inProgress && hasPermission('rental.pickup', 'rental.return');
  const canReassign =
    d.state === 'awaiting_pickup' &&
    hasPermission('rental.pickup', 'fleet.manage') &&
    actsAt(d.pickupLocationCode);
  const hasMenu = canExtend || canIncident || canReassign;

  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <Page>
      <PageHeader
        title={<span className="bidi-isolate font-mono">{d.reference}</span>}
        badge={<StatusBadge status={overdue ? 'overdue' : d.state} className="text-sm" />}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              to={paths.reservation(d.reservationReference)}
              className="font-medium text-primary hover:underline"
            >
              {t('ops.rentd.fromReservation', { ref: d.reservationReference })}
            </Link>
            {d.state === 'closed' && d.readinessOutcome ? (
              <Badge
                variant={d.readinessOutcome === 'passed' ? 'success' : 'warning'}
                data-testid="readiness-outcome"
              >
                {d.readinessOutcome === 'passed'
                  ? t('ops.rent.readyOutcomePassed')
                  : t('ops.rent.readyOutcomeFailed')}
              </Badge>
            ) : null}
          </span>
        }
        actions={
          <>
            {canPickup ? (
              <Button onClick={() => setDialog('pickup')} data-testid="rentd-pickup-open">
                <KeyRound aria-hidden="true" />
                {t('ops.rent.runPickup')}
              </Button>
            ) : null}
            {canReturn ? (
              <Button onClick={() => setDialog('return')} data-testid="rentd-return-open">
                <Undo2 aria-hidden="true" />
                {t('ops.rent.runReturn')}
              </Button>
            ) : null}
            {canReady ? (
              <Button onClick={() => setDialog('readiness')} data-testid="rentd-readiness-open">
                <ClipboardCheck aria-hidden="true" />
                {t('ops.rent.readinessTitle')}
              </Button>
            ) : null}
            {hasMenu ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" data-testid="rentd-more">
                    {t('ops.resv.moreActions')}
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[13rem]">
                  {canExtend ? (
                    <DropdownMenuItem onSelect={() => setDialog('extend')}>
                      <CalendarPlus aria-hidden="true" />
                      {t('ops.rentd.extend')}
                    </DropdownMenuItem>
                  ) : null}
                  {canReassign ? (
                    <DropdownMenuItem
                      onSelect={() => setDialog('reassign')}
                      data-testid="rentd-reassign-open"
                    >
                      <CarFront aria-hidden="true" />
                      {t('ops.rentd.reassign')}
                    </DropdownMenuItem>
                  ) : null}
                  {canIncident ? (
                    <DropdownMenuItem
                      onSelect={() => setDialog('incident')}
                      data-testid="rentd-incident-open"
                      className="text-destructive focus:text-destructive"
                    >
                      <AlertTriangle aria-hidden="true" />
                      {t('ops.rent.reportIncident')}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-4 lg:col-span-2">
          <RentalSummaryCard d={d} />
          <ConditionCard d={d} />
          <HistoryCard
            events={d.history}
            loading={false}
            money={money}
            testId="ops-rentd-history"
          />
        </div>
        <div className="space-y-4">
          <SettlementCard d={d} money={money} />
        </div>
      </div>

      {canPickup ? (
        <PickupDialog
          reference={d.reference}
          defaultDriver={d.driverName}
          open={dialog === 'pickup'}
          onOpenChange={close}
        />
      ) : null}
      {canReturn ? (
        <ReturnDialog
          reference={d.reference}
          currency={d.currency}
          odometerOutKm={d.odometerOutKm}
          fuelOutPct={d.fuelOutPct}
          open={dialog === 'return'}
          onOpenChange={close}
        />
      ) : null}
      {canReady ? (
        <ReadinessDialog
          reference={d.reference}
          open={dialog === 'readiness'}
          onOpenChange={close}
        />
      ) : null}
      {canExtend ? (
        <ExtendDialog
          reference={d.reference}
          currency={d.currency}
          currentReturnAt={d.scheduledReturnAt}
          open={dialog === 'extend'}
          onOpenChange={close}
        />
      ) : null}
      {canIncident ? (
        <IncidentDialog
          reference={d.reference}
          categoryCode={d.categoryCode}
          locationCode={d.pickupLocationCode}
          open={dialog === 'incident'}
          onOpenChange={close}
        />
      ) : null}
      {canReassign ? (
        <AssignVehicleDialog
          variant="reassign"
          target={{
            reference: d.reservationReference,
            categoryCode: d.categoryCode ?? '',
            pickupLocationCode: d.pickupLocationCode,
            pickedUnit: d.pickedUnit,
          }}
          open={dialog === 'reassign'}
          onOpenChange={close}
        />
      ) : null}
    </Page>
  );
}
