import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DetailList,
  Field,
  PageHeader,
  Textarea,
} from '@carrental/ui';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../../lib/api.js';
import { useAssignVehicle } from '../../lib/rental-hooks.js';
import {
  useCancelReservation,
  useNoShowReservation,
  useReservationDetail,
  useReservationHistory,
} from '../../lib/reservation-hooks.js';

/**
 * SCREEN-OPS-004 (detail) — a single reservation for staff: the booking window, drivers, charge
 * breakdown, and full history, plus the lifecycle actions an agent needs — assign a vehicle,
 * mark a no-show, cancel. Money-moving actions (cancel) go through a confirmation view, never a
 * bare toast (design §12.5). Every action's outcome (success or the exact API error) is shown
 * inline.
 */

const CANCEL_REASONS = [
  'customer_request',
  'no_show',
  'payment_failed',
  'duplicate',
  'goodwill',
  'other',
] as const;

const stateVariant = (s: string) =>
  s === 'confirmed'
    ? 'success'
    : s === 'cancelled' || s === 'fulfilled'
      ? 'neutral'
      : s === 'no_show'
        ? 'destructive'
        : 'warning';

export function ReservationDetailPage() {
  const { reference = '' } = useParams();
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const detail = useReservationDetail(reference);
  const history = useReservationHistory(reference);
  const assign = useAssignVehicle();
  const noShow = useNoShowReservation(reference);
  const cancel = useCancelReservation(reference);

  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmAssign, setConfirmAssign] = useState(false);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [noShowNote, setNoShowNote] = useState('');
  const [cancelReason, setCancelReason] =
    useState<(typeof CANCEL_REASONS)[number]>('customer_request');
  const [cancelNote, setCancelNote] = useState('');

  const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

  const money = (m: number, c: string) => fmt.money({ amountMinor: m, currency: c });

  if (detail.isLoading) {
    return <AppStateView kind="loading" title={t('state.loading.title')} />;
  }
  if (detail.isError || !detail.data) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <AppStateView
        kind={notFound ? 'empty' : 'failure'}
        title={notFound ? t('ops.resv.notFound') : t('state.failure.title')}
        description={notFound ? t('ops.resv.notFoundBody') : t('ops.resv.loadError')}
        primaryAction={
          notFound
            ? { label: t('ops.resv.backToQueue'), onClick: () => navigate('/work') }
            : { label: t('action.retry'), onClick: () => detail.refetch() }
        }
      />
    );
  }

  const d = detail.data;
  const canModify = hasPermission('reservation.modify');
  const canCancel = hasPermission('reservation.cancel', 'reservation.modify');
  const canAssign = hasPermission('rental.pickup', 'fleet.manage');
  const busy = assign.isPending || noShow.isPending || cancel.isPending;

  const runAssign = async () => {
    setResult(null);
    try {
      const rental = await assign.mutateAsync(reference);
      setResult({ ok: true, text: t('ops.queue.assignedTo', { rental: rental.reference }) });
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.queue.assignFail', { ref: reference })) });
    } finally {
      setConfirmAssign(false);
    }
  };
  const runNoShow = async () => {
    setResult(null);
    try {
      await noShow.mutateAsync({ note: noShowNote.trim() || undefined });
      setResult({ ok: true, text: t('ops.resv.noShowDone') });
      setNoShowNote('');
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.resv.actionFail')) });
    } finally {
      setConfirmNoShow(false);
    }
  };
  const runCancel = async () => {
    setResult(null);
    try {
      const res = await cancel.mutateAsync({
        reasonCode: cancelReason,
        note: cancelNote.trim() || undefined,
      });
      setResult({
        ok: true,
        text: t('ops.resv.cancelDone', {
          refund: money(res.refundMinor, d.currency),
          fee: money(res.feeMinor, d.currency),
        }),
      });
      setCancelNote('');
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.resv.actionFail')) });
    } finally {
      setConfirmCancel(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link to="/work" className="hover:underline">
            ← {t('ops.resv.backToQueue')}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="bidi-isolate font-mono">{d.reference}</span>
            <Badge variant={stateVariant(d.state)}>{d.state.replace(/_/g, ' ')}</Badge>
          </span>
        }
        description={
          d.assignedRentalRef ? (
            <Link
              to={`/rentals?ref=${encodeURIComponent(d.assignedRentalRef)}`}
              className="text-primary hover:underline"
            >
              {t('ops.queue.openRental')} → {d.assignedRentalRef}
            </Link>
          ) : (
            t('ops.resv.noRentalYet')
          )
        }
      />

      {result ? (
        <Alert variant={result.ok ? 'success' : 'destructive'} data-testid="ops-resv-result">
          <AlertTitle>{result.ok ? t('state.success.title') : t('state.failure.title')}</AlertTitle>
          <AlertDescription>{result.text}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.resv.summary')}</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { term: t('ops.resv.pickup'), detail: fmt.dateTime(d.pickupAt) },
                { term: t('ops.resv.return'), detail: fmt.dateTime(d.returnAt) },
                {
                  term: t('ops.resv.locations'),
                  detail:
                    d.pickupLocationCode === d.returnLocationCode
                      ? d.pickupLocationCode
                      : `${d.pickupLocationCode} → ${d.returnLocationCode}`,
                },
                { term: t('ops.tbl.category'), detail: d.categoryCode },
                { term: t('ops.tbl.channel'), detail: d.channel },
                {
                  term: t('ops.resv.duration'),
                  detail: t('ops.resv.hours', { n: d.durationHours }),
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.resv.charges')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label={t('ops.resv.subtotal')} value={money(d.subtotalMinor, d.currency)} />
            <Row label={t('ops.resv.tax')} value={money(d.taxMinor, d.currency)} />
            <Row label={t('ops.tbl.total')} value={money(d.totalMinor, d.currency)} strong />
            <Row label={t('ops.tbl.paid')} value={money(d.paidMinor, d.currency)} />
            {d.refundedMinor > 0 ? (
              <Row label={t('ops.resv.refunded')} value={money(d.refundedMinor, d.currency)} />
            ) : null}
            {d.paidMinor < d.totalMinor ? (
              <p className="pt-1 text-xs text-warning">
                {t('ops.resv.balanceDue', {
                  amount: money(d.totalMinor - d.paidMinor, d.currency),
                })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {d.lines.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.resv.lineItems')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {d.lines.map((l, i) => (
                <li key={`${l.code}-${i}`} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {l.label}
                    {l.quantity > 1 ? (
                      <span className="text-muted-foreground">
                        {' '}
                        × {l.quantity} @ {money(l.unitMinor, d.currency)}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">{money(l.amountMinor, d.currency)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.resv.drivers')}</CardTitle>
          </CardHeader>
          <CardContent>
            {d.drivers.length ? (
              <ul className="space-y-2 text-sm">
                {d.drivers.map((dr, i) => (
                  <li key={i} className="rounded-md border px-3 py-2">
                    <p className="font-medium">{dr.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {dr.role.replace(/_/g, ' ')}
                      {dr.email ? ` · ${dr.email}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('ops.resv.noDrivers')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.resv.history')}</CardTitle>
          </CardHeader>
          <CardContent>
            {history.isLoading ? (
              <AppStateView kind="loading" inline title={t('ops.st.loading')} />
            ) : !history.data?.length ? (
              <p className="text-sm text-muted-foreground">{t('ops.resv.noHistory')}</p>
            ) : (
              <ol className="space-y-3 text-sm" data-testid="ops-resv-history">
                {history.data.map((e, i) => (
                  <li key={i} className="border-s-2 ps-3">
                    <p className="font-medium capitalize">{e.type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt.dateTime(e.at)} · {e.actor}
                      {e.amountDeltaMinor ? ` · ${money(e.amountDeltaMinor, d.currency)}` : ''}
                    </p>
                    {e.note ? <p className="text-xs">{e.note}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('ops.resv.actions')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canAssign && d.state === 'confirmed' && !d.assignedRentalRef ? (
            <Button
              loading={assign.isPending}
              disabled={busy}
              onClick={() => setConfirmAssign(true)}
            >
              {t('ops.queue.assign')}
            </Button>
          ) : null}
          {canModify && d.state === 'confirmed' ? (
            <Button
              variant="outline"
              loading={noShow.isPending}
              disabled={busy}
              onClick={() => setConfirmNoShow(true)}
            >
              {t('ops.resv.markNoShow')}
            </Button>
          ) : null}
          {canCancel && d.cancellable ? (
            <Button
              variant="destructive"
              loading={cancel.isPending}
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              {t('ops.resv.cancel')}
            </Button>
          ) : null}
          {!(
            (canAssign && d.state === 'confirmed' && !d.assignedRentalRef) ||
            (canModify && d.state === 'confirmed') ||
            (canCancel && d.cancellable)
          ) ? (
            <p className="text-sm text-muted-foreground">{t('ops.resv.noActions')}</p>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmAssign}
        onOpenChange={setConfirmAssign}
        title={t('ops.resv.assignTitle')}
        description={t('ops.resv.assignBody', { ref: d.reference })}
        confirmLabel={t('ops.queue.assign')}
        onConfirm={runAssign}
      />

      <ConfirmDialog
        open={confirmNoShow}
        onOpenChange={setConfirmNoShow}
        destructive
        title={t('ops.resv.noShowTitle')}
        description={
          <div className="space-y-3">
            <p>{t('ops.resv.noShowBody')}</p>
            <Field label={t('ops.resv.noteOptional')} htmlFor="ns-note">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={noShowNote}
                  onChange={(e) => setNoShowNote(e.target.value)}
                />
              )}
            </Field>
          </div>
        }
        confirmLabel={t('ops.resv.markNoShow')}
        onConfirm={runNoShow}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        destructive
        title={t('ops.resv.cancelTitle')}
        description={
          <div className="space-y-3">
            <p>{t('ops.resv.cancelBody')}</p>
            <Field label={t('ops.resv.reason')} htmlFor="cn-reason">
              {({ id }) => (
                <select
                  id={id}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={cancelReason}
                  onChange={(e) =>
                    setCancelReason(e.target.value as (typeof CANCEL_REASONS)[number])
                  }
                >
                  {CANCEL_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('ops.resv.noteOptional')} htmlFor="cn-note">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                />
              )}
            </Field>
            <p className="text-xs text-muted-foreground">{t('ops.resv.cancelFeeNote')}</p>
          </div>
        }
        confirmLabel={t('ops.resv.cancel')}
        onConfirm={runCancel}
      />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? 'font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
