'use client';

import { ApiError } from '@carrental/client';
import { useI18n } from '@carrental/i18n/react';
import { AppStateView, Badge, Button, ConfirmDialog, Field, Input } from '@carrental/ui';
import { ArrowLeft, CalendarClock, History, KeyRound, Receipt } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { LookupSelect } from '../../../../components/lookup-select';
import { RequireAuth } from '../../../../components/require-auth';
import {
  formatMinor,
  usePaymentMode,
  useCancelReservation,
  useExtendRental,
  useModifyReservation,
  useMyRental,
  useReservationDetail,
  useReservationHistory,
} from '../../../../lib/customer-hooks';
import { useLocale } from '../../../../lib/nav';

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="surface-card rounded-2xl p-5 sm:p-6">
      <h2 className="mb-4 flex flex-wrap items-center gap-2.5 text-lg font-semibold text-ink">
        <span className="icon-chip size-9 rounded-lg" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** SCREEN-CUS-015/016/019 — reservation detail: itinerary, price, cancel, modify, history. */
function ReservationDetail() {
  const { t, locale: uiLocale } = useI18n();
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const reference =
    (Array.isArray(params.reference) ? params.reference[0] : params.reference) ?? '';

  const detail = useReservationDetail(reference);
  const history = useReservationHistory(reference);
  const cancel = useCancelReservation(reference);
  const modify = useModifyReservation(reference);
  const rental = useMyRental(reference);
  const extend = useExtendRental(rental.data?.reference ?? '');
  const paymentMode = usePaymentMode();
  // Under a real Stripe mode, omit the token entirely: PaymentService automatically reuses the
  // reservation's saved payment method from the original booking charge (STAGE-003) — no card
  // re-entry needed for an extend/modify. The simulator has no such saved-method concept, so it
  // keeps using its fixed always-approves test token exactly as before.
  const simulatorToken = !paymentMode.data || paymentMode.data.driver === 'simulator';

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [newReturn, setNewReturn] = useState('');
  const [modifyMsg, setModifyMsg] = useState<string | null>(null);
  const [extendReturn, setExtendReturn] = useState('');
  const [extendMsg, setExtendMsg] = useState<string | null>(null);

  const dt = (iso: string) => new Date(iso).toLocaleString(uiLocale);
  const stateLabel = (s: string) => {
    const key = `reservation.state.${s}`;
    const v = t(key);
    return v === key ? s.replace(/_/g, ' ') : v;
  };

  async function doExtend() {
    setExtendMsg(null);
    try {
      const res = await extend.mutateAsync({
        newReturnAt: new Date(extendReturn).toISOString(),
        paymentToken: simulatorToken ? 'tok_ok' : undefined,
      });
      setExtendMsg(
        t('reservation.extendOk', { amount: formatMinor(res.deltaMinor, res.currency, uiLocale) }),
      );
      setExtendReturn('');
    } catch (e) {
      setExtendMsg(e instanceof ApiError ? e.message : t('reservation.extendErr'));
    }
  }

  async function doModify() {
    setModifyMsg(null);
    try {
      const res = await modify.mutateAsync({
        returnAt: new Date(newReturn).toISOString(),
        paymentToken: simulatorToken ? 'tok_ok' : undefined,
      });
      setModifyMsg(
        res.deltaMinor >= 0
          ? t('reservation.modifyChargedExtra', {
              amount: formatMinor(res.deltaMinor, res.currency, uiLocale),
            })
          : t('reservation.modifyRefunded', {
              amount: formatMinor(-res.deltaMinor, res.currency, uiLocale),
            }),
      );
      setNewReturn('');
    } catch (e) {
      setModifyMsg(e instanceof ApiError ? e.message : t('reservation.modifyErr'));
    }
  }

  const r = detail.data;

  if (detail.isLoading) return <AppStateView kind="loading" title={t('state.loading.title')} />;
  if (detail.isError || !r) {
    return (
      <AppStateView
        kind="failure"
        title={t('reservation.loadError')}
        primaryAction={{
          label: t('reservation.backToTrips'),
          onClick: () => router.push(`/${locale}/trips`),
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button
        type="button"
        onClick={() => router.push(`/${locale}/trips`)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline underline-offset-4"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t('reservation.allTrips')}
      </button>

      <Section
        icon={<Receipt className="size-4" />}
        title={
          <>
            <span className="bidi-isolate font-mono">{r.reference}</span>
            <Badge
              variant={
                r.state === 'confirmed'
                  ? 'success'
                  : r.state === 'cancelled'
                    ? 'neutral'
                    : 'warning'
              }
              data-testid="res-state"
            >
              {stateLabel(r.state)}
            </Badge>
          </>
        }
      >
        <div className="space-y-1 text-sm">
          <p className="font-medium text-ink">
            {r.categoryCode} · {r.pickupLocationCode} → {r.returnLocationCode}
          </p>
          <p className="text-ink-muted">
            {dt(r.pickupAt)} – {dt(r.returnAt)} (
            {t('reservation.hours', { hours: r.durationHours })})
          </p>
          {r.pickedUnit ? (
            <p className="text-ink-muted" data-testid="res-picked-unit">
              {t('checkout.yourCar', {
                car: [r.pickedUnit.make, r.pickedUnit.model].filter(Boolean).join(' '),
              })}
            </p>
          ) : null}
        </div>

        <dl
          className="mt-4 space-y-2 border-t border-hairline pt-4 text-sm"
          data-testid="res-lines"
        >
          {r.lines.map((l) => (
            <div key={l.code} className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">{l.label}</dt>
              <dd className="text-ink">{formatMinor(l.amountMinor, r.currency, uiLocale)}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2 text-base font-bold text-ink">
            <dt>{t('reservation.total')}</dt>
            <dd data-testid="res-total">{formatMinor(r.totalMinor, r.currency, uiLocale)}</dd>
          </div>
          {r.refundedMinor > 0 ? (
            <div className="flex items-center justify-between gap-3 text-ink-muted">
              <dt>{t('reservation.refunded')}</dt>
              <dd data-testid="res-refunded">
                −{formatMinor(r.refundedMinor, r.currency, uiLocale)}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-4 text-xs text-ink-muted">
          {t('reservation.drivers', {
            names: r.drivers.map((d) => d.fullName).join(', ') || '—',
          })}
        </p>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => router.push(`/${locale}/trips/${reference}/receipt`)}
            className="text-sm font-medium text-brand hover:underline underline-offset-4"
            data-testid="view-receipt"
          >
            {t('reservation.viewReceipt')}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/${locale}/trips/${reference}/invoice`)}
            className="text-sm font-medium text-brand hover:underline underline-offset-4"
            data-testid="view-invoice"
          >
            {t('reservation.viewInvoice')}
          </button>
        </div>
      </Section>

      {rental.data && ['active', 'overdue'].includes(rental.data.state) ? (
        <Section
          icon={<KeyRound className="size-4" />}
          title={
            <>
              {t('reservation.rentalIs', { state: stateLabel(rental.data.state) })}
              <Badge variant={rental.data.state === 'active' ? 'success' : 'warning'}>
                {rental.data.reference}
              </Badge>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              {t('reservation.dueBack', { datetime: dt(rental.data.scheduledReturnAt) })}
            </p>
            <Field label={t('reservation.extendTo')} htmlFor="rental-extend-to">
              {({ id }) => (
                <Input
                  id={id}
                  type="datetime-local"
                  value={extendReturn}
                  onChange={(e) => setExtendReturn(e.target.value)}
                  data-testid="rental-extend-to"
                />
              )}
            </Field>
            {extendMsg ? (
              <p className="text-sm text-ink" data-testid="rental-extend-msg">
                {extendMsg}
              </p>
            ) : null}
            <Button
              onClick={doExtend}
              loading={extend.isPending}
              disabled={!extendReturn}
              data-testid="rental-extend"
            >
              {t('reservation.extendRental')}
            </Button>
          </div>
        </Section>
      ) : null}

      {r.modifiable ? (
        <Section icon={<CalendarClock className="size-4" />} title={t('reservation.changeReturn')}>
          <div className="space-y-3">
            <Field label={t('reservation.newReturn')} htmlFor="res-new-return">
              {({ id }) => (
                <Input
                  id={id}
                  type="datetime-local"
                  value={newReturn}
                  onChange={(e) => setNewReturn(e.target.value)}
                  data-testid="res-new-return"
                />
              )}
            </Field>
            {modifyMsg ? (
              <p className="text-sm text-ink" data-testid="res-modify-msg">
                {modifyMsg}
              </p>
            ) : null}
            <Button
              onClick={doModify}
              loading={modify.isPending}
              disabled={!newReturn}
              data-testid="res-modify"
            >
              {t('reservation.updateReservation')}
            </Button>
          </div>
        </Section>
      ) : null}

      {r.cancellable ? (
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5 sm:p-6">
          <p className="text-sm text-ink-muted">{t('reservation.cancelPolicy')}</p>
          <Button variant="outline" onClick={() => setShowCancel(true)} data-testid="res-cancel">
            {t('reservation.cancelReservation')}
          </Button>
        </div>
      ) : null}

      <Section icon={<History className="size-4" />} title={t('reservation.history')}>
        {history.isLoading ? (
          <AppStateView kind="loading" inline title={t('state.loading.title')} />
        ) : !history.data?.length ? (
          <AppStateView kind="empty" inline title={t('reservation.noChanges')} />
        ) : (
          <ol className="space-y-3 text-sm" data-testid="res-history">
            {history.data.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium capitalize text-ink">{e.type.replace(/_/g, ' ')}</span>
                <span className="text-xs text-ink-muted">
                  {dt(e.at)} · {e.actor}
                  {e.amountDeltaMinor
                    ? ` · ${e.amountDeltaMinor > 0 ? '+' : ''}${formatMinor(e.amountDeltaMinor, r.currency, uiLocale)}`
                    : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <ConfirmDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        title={t('reservation.cancelConfirmTitle')}
        description={
          <div className="space-y-3">
            <p>{t('reservation.cancelConfirmBody')}</p>
            <Field label={t('reservation.cancelReasonLabel')} htmlFor="cancel-reason" required>
              {({ id, describedBy, invalid }) => (
                <LookupSelect
                  typeCode="cancel_reason"
                  id={id}
                  describedBy={describedBy}
                  invalid={invalid}
                  value={cancelReason}
                  onChange={setCancelReason}
                />
              )}
            </Field>
          </div>
        }
        confirmLabel={t('reservation.cancelReservation')}
        destructive
        confirmDisabled={!cancelReason}
        onConfirm={async () => {
          if (!cancelReason) throw new Error('reason required');
          await cancel.mutateAsync({ reasonCode: cancelReason });
        }}
      />
    </div>
  );
}

export default function ReservationDetailPage() {
  return (
    <RequireAuth>
      <ReservationDetail />
    </RequireAuth>
  );
}
