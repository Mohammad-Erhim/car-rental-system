import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  Field,
  Input,
  PageHeader,
  useToast,
  type DataTableColumn,
} from '@carrental/ui';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useLocationScope } from '../../lib/location-scope.js';
import { useAssignVehicle } from '../../lib/rental-hooks.js';
import { useOpsReservations, type OpsReservationRow } from '../../lib/reservation-hooks.js';
import { useUrlParams } from '../../lib/use-url-param.js';

/**
 * SCREEN-OPS-004 — the staff reservation queue. Two views: "Needs action" (the actionable
 * default — confirmed reservations with no rental yet, soonest pickup first) and "All" (the
 * browsable list with state / location / date filters). Confined to the actor's pickup
 * locations by the API. Every filter is URL-backed so a view is shareable and survives a refresh.
 */

const RESERVATION_STATES = ['pending', 'confirmed', 'cancelled', 'no_show', 'fulfilled'];

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const stateVariant = (s: string) =>
  s === 'confirmed'
    ? 'success'
    : s === 'cancelled'
      ? 'neutral'
      : s === 'no_show'
        ? 'destructive'
        : s === 'fulfilled'
          ? 'neutral'
          : 'warning';

export function ReservationQueuePage() {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const { params, setParams, setParam } = useUrlParams();

  const view: 'queue' | 'all' = params.get('view') === 'all' ? 'all' : 'queue';
  const state = params.get('state') ?? '';
  const locationCode = params.get('location') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const focusRef = params.get('ref') ?? '';

  // seed from the global location switcher on first load only — never fights a filter the
  // operator has since set (or explicitly cleared) on this page themselves. `options` is already
  // narrowed to what this actor can see, so this page's own filter never offers a branch that
  // would just come back empty.
  const { selected: globalLocation, options: locations } = useLocationScope();
  useEffect(() => {
    if (!params.get('location') && globalLocation) setParam('location', globalLocation);
  }, []);

  const setView = (v: 'queue' | 'all') =>
    setParams((p) => {
      if (v === 'all') p.set('view', 'all');
      else {
        p.delete('view');
        p.delete('state');
        p.delete('location');
        p.delete('from');
        p.delete('to');
      }
      return p;
    });

  const list = useOpsReservations({
    view,
    state: view === 'all' && state ? state : undefined,
    locationCode: view === 'all' && locationCode ? locationCode : undefined,
    from: view === 'all' && from ? from : undefined,
    to: view === 'all' && to ? to : undefined,
  });

  const rows = focusRef
    ? (list.data?.results ?? []).filter((r) => r.reference === focusRef)
    : list.data?.results;

  const assign = useAssignVehicle();
  const runAssign = async (r: OpsReservationRow) => {
    try {
      const rental = await assign.mutateAsync(r.reference);
      toast({
        title: t('ops.queue.assigned', { ref: r.reference }),
        description: t('ops.queue.assignedTo', { rental: rental.reference }),
        variant: 'success',
      });
    } catch {
      toast({ title: t('ops.queue.assignFail', { ref: r.reference }) });
    }
  };

  const money = (m: number, c: string) => fmt.money({ amountMinor: m, currency: c });

  const columns: Array<DataTableColumn<OpsReservationRow>> = [
    {
      key: 'reference',
      header: t('ops.tbl.reference'),
      cell: (r) => (
        <div className="bidi-isolate font-mono text-xs">
          <Link
            to={`/work/${encodeURIComponent(r.reference)}`}
            className="font-medium text-primary hover:underline"
          >
            {r.reference}
          </Link>
          {r.assignedRentalRef ? (
            <div className="text-muted-foreground">→ {r.assignedRentalRef}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'state',
      header: t('ops.tbl.state'),
      cell: (r) => <Badge variant={stateVariant(r.state)}>{r.state.replace(/_/g, ' ')}</Badge>,
    },
    { key: 'driver', header: t('ops.search.driver'), cell: (r) => r.driverName ?? '—' },
    {
      key: 'category',
      header: t('ops.tbl.category'),
      cell: (r) => `${r.categoryCode} · ${r.channel}`,
    },
    {
      key: 'pickup',
      header: t('ops.tbl.pickup'),
      cell: (r) => (
        <span className="text-xs">
          {fmt.dateTime(r.pickupAt)}
          <br />
          <span className="text-muted-foreground">
            {r.pickupLocationCode}
            {r.returnLocationCode !== r.pickupLocationCode ? ` → ${r.returnLocationCode}` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'total',
      header: t('ops.tbl.total'),
      cell: (r) => (
        <span className="text-xs">
          {money(r.totalMinor, r.currency)}
          <br />
          <span className="text-muted-foreground">
            {t('ops.queue.paidOf', { paid: money(r.paidMinor, r.currency) })}
          </span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (r) =>
        r.assignedRentalRef ? (
          <Link
            to={`/rentals/${encodeURIComponent(r.assignedRentalRef)}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t('ops.queue.openRental')} →
          </Link>
        ) : r.state === 'confirmed' ? (
          <Button
            size="sm"
            variant="ghost"
            loading={assign.isPending}
            data-testid={`assign-${r.reference}`}
            onClick={() => runAssign(r)}
          >
            {t('ops.queue.assign')}
          </Button>
        ) : null,
    },
  ];

  const countLabel = list.data
    ? list.data.truncated
      ? t('ops.search.showingOf', { shown: list.data.count, total: list.data.total })
      : t('ops.search.count', { n: list.data.total })
    : null;

  const tab = (id: 'queue' | 'all', label: string) => (
    <button
      type="button"
      onClick={() => setView(id)}
      aria-pressed={view === id}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        view === id
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      data-testid={`ops-queue-tab-${id}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.queue.title')} description={t('ops.queue.subtitle')} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {tab('queue', t('ops.queue.tabQueue'))}
          {tab('all', t('ops.queue.tabAll'))}
        </div>
        <p
          className="text-sm text-muted-foreground"
          aria-live="polite"
          data-testid="ops-queue-count"
        >
          {list.isLoading ? t('ops.st.loading') : (countLabel ?? '')}
        </p>
      </div>

      {view === 'all' ? (
        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('ops.tbl.state')} htmlFor="ops-queue-state">
              {({ id }) => (
                <select
                  id={id}
                  className={selectClass}
                  value={state}
                  onChange={(e) => setParam('state', e.target.value)}
                  data-testid="ops-queue-state"
                >
                  <option value="">{t('ops.queue.allStates')}</option>
                  {RESERVATION_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('ops.search.location')} htmlFor="ops-queue-loc">
              {({ id }) => (
                <select
                  id={id}
                  className={selectClass}
                  value={locationCode}
                  onChange={(e) => setParam('location', e.target.value)}
                >
                  <option value="">{t('ops.search.anyLocation')}</option>
                  {locations.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('ops.search.from')} htmlFor="ops-queue-from">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setParam('from', e.target.value)}
                />
              )}
            </Field>
            <Field label={t('ops.search.to')} htmlFor="ops-queue-to">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setParam('to', e.target.value)}
                />
              )}
            </Field>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-3 pt-6">
          {focusRef ? (
            <p
              className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
              data-testid="ops-queue-focus"
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

          <div className="hidden sm:block">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.reference}
              isLoading={list.isLoading}
              isError={list.isError}
              onRetry={() => list.refetch()}
              rowProps={(r) => ({ 'data-ref': r.reference, 'data-state': r.state })}
              testid="ops-res-table"
              bodyTestid="ops-res-rows"
              minWidth="48rem"
              labels={{
                loading: t('ops.st.loading'),
                loadFailTitle: t('ops.queue.loadFail'),
                retry: t('ops.st.retry'),
                empty: focusRef
                  ? t('ops.queue.focusMiss')
                  : view === 'queue'
                    ? t('ops.queue.queueClear')
                    : t('ops.queue.empty'),
              }}
            />
          </div>
          <ul className="space-y-2 sm:hidden" data-testid="ops-res-cards">
            {list.isError ? (
              <li className="rounded-md border p-4 text-sm">
                {t('ops.queue.loadFail')}{' '}
                <button className="text-primary underline" onClick={() => list.refetch()}>
                  {t('ops.st.retry')}
                </button>
              </li>
            ) : !list.isLoading && !rows?.length ? (
              <li className="rounded-md border p-4 text-sm text-muted-foreground">
                {view === 'queue' ? t('ops.queue.queueClear') : t('ops.queue.empty')}
              </li>
            ) : (
              (rows ?? []).map((r) => (
                <li
                  key={r.reference}
                  className="rounded-lg border p-3"
                  data-ref={r.reference}
                  data-state={r.state}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="bidi-isolate font-mono text-xs font-medium">
                      {r.reference}
                    </span>
                    <Badge variant={stateVariant(r.state)}>{r.state.replace(/_/g, ' ')}</Badge>
                  </div>
                  <p className="mt-1 text-sm">{r.driverName ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.categoryCode} · {r.channel} · {fmt.dateTime(r.pickupAt)} ·{' '}
                    {r.pickupLocationCode}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {money(r.totalMinor, r.currency)} ·{' '}
                    {t('ops.queue.paidOf', { paid: money(r.paidMinor, r.currency) })}
                  </p>
                  <div className="mt-2">
                    {r.assignedRentalRef ? (
                      <Link
                        to={`/rentals/${encodeURIComponent(r.assignedRentalRef)}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {t('ops.queue.openRental')} → {r.assignedRentalRef}
                      </Link>
                    ) : r.state === 'confirmed' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={assign.isPending}
                        onClick={() => runAssign(r)}
                      >
                        {t('ops.queue.assign')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
