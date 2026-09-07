'use client';

import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Field,
  Input,
} from '@carrental/ui';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { RequireAuth } from '../../../../components/require-auth';
import { ApiError } from '../../../../lib/api-client';
import {
  formatMinor,
  useCancelReservation,
  useExtendRental,
  useModifyReservation,
  useMyRental,
  useReservationDetail,
  useReservationHistory,
} from '../../../../lib/customer-hooks';
import { useLocale } from '../../../../lib/nav';

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

  const [showCancel, setShowCancel] = useState(false);
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
        paymentToken: 'tok_ok',
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
        paymentToken: 'tok_ok',
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
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        type="button"
        onClick={() => router.push(`/${locale}/trips`)}
        className="text-sm text-primary underline underline-offset-4"
      >
        ← {t('reservation.allTrips')}
      </button>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
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
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            {r.categoryCode} · {r.pickupLocationCode} → {r.returnLocationCode}
          </p>
          <p className="text-muted-foreground">
            {dt(r.pickupAt)} – {dt(r.returnAt)} (
            {t('reservation.hours', { hours: r.durationHours })})
          </p>
          <table className="w-full" data-testid="res-lines">
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.code} className="border-b last:border-0">
                  <td className="py-1.5">{l.label}</td>
                  <td className="py-1.5 text-end">
                    {formatMinor(l.amountMinor, r.currency, uiLocale)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2">{t('reservation.total')}</td>
                <td className="py-2 text-end" data-testid="res-total">
                  {formatMinor(r.totalMinor, r.currency, uiLocale)}
                </td>
              </tr>
              {r.refundedMinor > 0 ? (
                <tr className="text-muted-foreground">
                  <td className="py-1">{t('reservation.refunded')}</td>
                  <td className="py-1 text-end" data-testid="res-refunded">
                    −{formatMinor(r.refundedMinor, r.currency, uiLocale)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            {t('reservation.drivers', {
              names: r.drivers.map((d) => d.fullName).join(', ') || '—',
            })}
          </p>
        </CardContent>
      </Card>

      {rental.data && ['active', 'overdue'].includes(rental.data.state) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {t('reservation.rentalIs', { state: stateLabel(rental.data.state) })}
              <Badge variant={rental.data.state === 'active' ? 'success' : 'warning'}>
                {rental.data.reference}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
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
              <p className="text-sm" data-testid="rental-extend-msg">
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
          </CardContent>
        </Card>
      ) : null}

      {r.modifiable ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('reservation.changeReturn')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
              <p className="text-sm" data-testid="res-modify-msg">
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
          </CardContent>
        </Card>
      ) : null}

      {r.cancellable ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p className="text-sm text-muted-foreground">{t('reservation.cancelPolicy')}</p>
            <Button variant="outline" onClick={() => setShowCancel(true)} data-testid="res-cancel">
              {t('reservation.cancelReservation')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reservation.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <AppStateView kind="loading" inline title={t('state.loading.title')} />
          ) : !history.data?.length ? (
            <AppStateView kind="empty" inline title={t('reservation.noChanges')} />
          ) : (
            <ol className="space-y-2 text-sm" data-testid="res-history">
              {history.data.map((e, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium capitalize">{e.type.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-muted-foreground">
                    {dt(e.at)} · {e.actor}
                    {e.amountDeltaMinor
                      ? ` · ${e.amountDeltaMinor > 0 ? '+' : ''}${formatMinor(e.amountDeltaMinor, r.currency, uiLocale)}`
                      : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        title={t('reservation.cancelConfirmTitle')}
        description={t('reservation.cancelConfirmBody')}
        confirmLabel={t('reservation.cancelReservation')}
        destructive
        onConfirm={() => cancel.mutate({ reasonCode: 'plans_changed' })}
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
