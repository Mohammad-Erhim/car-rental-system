import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Textarea,
} from '@carrental/ui';
import { useState } from 'react';

import { ApiError } from '../../lib/api.js';
import { formatMinor } from '../../lib/discovery-hooks.js';
import { useOpsUnits } from '../../lib/ops-discovery-hooks.js';
import {
  usePickup,
  useRaiseIncident,
  useReadiness,
  useReturnRental,
  useOpsRentals,
  type Rental,
} from '../../lib/rental-hooks.js';

const INCIDENT_CATEGORIES = ['breakdown', 'accident', 'damage', 'other'] as const;

/**
 * SCREEN-OPS-009/012/016 — rental board. Pickup a rental that's awaiting pickup (agreement +
 * odometer/fuel out), return an active one (odometer/fuel in → fuel/damage settlement), and run
 * the readiness check so the unit becomes bookable again.
 */
export function RentalBoardPage() {
  const { t } = useI18n();
  const rentals = useOpsRentals({});
  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.rent.title')} description={t('ops.rent.subtitle')} />

      {rentals.isLoading ? (
        <AppStateView kind="loading" inline title={t('ops.st.loading')} />
      ) : rentals.isError ? (
        <AppStateView
          kind="failure"
          inline
          title={t('ops.rent.loadFail')}
          primaryAction={{ label: t('ops.st.retry'), onClick: () => rentals.refetch() }}
        />
      ) : !rentals.data?.length ? (
        <AppStateView
          kind="empty"
          title={t('ops.rent.empty')}
          description={t('ops.rent.emptyBody')}
        />
      ) : (
        <ul className="space-y-3" data-testid="rental-list">
          {rentals.data.map((r) => (
            <li key={r.reference}>
              <RentalRow rental={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RentalRow({ rental: r }: { rental: Rental }) {
  const { t } = useI18n();
  const pickup = usePickup(r.reference);
  const ret = useReturnRental(r.reference);
  const readiness = useReadiness(r.reference);
  const incident = useRaiseIncident(r.reference);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [odo, setOdo] = useState('');
  const [fuel, setFuel] = useState('100');
  const [driver, setDriver] = useState('');
  const [licence, setLicence] = useState('');

  const inProgress = ['active', 'overdue'].includes(r.state);
  const [incOpen, setIncOpen] = useState(false);
  const [incCategory, setIncCategory] = useState<(typeof INCIDENT_CATEGORIES)[number]>('breakdown');
  const [incNote, setIncNote] = useState('');
  const [incReplacement, setIncReplacement] = useState('');
  const spares = useOpsUnits({
    locationCode: inProgress && incOpen ? r.pickupLocationCode : undefined,
  });
  const availableSpares = (spares.data ?? []).filter(
    (u) => u.state === 'available' && u.id !== undefined,
  );

  async function doIncident() {
    setMsg(null);
    try {
      await incident.mutateAsync({
        category: incCategory,
        note: incNote.trim() || undefined,
        replacementUnitId: incReplacement || undefined,
      });
      setMsg(
        incReplacement
          ? t('ops.rent.incidentSwapped', { ref: r.reference })
          : t('ops.rent.incidentLogged', { ref: r.reference }),
      );
      setIncOpen(false);
      setIncNote('');
      setIncReplacement('');
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('ops.rent.incidentFail'));
    }
  }

  async function doPickup() {
    setMsg(null);
    try {
      await pickup.mutateAsync({
        odometerKm: Number(odo || 0),
        fuelPct: Number(fuel || 100),
        driverName: driver,
        licenceNumber: licence,
      });
      setOpen(false);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('ops.rent.pickupFail'));
    }
  }

  async function doReturn() {
    setMsg(null);
    try {
      const res = await ret.mutateAsync({
        odometerKm: Number(odo || 0),
        fuelPct: Number(fuel || 100),
      });
      setMsg(
        t('ops.rent.returnedMsg', {
          total: formatMinor(res.adjustmentMinor, r.currency),
          fuel: formatMinor(res.fuelMinor, r.currency),
        }),
      );
      setOpen(false);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('ops.rent.returnFail'));
    }
  }

  return (
    <Card
      data-testid={`rental-${r.reference}`}
      data-state={r.state}
      data-reservation={r.reservationReference}
    >
      <CardHeader className="gap-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="bidi-isolate font-mono text-sm">{r.reference}</span>
          <Badge
            variant={
              r.state === 'active'
                ? 'success'
                : r.state === 'overdue'
                  ? 'destructive'
                  : r.state === 'closed'
                    ? 'neutral'
                    : 'warning'
            }
            data-testid={`rental-state-${r.reference}`}
          >
            {r.state}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {r.pickupLocationCode} → {r.returnLocationCode} ·{' '}
          {new Date(r.scheduledPickupAt).toLocaleDateString()} –{' '}
          {new Date(r.scheduledReturnAt).toLocaleDateString()} · {t('ops.rent.settlement')}{' '}
          {formatMinor(r.settlementMinor, r.currency)}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {msg ? (
          <p className="text-sm" data-testid={`rental-msg-${r.reference}`}>
            {msg}
          </p>
        ) : null}

        {r.state === 'awaiting_pickup' ? (
          !open ? (
            <Button onClick={() => setOpen(true)} data-testid={`pickup-open-${r.reference}`}>
              {t('ops.rent.runPickup')}
            </Button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('ops.rent.odoOut')} htmlFor={`odo-${r.reference}`}>
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={odo}
                    onChange={(e) => setOdo(e.target.value)}
                    data-testid={`pickup-odo-${r.reference}`}
                  />
                )}
              </Field>
              <Field label={t('ops.rent.fuelOut')} htmlFor={`fuel-${r.reference}`}>
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={fuel}
                    onChange={(e) => setFuel(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('ops.rent.driverName')} htmlFor={`drv-${r.reference}`}>
                {({ id }) => (
                  <Input
                    id={id}
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    data-testid={`pickup-driver-${r.reference}`}
                  />
                )}
              </Field>
              <Field label={t('ops.rent.licence')} htmlFor={`lic-${r.reference}`}>
                {({ id }) => (
                  <Input
                    id={id}
                    value={licence}
                    onChange={(e) => setLicence(e.target.value)}
                    data-testid={`pickup-licence-${r.reference}`}
                  />
                )}
              </Field>
              <div className="sm:col-span-2">
                <Button
                  onClick={doPickup}
                  loading={pickup.isPending}
                  data-testid={`pickup-submit-${r.reference}`}
                >
                  {t('ops.rent.confirmPickup')}
                </Button>
              </div>
            </div>
          )
        ) : null}

        {['active', 'overdue'].includes(r.state) ? (
          !open ? (
            <Button
              variant="outline"
              onClick={() => setOpen(true)}
              data-testid={`return-open-${r.reference}`}
            >
              {t('ops.rent.runReturn')}
            </Button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('ops.rent.odoIn')} htmlFor={`odoi-${r.reference}`}>
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={odo}
                    onChange={(e) => setOdo(e.target.value)}
                    data-testid={`return-odo-${r.reference}`}
                  />
                )}
              </Field>
              <Field
                label={t('ops.rent.fuelIn')}
                htmlFor={`fueli-${r.reference}`}
                hint={t('ops.rent.fuelInHint')}
              >
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={fuel}
                    onChange={(e) => setFuel(e.target.value)}
                    data-testid={`return-fuel-${r.reference}`}
                  />
                )}
              </Field>
              <div className="sm:col-span-2">
                <Button
                  onClick={doReturn}
                  loading={ret.isPending}
                  data-testid={`return-submit-${r.reference}`}
                >
                  {t('ops.rent.confirmReturn')}
                </Button>
              </div>
            </div>
          )
        ) : null}

        {inProgress ? (
          !incOpen ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIncOpen(true)}
              data-testid={`incident-open-${r.reference}`}
            >
              {t('ops.rent.reportIncident')}
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">{t('ops.rent.incidentTitle')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('ops.rent.incidentCategory')} htmlFor={`inc-cat-${r.reference}`}>
                  {({ id }) => (
                    <select
                      id={id}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={incCategory}
                      onChange={(e) =>
                        setIncCategory(e.target.value as (typeof INCIDENT_CATEGORIES)[number])
                      }
                      data-testid={`incident-category-${r.reference}`}
                    >
                      {INCIDENT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {t(`ops.rent.incidentCat.${c}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label={t('ops.rent.incidentReplacement')} htmlFor={`inc-rep-${r.reference}`}>
                  {({ id }) => (
                    <select
                      id={id}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={incReplacement}
                      onChange={(e) => setIncReplacement(e.target.value)}
                      data-testid={`incident-replacement-${r.reference}`}
                    >
                      <option value="">{t('ops.rent.incidentNoReplacement')}</option>
                      {availableSpares.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.plate} · {u.categoryName}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
              <Field label={t('ops.rent.incidentNote')} htmlFor={`inc-note-${r.reference}`}>
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={2}
                    value={incNote}
                    onChange={(e) => setIncNote(e.target.value)}
                  />
                )}
              </Field>
              <div className="flex gap-2">
                <Button
                  onClick={doIncident}
                  loading={incident.isPending}
                  data-testid={`incident-submit-${r.reference}`}
                >
                  {t('ops.rent.incidentSubmit')}
                </Button>
                <Button variant="ghost" onClick={() => setIncOpen(false)}>
                  {t('ops.st.cancel')}
                </Button>
              </div>
            </div>
          )
        ) : null}

        {r.state === 'closed' ? (
          <Button
            variant="outline"
            onClick={() => readiness.mutate(true)}
            loading={readiness.isPending}
            data-testid={`readiness-${r.reference}`}
          >
            {t('ops.rent.markReady')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
