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
  CardDescription,
  CardHeader,
  CardTitle,
} from '@carrental/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useOpsDashboard } from '../../lib/admin-hooks.js';
import { metaApi } from '../../lib/api.js';
import { formatMinor } from '../../lib/discovery-hooks.js';

/**
 * SCREEN-OPS-002 — Operational dashboard. A role- and location-scoped overview: the assignment
 * queue, today's pickups / returns, overdue rentals, fleet utilisation, revenue and
 * cancellations, finance/integration exceptions, and the fleet-readiness breakdown. Every card is
 * a whole click target that drills into the matching queue, already filtered. Urgent counts raise
 * a banner at the top. A metric that can't be read shows "unavailable", never `0` (FR-RPT-001).
 * Live system-health sits below and the header status chip links to it.
 */

/** Re-renders every 30s so a relative timestamp ("2m ago") stays honest without a refetch. */
function useNow(intervalMs = 30_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return Date.now();
}

/**
 * A stat card that is *entirely* a link to `to` (a pre-filtered queue). On a read error it shows
 * "unavailable", not a number. When `tone` is set and the value is `0`, it renders a reassuring
 * green all-clear state instead of a bare zero.
 */
function StatCard({
  label,
  value,
  hint,
  to,
  tone,
  zeroLabel,
  error,
}: {
  label: string;
  value: string | number;
  hint?: string;
  to: string;
  /** `alert` cards turn red when non-zero and green when zero. */
  tone?: 'alert';
  zeroLabel?: string;
  error?: boolean;
}) {
  const { t } = useI18n();
  const numeric = typeof value === 'number' ? value : Number(value);
  const isZero = !error && tone === 'alert' && Number.isFinite(numeric) && numeric === 0;
  const isAlerting = !error && tone === 'alert' && Number.isFinite(numeric) && numeric > 0;

  return (
    <Link
      to={to}
      className="group rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="ops-stat-card"
    >
      <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-accent/40">
        <CardHeader className="pb-2">
          <CardDescription>{label}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {error ? (
            <p className="text-sm text-muted-foreground" data-testid="metric-unavailable">
              {t('ops.dash.unavailable')}
            </p>
          ) : isZero ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              {zeroLabel ?? t('ops.dash.allClear')}
            </p>
          ) : (
            <p
              className={`text-2xl font-semibold tabular-nums ${isAlerting ? 'text-destructive' : ''}`}
            >
              {value}
            </p>
          )}
          {hint && !error && !isZero ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
          <span className="inline-flex items-center text-xs font-medium text-primary group-hover:underline">
            {t('ops.dash.view')} →
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export function OpsDashboard() {
  const { t, fmt } = useI18n();
  const dash = useOpsDashboard();
  const now = useNow();
  const health = useQuery({
    queryKey: ['meta', 'health-summary'],
    queryFn: ({ signal }) => metaApi.healthSummary(signal),
    refetchInterval: 30_000,
  });

  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#ops-dash-health') {
      document.getElementById('ops-dash-health')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [hash]);

  const d = dash.data;
  const err = dash.isError;
  const fleet = d?.fleet;

  const ageMin = dash.dataUpdatedAt ? Math.round((now - dash.dataUpdatedAt) / 60_000) : 0;
  const updatedLabel =
    dash.dataUpdatedAt && ageMin >= 1 ? fmt.relativeTime(-ageMin, 'minute') : t('ops.dash.justNow');

  const urgent = d ? d.assignQueue > 0 || d.overdue > 0 : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('ops.dash.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('ops.dash.subtitle')}</p>
          {d ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {d.scopeNote} · {t('ops.dash.updated', { time: updatedLabel })}
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => dash.refetch()}
          loading={dash.isFetching}
          data-testid="ops-dash-refresh"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {t('ops.dash.refresh')}
        </Button>
      </div>

      {dash.isLoading ? (
        <AppStateView kind="loading" title={t('state.loading.title')} inline />
      ) : err ? (
        <AppStateView
          kind="failure"
          inline
          title={t('state.failure.title')}
          description={t('ops.dash.loadError')}
          primaryAction={{ label: t('action.retry'), onClick: () => dash.refetch() }}
        />
      ) : null}

      {d && urgent ? (
        <Alert variant="warning" data-testid="ops-dash-urgent">
          <AlertTitle>{t('ops.dash.urgent.title')}</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1">
              {d.overdue > 0 ? (
                <li>
                  <Link to="/rentals?state=overdue" className="font-medium text-primary underline">
                    {t('ops.dash.urgent.overdue', { n: d.overdue })}
                  </Link>
                </li>
              ) : null}
              {d.assignQueue > 0 ? (
                <li>
                  <Link to="/work" className="font-medium text-primary underline">
                    {t('ops.dash.urgent.assign', { n: d.assignQueue })}
                  </Link>
                </li>
              ) : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="ops-dash-stats">
        <StatCard
          label={t('ops.dash.assignQueue')}
          value={d?.assignQueue ?? 0}
          to="/work"
          tone="alert"
          zeroLabel={t('ops.dash.zero.assignQueue')}
          error={err}
        />
        <StatCard
          label={t('ops.dash.pickups')}
          value={d?.pickupsToday.total ?? 0}
          hint={
            d
              ? t('ops.dash.doneOfTotal', {
                  done: d.pickupsToday.done,
                  total: d.pickupsToday.total,
                })
              : undefined
          }
          to="/rentals?flow=pickup&due=today"
          error={err}
        />
        <StatCard
          label={t('ops.dash.returns')}
          value={d?.returnsToday.total ?? 0}
          hint={
            d
              ? t('ops.dash.doneOfTotal', {
                  done: d.returnsToday.done,
                  total: d.returnsToday.total,
                })
              : undefined
          }
          to="/rentals?flow=return&due=today"
          error={err}
        />
        <StatCard
          label={t('ops.dash.overdue')}
          value={d?.overdue ?? 0}
          to="/rentals?state=overdue"
          tone="alert"
          zeroLabel={t('ops.dash.zero.overdue')}
          error={err}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="ops-dash-stats-2">
        <StatCard
          label={t('ops.dash.utilisation')}
          value={d?.utilisation == null ? '—' : `${d.utilisation}%`}
          hint={
            d
              ? t('ops.dash.utilisationHint', {
                  onRent: d.fleet.on_rent,
                  total: d.fleetTotal ?? 0,
                })
              : undefined
          }
          to="/fleet?state=on_rent"
          error={err}
        />
        <StatCard
          label={t('ops.dash.revenueToday')}
          value={d?.revenueToday ? formatMinor(d.revenueToday.minor, d.revenueToday.currency) : '—'}
          to="/finance"
          error={err}
        />
        <StatCard
          label={t('ops.dash.cancellations')}
          value={d?.cancellationsToday ?? 0}
          to="/work?view=all&state=cancelled"
          tone="alert"
          zeroLabel={t('ops.dash.zero.cancellations')}
          error={err}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.dash.fleetReadiness')}</CardTitle>
          </CardHeader>
          <CardContent>
            {err || !fleet ? (
              <p className="text-sm text-muted-foreground">{t('ops.dash.unavailable')}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 text-sm" data-testid="ops-dash-fleet">
                {(
                  [
                    ['ops.dash.fleet.available', 'available', fleet.available, 'text-success'],
                    ['ops.dash.fleet.onRent', 'on_rent', fleet.on_rent, ''],
                    ['ops.dash.fleet.prep', 'prep', fleet.prep, 'text-warning'],
                    [
                      'ops.dash.fleet.maintenance',
                      'maintenance',
                      fleet.maintenance,
                      'text-warning',
                    ],
                  ] as const
                ).map(([label, state, n, cls]) => (
                  <li key={label}>
                    <Link
                      to={`/fleet?state=${state}`}
                      className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent/40"
                    >
                      <span className="text-muted-foreground">{t(label)}</span>
                      <span className={`font-semibold tabular-nums ${cls}`}>{n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/fleet"
              className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
            >
              {t('ops.dash.view')} →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.dash.financeExceptions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {err || !d ? (
              <p className="text-sm text-muted-foreground">{t('ops.dash.unavailable')}</p>
            ) : d.financeExceptions.total === 0 ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                {t('ops.dash.zero.finance')}
              </p>
            ) : (
              <p className="flex items-center gap-2">
                <span className="text-2xl font-semibold tabular-nums">
                  {d.financeExceptions.total}
                </span>
                <Badge variant="warning">
                  {d.financeExceptions.recoveryCases} + {d.financeExceptions.reconciliation}
                </Badge>
              </p>
            )}
            <Link
              to="/finance"
              className="inline-block text-xs font-medium text-primary hover:underline"
            >
              {t('ops.dash.view')} →
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card id="ops-dash-health" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">{t('ops.dash.health')}</CardTitle>
          <CardDescription>
            {health.data
              ? t('ops.dash.checkedAt', { time: fmt.time(health.data.checkedAt) })
              : t('ops.dash.checking')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {health.isLoading ? (
            <AppStateView kind="loading" title={t('state.loading.title')} inline />
          ) : health.isError || !health.data ? (
            <AppStateView
              kind="failure"
              inline
              title={t('state.failure.title')}
              description={t('ops.dash.healthUnread')}
              primaryAction={{ label: t('action.retry'), onClick: () => health.refetch() }}
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2" data-testid="health-components">
              {health.data.components.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  data-component={c.name}
                  data-status={c.status}
                >
                  <span className="font-medium capitalize">{c.name}</span>
                  <span
                    className={
                      c.status === 'ok'
                        ? 'text-success'
                        : c.status === 'degraded'
                          ? 'text-warning'
                          : 'text-destructive'
                    }
                  >
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
