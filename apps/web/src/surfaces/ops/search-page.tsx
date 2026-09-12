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
  Spinner,
  type DataTableColumn,
} from '@carrental/ui';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useOpsSearch, opsSearchReady, type SearchHit } from '../../lib/admin-hooks.js';
import { useLocations } from '../../lib/discovery-hooks.js';
import { useLocationScope } from '../../lib/location-scope.js';
import { useUrlParams } from '../../lib/use-url-param.js';

/**
 * SCREEN-OPS-004 / FR-ADM-003 — one search across reservations and rentals. Free text matches a
 * reference, the primary driver, or (rentals) the vehicle plate; narrow by kind / status /
 * location / pickup-date window. Every input is URL-backed so a search is shareable and survives
 * a refresh; the text box is debounced (no submit button). Each row links to the surface that
 * owns the permitted next action, already scrolled to the record.
 */

const RESERVATION_STATES = ['pending', 'confirmed', 'cancelled', 'no_show', 'fulfilled'];
const RENTAL_STATES = ['awaiting_pickup', 'active', 'overdue', 'closed'];

const selectClass =
  'flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function SearchPage() {
  const { t, fmt } = useI18n();
  const locations = useLocations();
  const { params, setParams, setParam } = useUrlParams();

  const q = params.get('q') ?? '';
  const kind = (params.get('kind') ?? '') as '' | 'reservation' | 'rental';
  const status = params.get('status') ?? '';
  const locationCode = params.get('location') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  // seed from the global location switcher on first load only — never fights a filter the
  // operator has since set (or explicitly cleared) on this page themselves
  const { selected: globalLocation } = useLocationScope();
  useEffect(() => {
    if (!params.get('location') && globalLocation) setParam('location', globalLocation);
  }, []);

  // The text box is debounced into the URL; everything else writes immediately.
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  useEffect(() => {
    const next = draft.trim();
    if (next === q) return;
    const id = setTimeout(() => {
      setParams((p) => {
        if (next) p.set('q', next);
        else p.delete('q');
        return p;
      });
    }, 350);
    return () => clearTimeout(id);
  }, [draft, q, setParams]);

  const searchParams = useMemo(
    () => ({
      q: q || undefined,
      kind: kind || undefined,
      status: status || undefined,
      locationCode: locationCode || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [q, kind, status, locationCode, from, to],
  );
  const search = useOpsSearch(searchParams);
  const ready = opsSearchReady(searchParams);
  const anyFilter = !!(q || kind || status || locationCode || from || to);
  const tooShort = draft.trim().length === 1;

  const statusOptions =
    kind === 'reservation'
      ? RESERVATION_STATES
      : kind === 'rental'
        ? RENTAL_STATES
        : [...new Set([...RESERVATION_STATES, ...RENTAL_STATES])];

  const money = (m: number | null, c: string | null) =>
    m == null || !c ? '—' : fmt.money({ amountMinor: m, currency: c });
  const dateRange = (h: SearchHit) => `${fmt.date(h.pickupAt)} → ${fmt.date(h.returnAt)}`;
  const locationRange = (h: SearchHit) =>
    h.returnLocationCode !== h.locationCode
      ? `${h.locationCode} → ${h.returnLocationCode}`
      : h.locationCode;

  const columns: Array<DataTableColumn<SearchHit>> = [
    {
      key: 'kind',
      header: t('ops.search.kind'),
      cell: (h) => (
        <div className="flex flex-col gap-1">
          <Badge variant={h.kind === 'rental' ? 'success' : 'neutral'}>
            {h.kind === 'rental' ? t('ops.search.rental') : t('ops.search.reservation')}
          </Badge>
          {h.overdue ? <Badge variant="destructive">{t('ops.search.overdue')}</Badge> : null}
        </div>
      ),
    },
    {
      key: 'reference',
      header: t('ops.search.reference'),
      cell: (h) => (
        <div className="font-mono text-xs">
          <Link className="text-primary underline-offset-2 hover:underline" to={h.href}>
            {h.reference}
          </Link>
          {h.reservationReference ? (
            <div className="text-muted-foreground">← {h.reservationReference}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('ops.tbl.status'),
      cell: (h) => <Badge variant="neutral">{h.status}</Badge>,
    },
    { key: 'driver', header: t('ops.search.driver'), cell: (h) => h.driverName ?? '—' },
    {
      key: 'vehicle',
      header: t('ops.search.vehicle'),
      cell: (h) => (
        <span className="text-xs">
          {h.categoryCode ?? '—'}
          {h.plate ? ` · ${h.plate}` : ''}
        </span>
      ),
    },
    {
      key: 'window',
      header: t('ops.search.window'),
      cell: (h) => (
        <span className="text-xs text-muted-foreground">
          {dateRange(h)}
          <br />
          {locationRange(h)}
        </span>
      ),
    },
    { key: 'total', header: t('ops.search.total'), cell: (h) => money(h.totalMinor, h.currency) },
  ];

  const countLabel = search.data
    ? search.data.truncated
      ? t('ops.search.showingOf', { shown: search.data.count, total: search.data.total })
      : t('ops.search.count', { n: search.data.total })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.search.title')} description={t('ops.search.subtitle')} />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <Field label={t('ops.search.queryLabel')} htmlFor="ops-search-q">
            {({ id }) => (
              <div className="relative">
                <Input
                  id={id}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('ops.search.queryHint')}
                  className="pe-9"
                  autoComplete="off"
                  data-testid="ops-search-q"
                />
                {search.isFetching ? (
                  <Spinner className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                ) : draft ? (
                  <button
                    type="button"
                    onClick={() => setDraft('')}
                    aria-label={t('action.clear')}
                    className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            )}
          </Field>
          {tooShort ? (
            <p className="text-xs text-muted-foreground" data-testid="ops-search-hint">
              {t('ops.search.minChars')}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label={t('ops.search.kind')} htmlFor="ops-search-kind">
              {({ id }) => (
                <select
                  id={id}
                  className={selectClass}
                  value={kind}
                  onChange={(e) => setParam('kind', e.target.value)}
                  data-testid="ops-search-kind"
                >
                  <option value="">{t('ops.search.anyKind')}</option>
                  <option value="reservation">{t('ops.search.reservation')}</option>
                  <option value="rental">{t('ops.search.rental')}</option>
                </select>
              )}
            </Field>
            <Field label={t('ops.tbl.status')} htmlFor="ops-search-status">
              {({ id }) => (
                <select
                  id={id}
                  className={selectClass}
                  value={status}
                  onChange={(e) => setParam('status', e.target.value)}
                  data-testid="ops-search-status"
                >
                  <option value="">{t('ops.search.anyStatus')}</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('ops.search.location')} htmlFor="ops-search-loc">
              {({ id }) => (
                <select
                  id={id}
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
              )}
            </Field>
            <Field label={t('ops.search.from')} htmlFor="ops-search-from">
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
            <Field label={t('ops.search.to')} htmlFor="ops-search-to">
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
          </div>

          {anyFilter ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setParams({})}
              data-testid="ops-search-clear"
            >
              {t('ops.search.clearAll')}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p
            className="text-sm text-muted-foreground"
            aria-live="polite"
            data-testid="ops-search-count"
          >
            {!ready
              ? t('ops.search.start')
              : search.isLoading
                ? t('ops.st.loading')
                : (countLabel ?? '')}
          </p>

          {search.data && search.data.truncated ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              {t('ops.search.narrowHint')}
            </p>
          ) : null}

          {/* Desktop: table. Mobile: cards. */}
          <div className="hidden sm:block">
            <DataTable
              columns={columns}
              rows={ready ? search.data?.results : []}
              rowKey={(h) => `${h.kind}:${h.reference}`}
              isLoading={ready && search.isLoading}
              isError={search.isError}
              onRetry={() => search.refetch()}
              rowProps={(h) => ({ 'data-kind': h.kind, 'data-ref': h.reference })}
              testid="ops-search-results"
              bodyTestid="ops-search-rows"
              minWidth="52rem"
              labels={{
                loading: t('ops.st.loading'),
                loadFailTitle: t('ops.search.loadFail'),
                retry: t('ops.st.retry'),
                empty: anyFilter ? t('ops.search.noHits') : t('ops.search.start'),
              }}
            />
          </div>
          <ul className="space-y-2 sm:hidden" data-testid="ops-search-cards">
            {ready && search.isError ? (
              <li className="rounded-md border p-4 text-sm">
                {t('ops.search.loadFail')}{' '}
                <button className="text-primary underline" onClick={() => search.refetch()}>
                  {t('ops.st.retry')}
                </button>
              </li>
            ) : ready && !search.isLoading && !search.data?.results.length ? (
              <li className="rounded-md border p-4 text-sm text-muted-foreground">
                {anyFilter ? t('ops.search.noHits') : t('ops.search.start')}
              </li>
            ) : (
              (search.data?.results ?? []).map((h) => (
                <li key={`${h.kind}:${h.reference}`}>
                  <Link
                    to={h.href}
                    className="block rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/40"
                    data-kind={h.kind}
                    data-ref={h.reference}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium text-primary">
                        {h.reference}
                      </span>
                      <div className="flex gap-1">
                        <Badge variant={h.kind === 'rental' ? 'success' : 'neutral'}>
                          {h.kind === 'rental'
                            ? t('ops.search.rental')
                            : t('ops.search.reservation')}
                        </Badge>
                        {h.overdue ? (
                          <Badge variant="destructive">{t('ops.search.overdue')}</Badge>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1 text-sm">{h.driverName ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.status} · {h.categoryCode ?? '—'}
                      {h.plate ? ` · ${h.plate}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateRange(h)} · {locationRange(h)} · {money(h.totalMinor, h.currency)}
                    </p>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
