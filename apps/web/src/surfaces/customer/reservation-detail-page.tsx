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
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../../lib/api.js';
import { formatMinor } from '../../lib/discovery-hooks.js';
import {
  useCancelReservation,
  useModifyReservation,
  useReservationDetail,
  useReservationHistory,
} from '../../lib/reservation-hooks.js';

/**
 * SCREEN-CUS-014/015/016/019 — reservation detail: itinerary, drivers, price, cancel (with the
 * refund shown), modify (new return date → re-quote → confirm the delta), and the change history.
 */
export function ReservationDetailPage() {
  const { reference = '' } = useParams();
  const navigate = useNavigate();
  const detail = useReservationDetail(reference);
  const history = useReservationHistory(reference);
  const cancel = useCancelReservation(reference);
  const modify = useModifyReservation(reference);

  const [showCancel, setShowCancel] = useState(false);
  const [newReturn, setNewReturn] = useState('');
  const [modifyMsg, setModifyMsg] = useState<string | null>(null);

  const r = detail.data;

  async function doModify() {
    setModifyMsg(null);
    try {
      const res = await modify.mutateAsync({
        returnAt: new Date(newReturn).toISOString(),
        paymentToken: 'tok_ok',
      });
      setModifyMsg(
        res.deltaMinor >= 0
          ? `Updated — an extra ${formatMinor(res.deltaMinor, res.currency)} was charged.`
          : `Updated — ${formatMinor(-res.deltaMinor, res.currency)} was refunded.`,
      );
      setNewReturn('');
    } catch (e) {
      setModifyMsg(e instanceof ApiError ? e.message : 'That change is not available.');
    }
  }

  if (detail.isLoading) return <AppStateView kind="loading" title="Loading…" />;
  if (detail.isError || !r) {
    return (
      <AppStateView
        kind="failure"
        title="Couldn't load that reservation"
        primaryAction={{ label: 'Back to trips', onClick: () => navigate('/trips') }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        type="button"
        onClick={() => navigate('/trips')}
        className="text-sm text-primary hover:underline"
      >
        ← All trips
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
              {r.state}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            {r.categoryCode} · {r.pickupLocationCode} → {r.returnLocationCode}
          </p>
          <p className="text-muted-foreground">
            {new Date(r.pickupAt).toLocaleString()} – {new Date(r.returnAt).toLocaleString()} (
            {r.durationHours} h)
          </p>
          <table className="w-full" data-testid="res-lines">
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.code} className="border-b last:border-0">
                  <td className="py-1.5">{l.label}</td>
                  <td className="py-1.5 text-end">{formatMinor(l.amountMinor, r.currency)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-end" data-testid="res-total">
                  {formatMinor(r.totalMinor, r.currency)}
                </td>
              </tr>
              {r.refundedMinor > 0 ? (
                <tr className="text-muted-foreground">
                  <td className="py-1">Refunded</td>
                  <td className="py-1 text-end" data-testid="res-refunded">
                    −{formatMinor(r.refundedMinor, r.currency)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            Drivers: {r.drivers.map((d) => d.fullName).join(', ') || '—'}
          </p>
        </CardContent>
      </Card>

      {r.modifiable ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change return date</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="New return date & time" htmlFor="res-new-return">
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
              Update reservation
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {r.cancellable ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p className="text-sm text-muted-foreground">
              Cancelling more than 48 hours before pickup is free; later cancellations keep a 20%
              fee.
            </p>
            <Button variant="outline" onClick={() => setShowCancel(true)} data-testid="res-cancel">
              Cancel reservation
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <AppStateView kind="loading" inline title="Loading…" />
          ) : !history.data?.length ? (
            <AppStateView kind="empty" inline title="No changes yet" />
          ) : (
            <ol className="space-y-2 text-sm" data-testid="res-history">
              {history.data.map((e, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium capitalize">{e.type.replace('_', ' ')}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.at).toLocaleString()} · {e.actor}
                    {e.amountDeltaMinor
                      ? ` · ${e.amountDeltaMinor > 0 ? '+' : ''}${formatMinor(e.amountDeltaMinor, r.currency)}`
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
        title="Cancel this reservation?"
        description="You'll see the refund on the reservation once it's processed. This cannot be undone."
        confirmLabel="Cancel reservation"
        destructive
        onConfirm={() => cancel.mutate({ reasonCode: 'plans_changed' })}
      />
    </div>
  );
}
