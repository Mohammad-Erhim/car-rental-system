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
  PageHeader,
  Textarea,
  Toolbar,
  useToast,
} from '@carrental/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError } from '../../lib/api.js';
import { useLocations } from '../../lib/discovery-hooks.js';
import { useLocationScope } from '../../lib/location-scope.js';
import { useOpsUnits } from '../../lib/ops-discovery-hooks.js';
import {
  usePickup,
  useRaiseIncident,
  useReadiness,
  useReturnRental,
  useOpsRentals,
  type RentalBoardRow,
} from '../../lib/rental-hooks.js';
import { useUrlParams } from '../../lib/use-url-param.js';

const INCIDENT_CATEGORIES = ['breakdown', 'accident', 'damage', 'other'] as const;
const RENTAL_STATES = ['awaiting_pickup', 'active', 'overdue', 'closed'] as const;

const stateLabel = (t: (k: string) => string, s: string) =>
  RENTAL_STATES.includes(s as (typeof RENTAL_STATES)[number])
    ? t(`ops.rent.stateLabel.${s}`)
    : s.replace(/_/g, ' ');

const selectClass =
  'flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * SCREEN-OPS-009/012/016 — the rental board. Pick up an awaiting-pickup rental (agreement +
 * odometer/fuel out), return an active one (odometer/fuel in → fuel/damage settlement), report
 * an incident, and run the readiness check. Confined to the actor's pickup locations by the API;
 * an `active` rental past its return time is flagged overdue live, without the sweep. Filters are
 * URL-backed and applied server-side.
 */
export function RentalBoardPage() {
  const { t } = useI18n();
  const locations = useLocations();
  const { params, setParams, setParam } = useUrlParams();

  const state = params.get('state') ?? '';
  const flow = params.get('flow') ?? '';
  const locationCode = params.get('location') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const focusRef = params.get('ref') ?? '';

  // seed from the global location switcher on first load only — never fights a filter the
  // operator has since set (or explicitly cleared) on this page themselves
  const { selected: globalLocation } = useLocationScope();
  useEffect(() => {
    if (!params.get('location') && globalLocation) setParam('location', globalLocation);
  }, []);

  const list = useOpsRentals({
    state: state || undefined,
    locationCode: locationCode || undefined,
    flow: flow === 'pickup' || flow === 'return' ? flow : undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const rows = focusRef
    ? (list.data?.results ?? []).filter((r) => r.reference === focusRef)
    : list.data?.results;
  const anyFilter = !!(state || flow || locationCode || from || to || focusRef);

  const countLabel = list.data
    ? list.data.truncated
      ? t('ops.search.showingOf', { shown: list.data.count, total: list.data.total })
      : t('ops.search.count', { n: list.data.total })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.rent.title')} description={t('ops.rent.subtitle')} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toolbar aria-label={t('ops.rent.filters')}>
          <select
            aria-label={t('ops.rent.filterState')}
            className={selectClass}
            value={state}
            onChange={(e) => setParam('state', e.target.value)}
          >
            <option value="">{t('ops.rent.allStates')}</option>
            {RENTAL_STATES.map((s) => (
              <option key={s} value={s}>
                {t(`ops.rent.stateLabel.${s}`)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('ops.rent.filterFlow')}
            className={selectClass}
            value={flow}
            onChange={(e) => setParam('flow', e.target.value)}
          >
            <option value="">{t('ops.rent.anyFlow')}</option>
            <option value="pickup">{t('ops.rent.flowPickup')}</option>
            <option value="return">{t('ops.rent.flowReturn')}</option>
          </select>
          <select
            aria-label={t('ops.search.location')}
            className={selectClass}
            value={locationCode}
            onChange={(e) => setParam('location', e.target.value)}
          >
            <option value="">{t('ops.search.anyLocation')}</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
          <Input
            type="date"
            aria-label={t('ops.search.from')}
            value={from}
            max={to || undefined}
            onChange={(e) => setParam('from', e.target.value)}
            className="max-w-[10rem]"
          />
          <Input
            type="date"
            aria-label={t('ops.search.to')}
            value={to}
            min={from || undefined}
            onChange={(e) => setParam('to', e.target.value)}
            className="max-w-[10rem]"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setParams((p) => {
                p.set('from', today());
                p.set('to', today());
                return p;
              });
            }}
          >
            {t('ops.rent.today')}
          </Button>
          {anyFilter ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setParams({})}
              data-testid="rental-clear-filters"
            >
              {t('ops.rent.clearFilters')}
            </Button>
          ) : null}
        </Toolbar>
        <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="rental-count">
          {list.isLoading ? t('ops.st.loading') : (countLabel ?? '')}
        </p>
      </div>

      {focusRef ? (
        <p
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
          data-testid="rental-focus"
        >
          <span className="bidi-isolate font-mono text-xs">{focusRef}</span>
          <button
            type="button"
            onClick={() => setParam('ref', '')}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t('ops.queue.showAll')}
          </button>
        </p>
      ) : null}

      {list.data?.truncated ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          {t('ops.search.narrowHint')}
        </p>
      ) : null}

      {list.isLoading ? (
        <AppStateView kind="loading" inline title={t('ops.st.loading')} />
      ) : list.isError ? (
        <AppStateView
          kind="failure"
          inline
          title={t('ops.rent.loadFail')}
          primaryAction={{ label: t('ops.st.retry'), onClick: () => list.refetch() }}
        />
      ) : !rows?.length ? (
        <AppStateView
          kind="empty"
          title={anyFilter ? t('ops.rent.emptyFiltered') : t('ops.rent.empty')}
          description={anyFilter ? t('ops.rent.emptyFilteredBody') : t('ops.rent.emptyBody')}
          primaryAction={
            anyFilter
              ? {
                  label: t('ops.rent.clearFilters'),
                  onClick: () => setParams({}),
                }
              : undefined
          }
        />
      ) : (
        <ul className="space-y-3" data-testid="rental-list">
          {rows.map((r) => (
            <li key={r.reference}>
              <RentalRow rental={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RentalRow({ rental: r }: { rental: RentalBoardRow }) {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const pickup = usePickup(r.reference);
  const ret = useReturnRental(r.reference);
  const readiness = useReadiness(r.reference);
  const incident = useRaiseIncident(r.reference);
  const [open, setOpen] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [odo, setOdo] = useState('');
  const [fuel, setFuel] = useState('100');
  const [driver, setDriver] = useState('');
  const [licence, setLicence] = useState('');
  const [findings, setFindings] = useState<
    Array<{ area: string; description: string; charge: string }>
  >([]);

  const inProgress = ['active', 'overdue'].includes(r.state);
  const [incOpen, setIncOpen] = useState(false);
  const [incCategory, setIncCategory] = useState<(typeof INCIDENT_CATEGORIES)[number]>('breakdown');
  const [incNote, setIncNote] = useState('');
  const [incReplacement, setIncReplacement] = useState('');
  // A replacement must be a same-category available unit at this location (the API rejects a
  // category mismatch) — so only offer those.
  const spares = useOpsUnits({
    locationCode: inProgress && incOpen ? r.pickupLocationCode : undefined,
    categoryCode: inProgress && incOpen ? (r.categoryCode ?? undefined) : undefined,
    state: 'available',
  });
  const availableSpares = (spares.data?.results ?? []).filter((u) => u.id !== undefined);

  const money = (m: number, c: string) => fmt.money({ amountMinor: m, currency: c });
  const err = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);

  // client-side guards for the odometer/fuel inputs — a clear message before the round trip
  const numOk = (v: string) => /^\d+$/.test(v.trim());
  const moneyOk = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());
  const pctOk = (v: string) => numOk(v) && Number(v) >= 0 && Number(v) <= 100;
  const pickupValid =
    numOk(odo) && pctOk(fuel) && driver.trim().length > 0 && licence.trim().length > 0;
  const returnOdoTooLow = numOk(odo) && r.odometerOutKm != null && Number(odo) < r.odometerOutKm;
  // every started finding row must be complete before the return can go through
  const findingsValid = findings.every(
    (f) => f.area.trim() && f.description.trim() && (f.charge === '' || moneyOk(f.charge)),
  );
  const returnValid = numOk(odo) && pctOk(fuel) && !returnOdoTooLow && findingsValid;

  const setFinding = (i: number, patch: Partial<(typeof findings)[number]>) =>
    setFindings((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const preparedFindings = findings
    .filter((f) => f.area.trim() && f.description.trim())
    .map((f) => ({
      area: f.area.trim().slice(0, 80),
      description: f.description.trim().slice(0, 500),
      chargeMinor: f.charge.trim() ? Math.round(Number(f.charge) * 100) : 0,
    }));
  const findingsChargeMinor = preparedFindings.reduce((a, f) => a + f.chargeMinor, 0);
  const fuelDeficit =
    numOk(fuel) && r.fuelOutPct != null ? Math.max(0, r.fuelOutPct - Number(fuel)) : 0;

  // success confirmations go through a toast — the card often leaves the current filter view
  // (awaiting → active, active → closed) so an inline message would unmount with it. Errors stay
  // inline because the row is still there.
  const ok = (title: string) => toast({ title, variant: 'success' });

  async function doIncident() {
    setMsg(null);
    try {
      await incident.mutateAsync({
        category: incCategory,
        note: incNote.trim() || undefined,
        replacementUnitId: incReplacement || undefined,
      });
      ok(
        incReplacement
          ? t('ops.rent.incidentSwapped', { ref: r.reference })
          : t('ops.rent.incidentLogged', { ref: r.reference }),
      );
      setIncOpen(false);
      setIncNote('');
      setIncReplacement('');
    } catch (e) {
      setMsg({ ok: false, text: err(e, t('ops.rent.incidentFail')) });
    }
  }

  async function doPickup() {
    setMsg(null);
    try {
      await pickup.mutateAsync({
        odometerKm: Number(odo),
        fuelPct: Number(fuel),
        driverName: driver.trim(),
        licenceNumber: licence.trim(),
      });
      setOpen(false);
      ok(t('ops.rent.pickupDone', { ref: r.reference }));
    } catch (e) {
      setMsg({ ok: false, text: err(e, t('ops.rent.pickupFail')) });
    }
  }

  async function doReadiness() {
    setMsg(null);
    try {
      await readiness.mutateAsync(true);
      ok(t('ops.rent.readyDoneBoard', { ref: r.reference }));
    } catch (e) {
      setMsg({ ok: false, text: err(e, t('ops.rent.readyFailBoard')) });
    }
  }

  async function doReturn() {
    setMsg(null);
    try {
      const res = await ret.mutateAsync({
        odometerKm: Number(odo),
        fuelPct: Number(fuel),
        findings: preparedFindings.length ? preparedFindings : undefined,
      });
      ok(
        t('ops.rent.returnedMsg', {
          total: money(res.adjustmentMinor, r.currency),
          fuel: money(res.fuelMinor, r.currency),
        }),
      );
      setOpen(false);
      setFindings([]);
    } catch (e) {
      setMsg({ ok: false, text: err(e, t('ops.rent.returnFail')) });
    } finally {
      setConfirmReturn(false);
    }
  }

  const showOverdue = r.overdue || r.state === 'overdue';

  return (
    <Card
      data-testid={`rental-${r.reference}`}
      data-state={r.state}
      data-reservation={r.reservationReference}
    >
      <CardHeader className="gap-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Link
            to={`/rentals/${encodeURIComponent(r.reference)}`}
            className="bidi-isolate font-mono text-sm text-primary hover:underline"
          >
            {r.reference}
          </Link>
          <Badge
            variant={
              showOverdue
                ? 'destructive'
                : r.state === 'active'
                  ? 'success'
                  : r.state === 'closed'
                    ? 'neutral'
                    : 'warning'
            }
            data-testid={`rental-state-${r.reference}`}
          >
            {showOverdue ? t('ops.rent.stateLabel.overdue') : stateLabel(t, r.state)}
          </Badge>
        </CardTitle>
        <p className="text-sm">
          {r.vehicle ?? t('ops.rent.noVehicle')}
          {r.plate ? (
            <span className="bidi-isolate ms-2 font-mono text-xs text-muted-foreground">
              {r.plate}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {r.customerName ?? r.driverName ?? '—'}
          {r.customerName && r.driverName && r.customerName !== r.driverName
            ? ` · ${t('ops.rent.driverIs', { name: r.driverName })}`
            : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {r.pickupLocationCode}
          {r.returnLocationCode !== r.pickupLocationCode ? ` → ${r.returnLocationCode}` : ''} ·{' '}
          {fmt.dateTime(r.scheduledPickupAt)} – {fmt.dateTime(r.scheduledReturnAt)}
          {r.settlementMinor
            ? ` · ${t('ops.rent.settlement')} ${money(r.settlementMinor, r.currency)}`
            : ''}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {msg ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              msg.ok ? 'border-success/40 bg-success/10' : 'border-destructive/40 bg-destructive/10'
            }`}
            data-testid={`rental-msg-${r.reference}`}
          >
            {msg.text}
          </p>
        ) : null}

        {r.state === 'awaiting_pickup' ? (
          !open ? (
            <Button onClick={() => setOpen(true)} data-testid={`pickup-open-${r.reference}`}>
              {t('ops.rent.runPickup')}
            </Button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('ops.rent.odoOut')}
                htmlFor={`odo-${r.reference}`}
                error={odo && !numOk(odo) ? t('ops.rent.numberOnly') : undefined}
              >
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
              <Field
                label={t('ops.rent.fuelOut')}
                htmlFor={`fuel-${r.reference}`}
                error={fuel && !pctOk(fuel) ? t('ops.rent.pct0to100') : undefined}
              >
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
              <Field
                label={t('ops.rent.licence')}
                htmlFor={`lic-${r.reference}`}
                hint={t('ops.rent.licenceHint')}
              >
                {({ id }) => (
                  <Input
                    id={id}
                    value={licence}
                    onChange={(e) => setLicence(e.target.value)}
                    data-testid={`pickup-licence-${r.reference}`}
                  />
                )}
              </Field>
              <div className="flex gap-2 sm:col-span-2">
                <Button
                  onClick={doPickup}
                  loading={pickup.isPending}
                  disabled={!pickupValid}
                  data-testid={`pickup-submit-${r.reference}`}
                >
                  {t('ops.rent.confirmPickup')}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  {t('ops.st.cancel')}
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
              <Field
                label={t('ops.rent.odoIn')}
                htmlFor={`odoi-${r.reference}`}
                hint={
                  r.odometerOutKm != null
                    ? t('ops.rent.odoOutWas', { km: r.odometerOutKm })
                    : undefined
                }
                error={
                  odo && !numOk(odo)
                    ? t('ops.rent.numberOnly')
                    : returnOdoTooLow
                      ? t('ops.rent.odoTooLow')
                      : undefined
                }
              >
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
                error={fuel && !pctOk(fuel) ? t('ops.rent.pct0to100') : undefined}
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

              <div className="space-y-2 sm:col-span-2">
                <p className="text-sm font-medium">{t('ops.rent.findings')}</p>
                <p className="text-xs text-muted-foreground">{t('ops.rent.findingsHint')}</p>
                {findings.map((f, i) => (
                  <div
                    key={i}
                    className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_7rem_auto]"
                    data-testid={`return-finding-${r.reference}-${i}`}
                  >
                    <Input
                      aria-label={t('ops.rent.findingArea')}
                      placeholder={t('ops.rent.findingArea')}
                      value={f.area}
                      maxLength={80}
                      onChange={(e) => setFinding(i, { area: e.target.value })}
                    />
                    <Input
                      aria-label={t('ops.rent.findingDesc')}
                      placeholder={t('ops.rent.findingDesc')}
                      value={f.description}
                      maxLength={500}
                      onChange={(e) => setFinding(i, { description: e.target.value })}
                    />
                    <Input
                      aria-label={t('ops.rent.findingCharge')}
                      inputMode="decimal"
                      placeholder={t('ops.rent.findingCharge')}
                      value={f.charge}
                      invalid={!!f.charge && !moneyOk(f.charge)}
                      onChange={(e) => setFinding(i, { charge: e.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFindings((fs) => fs.filter((_, j) => j !== i))}
                    >
                      {t('ops.rent.removeFinding')}
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFindings((fs) => [...fs, { area: '', description: '', charge: '' }])
                  }
                  data-testid={`return-add-finding-${r.reference}`}
                >
                  {t('ops.rent.addFinding')}
                </Button>
              </div>

              <div className="flex gap-2 sm:col-span-2">
                <Button
                  onClick={() => setConfirmReturn(true)}
                  disabled={!returnValid}
                  data-testid={`return-submit-${r.reference}`}
                >
                  {t('ops.rent.confirmReturn')}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  {t('ops.st.cancel')}
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
            onClick={doReadiness}
            loading={readiness.isPending}
            data-testid={`readiness-${r.reference}`}
          >
            {t('ops.rent.markReady')}
          </Button>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={confirmReturn}
        onOpenChange={setConfirmReturn}
        title={t('ops.rent.returnConfirmTitle')}
        description={
          <div className="space-y-2 text-sm">
            <p>
              {t('ops.rent.returnOdoLine', {
                inKm: odo || '—',
                outLine:
                  r.odometerOutKm != null && numOk(odo)
                    ? t('ops.rent.returnOdoDelta', { km: Number(odo) - r.odometerOutKm })
                    : '',
              })}
            </p>
            <p>
              {fuelDeficit > 0
                ? t('ops.rent.returnFuelLine', {
                    inPct: fuel,
                    outPct: r.fuelOutPct ?? 100,
                    deficit: fuelDeficit,
                  })
                : t('ops.rent.returnFuelLineNoDeficit', { inPct: fuel })}
            </p>
            <p>
              {preparedFindings.length
                ? t('ops.rent.returnFindingsLine', {
                    n: preparedFindings.length,
                    total: money(findingsChargeMinor, r.currency),
                  })
                : t('ops.rent.returnNoFindings')}
            </p>
            <p className="text-muted-foreground">{t('ops.rent.returnSettleNote')}</p>
          </div>
        }
        confirmLabel={t('ops.rent.confirmReturn')}
        onConfirm={doReturn}
      />
    </Card>
  );
}
