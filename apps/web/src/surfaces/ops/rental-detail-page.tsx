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
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@carrental/ui';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../../lib/api.js';
import { useOpsUnits } from '../../lib/ops-discovery-hooks.js';
import {
  useAssignVehicle,
  useExtendRental,
  useOpsRentalDetail,
  useRaiseIncident,
  useReadiness,
} from '../../lib/rental-hooks.js';

const INCIDENT_CATEGORIES = ['breakdown', 'accident', 'damage', 'other'] as const;

/**
 * SCREEN-OPS-016 (detail) — one rental for staff: the booking window, the vehicle, odometer /
 * fuel at pickup and return, the agreement, the settlement, inspection findings, and the full
 * history. Plus the actions the board doesn't have room for — extend the hire (re-prices and
 * charges the delta, so it's a confirmation view) and run the readiness check with a pass OR a
 * "send to maintenance" outcome.
 */

const stateBadge = (s: string, overdue: boolean) =>
  overdue || s === 'overdue'
    ? 'destructive'
    : s === 'active'
      ? 'success'
      : s === 'closed'
        ? 'neutral'
        : 'warning';

export function RentalDetailPage() {
  const { reference = '' } = useParams();
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const detail = useOpsRentalDetail(reference);
  const extend = useExtendRental(reference);
  const readiness = useReadiness(reference);
  const reassign = useAssignVehicle();
  const incident = useRaiseIncident(reference);

  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [newReturn, setNewReturn] = useState('');
  const [confirmExtend, setConfirmExtend] = useState(false);
  const [confirmReady, setConfirmReady] = useState<null | boolean>(null);
  const [confirmReassign, setConfirmReassign] = useState(false);
  const [reassignUnitId, setReassignUnitId] = useState('');
  const [confirmIncident, setConfirmIncident] = useState(false);
  const [incCategory, setIncCategory] = useState<(typeof INCIDENT_CATEGORIES)[number]>('breakdown');
  const [incNote, setIncNote] = useState('');
  const [incReplacement, setIncReplacement] = useState('');

  const canReassign =
    hasPermission('rental.pickup', 'fleet.manage') && detail.data?.state === 'awaiting_pickup';
  const canIncident =
    hasPermission('rental.pickup', 'rental.return') &&
    ['active', 'overdue'].includes(detail.data?.state ?? '');
  const candidateUnits = useOpsUnits(
    {
      categoryCode: detail.data?.categoryCode ?? undefined,
      locationCode: detail.data?.pickupLocationCode,
      state: 'available',
    },
    { enabled: canReassign && confirmReassign },
  );
  // a replacement must be a same-category available unit at this location — the API rejects a
  // category mismatch — so only offer those, same as the rental board's incident dialog.
  const spares = useOpsUnits(
    {
      categoryCode: detail.data?.categoryCode ?? undefined,
      locationCode: detail.data?.pickupLocationCode,
      state: 'available',
    },
    { enabled: canIncident && confirmIncident },
  );

  const money = (m: number, c: string) => fmt.money({ amountMinor: m, currency: c });
  const errText = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);

  if (detail.isLoading) return <AppStateView kind="loading" title={t('state.loading.title')} />;
  if (detail.isError || !detail.data) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <AppStateView
        kind={notFound ? 'empty' : 'failure'}
        title={notFound ? t('ops.rentd.notFound') : t('state.failure.title')}
        description={notFound ? t('ops.rentd.notFoundBody') : t('ops.rentd.loadError')}
        primaryAction={
          notFound
            ? { label: t('ops.rentd.back'), onClick: () => navigate('/rentals') }
            : { label: t('action.retry'), onClick: () => detail.refetch() }
        }
      />
    );
  }

  const d = detail.data;
  const now = Date.now();
  const overdue =
    d.state === 'overdue' ||
    (d.state === 'active' && new Date(d.scheduledReturnAt).getTime() < now);
  const canExtend = hasPermission('rental.pickup', 'rental.return');
  const canReady = hasPermission('rental.pickup', 'rental.return', 'fleet.manage');
  const extendable = ['active', 'overdue'].includes(d.state);

  const runExtend = async () => {
    setResult(null);
    try {
      const res = await extend.mutateAsync({ newReturnAt: new Date(newReturn).toISOString() });
      setResult({
        ok: true,
        text: t('ops.rentd.extended', { delta: money(res.deltaMinor, d.currency) }),
      });
      setNewReturn('');
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.rentd.actionFail')) });
    } finally {
      setConfirmExtend(false);
    }
  };
  const runReady = async (passed: boolean) => {
    setResult(null);
    try {
      await readiness.mutateAsync(passed);
      setResult({ ok: true, text: passed ? t('ops.rentd.readyPass') : t('ops.rentd.readyFail') });
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.rentd.actionFail')) });
    } finally {
      setConfirmReady(null);
    }
  };
  const runReassign = async () => {
    setResult(null);
    try {
      await reassign.mutateAsync({ reference: d.reservationReference, unitId: reassignUnitId });
      setResult({ ok: true, text: t('ops.rentd.reassigned') });
      setReassignUnitId('');
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.rentd.actionFail')) });
    } finally {
      setConfirmReassign(false);
    }
  };
  const runIncident = async () => {
    setResult(null);
    try {
      await incident.mutateAsync({
        category: incCategory,
        note: incNote.trim() || undefined,
        replacementUnitId: incReplacement || undefined,
      });
      setResult({
        ok: true,
        text: incReplacement
          ? t('ops.rent.incidentSwapped', { ref: d.reference })
          : t('ops.rent.incidentLogged', { ref: d.reference }),
      });
      setIncNote('');
      setIncReplacement('');
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.rent.incidentFail')) });
    } finally {
      setConfirmIncident(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link to="/rentals" className="hover:underline">
            ← {t('ops.rentd.back')}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="bidi-isolate font-mono">{d.reference}</span>
            <Badge variant={stateBadge(d.state, overdue)}>
              {t(`ops.rent.stateLabel.${overdue ? 'overdue' : d.state}`)}
            </Badge>
          </span>
        }
        description={
          <Link
            to={`/work/${encodeURIComponent(d.reservationReference)}`}
            className="text-primary hover:underline"
          >
            {t('ops.rentd.fromReservation', { ref: d.reservationReference })}
          </Link>
        }
      />

      {result ? (
        <Alert variant={result.ok ? 'success' : 'destructive'} data-testid="ops-rentd-result">
          <AlertTitle>{result.ok ? t('state.success.title') : t('state.failure.title')}</AlertTitle>
          <AlertDescription>{result.text}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.rentd.rental')}</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                {
                  term: t('ops.rentd.vehicle'),
                  detail: (
                    <span>
                      {d.vehicle ?? t('ops.rent.noVehicle')}
                      {d.plate ? (
                        <span className="bidi-isolate ms-2 font-mono text-xs text-muted-foreground">
                          {d.plate}
                        </span>
                      ) : null}
                    </span>
                  ),
                },
                { term: t('ops.rentd.customer'), detail: d.customerName ?? '—' },
                { term: t('ops.search.driver'), detail: d.driverName ?? '—' },
                {
                  term: t('ops.rentd.window'),
                  detail: `${fmt.dateTime(d.scheduledPickupAt)} – ${fmt.dateTime(d.scheduledReturnAt)}`,
                },
                {
                  term: t('ops.resv.locations'),
                  detail:
                    d.pickupLocationCode === d.returnLocationCode
                      ? d.pickupLocationCode
                      : `${d.pickupLocationCode} → ${d.returnLocationCode}`,
                },
                {
                  term: t('ops.rentd.pickedUp'),
                  detail: d.pickedUpAt ? fmt.dateTime(d.pickedUpAt) : t('ops.rentd.notYet'),
                },
                {
                  term: t('ops.rentd.returned'),
                  detail: d.returnedAt ? fmt.dateTime(d.returnedAt) : t('ops.rentd.notYet'),
                },
                {
                  term: t('ops.rentd.odometer'),
                  detail:
                    d.odometerOutKm != null
                      ? `${d.odometerOutKm} → ${d.odometerInKm ?? '—'} km`
                      : '—',
                },
                {
                  term: t('ops.rentd.fuel'),
                  detail: d.fuelOutPct != null ? `${d.fuelOutPct}% → ${d.fuelInPct ?? '—'}%` : '—',
                },
                {
                  term: t('ops.rentd.agreement'),
                  detail: d.agreementVersion
                    ? t('ops.rentd.agreementV', { v: d.agreementVersion })
                    : t('ops.rentd.noAgreement'),
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.rentd.settlement')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center justify-between font-semibold">
              <span>{t('ops.rentd.total')}</span>
              <span className="tabular-nums">{money(d.settlementMinor, d.currency)}</span>
            </div>
            {d.findings.length ? (
              <ul className="mt-2 space-y-1 border-t pt-2">
                {d.findings.map((f, i) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span>
                      <span className="font-medium">{f.area}</span>
                      <span className="text-muted-foreground"> · {f.severity}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">{f.description}</span>
                    </span>
                    <span className="tabular-nums">{money(f.chargeMinor, d.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pt-1 text-xs text-muted-foreground">{t('ops.rentd.noFindings')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('ops.resv.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!d.history?.length ? (
            <p className="text-sm text-muted-foreground">{t('ops.resv.noHistory')}</p>
          ) : (
            <ol className="space-y-3 text-sm" data-testid="ops-rentd-history">
              {d.history.map((e, i) => (
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('ops.resv.actions')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canExtend && extendable ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('ops.rentd.newReturn')} htmlFor="rentd-newreturn" required>
                {({ id }) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={newReturn}
                    min={d.scheduledReturnAt.slice(0, 16)}
                    onChange={(e) => setNewReturn(e.target.value)}
                    className="max-w-[16rem]"
                  />
                )}
              </Field>
              <Button
                disabled={!newReturn || new Date(newReturn) <= new Date(d.scheduledReturnAt)}
                loading={extend.isPending}
                onClick={() => setConfirmExtend(true)}
              >
                {t('ops.rentd.extend')}
              </Button>
            </div>
          ) : null}

          {canReady && d.state === 'closed' ? (
            d.readinessOutcome ? (
              <Badge
                variant={d.readinessOutcome === 'passed' ? 'success' : 'warning'}
                data-testid="readiness-outcome"
              >
                {d.readinessOutcome === 'passed'
                  ? t('ops.rent.readyOutcomePassed')
                  : t('ops.rent.readyOutcomeFailed')}
              </Badge>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  loading={readiness.isPending}
                  onClick={() => setConfirmReady(true)}
                >
                  {t('ops.rentd.readyPassBtn')}
                </Button>
                <Button
                  variant="destructive"
                  loading={readiness.isPending}
                  onClick={() => setConfirmReady(false)}
                >
                  {t('ops.rentd.readyFailBtn')}
                </Button>
              </div>
            )
          ) : null}

          {canReassign ? (
            <Button
              variant="outline"
              loading={reassign.isPending}
              onClick={() => {
                setReassignUnitId('');
                setConfirmReassign(true);
              }}
              data-testid="rentd-reassign-open"
            >
              {t('ops.rentd.reassign')}
            </Button>
          ) : null}

          {canIncident ? (
            <Button
              variant="ghost"
              loading={incident.isPending}
              onClick={() => setConfirmIncident(true)}
              data-testid="rentd-incident-open"
            >
              {t('ops.rent.reportIncident')}
            </Button>
          ) : null}

          {!(canExtend && extendable) &&
          !(canReady && d.state === 'closed') &&
          !canReassign &&
          !canIncident ? (
            <p className="text-sm text-muted-foreground">{t('ops.resv.noActions')}</p>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmReassign}
        onOpenChange={(v) => {
          setConfirmReassign(v);
          if (!v) setReassignUnitId('');
        }}
        title={t('ops.rentd.reassignTitle')}
        description={
          <div className="space-y-3">
            <p>{t('ops.rentd.reassignBody')}</p>
            {d.pickedUnit ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="rentd-reassign-customer-pick"
              >
                {t('ops.resv.customerPicked', {
                  car: [d.pickedUnit.make, d.pickedUnit.model].filter(Boolean).join(' '),
                  plate: d.pickedUnit.plate,
                })}
              </p>
            ) : null}
            <Field
              label={t('ops.resv.assignUnit')}
              htmlFor="rentd-reassign-unit"
              hint={t('ops.resv.assignUnitHint')}
            >
              {({ id }) => (
                <Select
                  id={id}
                  value={reassignUnitId}
                  onChange={(e) => setReassignUnitId(e.target.value)}
                  data-testid="rentd-reassign-select"
                >
                  <option value="">{t('ops.resv.assignAuto')}</option>
                  {(candidateUnits.data?.results ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.plate} — {[u.year, u.make, u.model].filter(Boolean).join(' ') || u.vin}
                      {u.id === d.pickedUnit?.id ? ` (${t('ops.resv.customerPickedBadge')})` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        }
        confirmLabel={t('ops.rentd.reassign')}
        onConfirm={runReassign}
      />

      <ConfirmDialog
        open={confirmIncident}
        onOpenChange={(v) => {
          setConfirmIncident(v);
          if (!v) {
            setIncNote('');
            setIncReplacement('');
          }
        }}
        destructive
        title={t('ops.rent.incidentTitle')}
        description={
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('ops.rent.incidentCategory')} htmlFor="rentd-inc-cat">
                {({ id }) => (
                  <Select
                    id={id}
                    value={incCategory}
                    onChange={(e) =>
                      setIncCategory(e.target.value as (typeof INCIDENT_CATEGORIES)[number])
                    }
                    data-testid="rentd-incident-category"
                  >
                    {INCIDENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`ops.rent.incidentCat.${c}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('ops.rent.incidentReplacement')} htmlFor="rentd-inc-rep">
                {({ id }) => (
                  <Select
                    id={id}
                    value={incReplacement}
                    onChange={(e) => setIncReplacement(e.target.value)}
                    data-testid="rentd-incident-replacement"
                  >
                    <option value="">{t('ops.rent.incidentNoReplacement')}</option>
                    {(spares.data?.results ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.plate} — {[u.year, u.make, u.model].filter(Boolean).join(' ') || u.vin}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label={t('ops.rent.incidentNote')} htmlFor="rentd-inc-note">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={incNote}
                  onChange={(e) => setIncNote(e.target.value)}
                />
              )}
            </Field>
          </div>
        }
        confirmLabel={t('ops.rent.incidentSubmit')}
        onConfirm={runIncident}
      />

      <ConfirmDialog
        open={confirmExtend}
        onOpenChange={setConfirmExtend}
        title={t('ops.rentd.extendTitle')}
        description={t('ops.rentd.extendBody')}
        confirmLabel={t('ops.rentd.extend')}
        onConfirm={runExtend}
      />
      <ConfirmDialog
        open={confirmReady !== null}
        onOpenChange={(v) => !v && setConfirmReady(null)}
        destructive={confirmReady === false}
        title={
          confirmReady === false ? t('ops.rentd.readyFailTitle') : t('ops.rentd.readyPassTitle')
        }
        description={
          confirmReady === false ? t('ops.rentd.readyFailBody') : t('ops.rentd.readyPassBody')
        }
        confirmLabel={
          confirmReady === false ? t('ops.rentd.readyFailBtn') : t('ops.rentd.readyPassBtn')
        }
        onConfirm={() => runReady(confirmReady === true)}
      />
    </div>
  );
}
