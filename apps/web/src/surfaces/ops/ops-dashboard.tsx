import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@carrental/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { useOpsDashboard } from '../../lib/admin-hooks.js';
import { metaApi } from '../../lib/api.js';

/**
 * SCREEN-OPS-002 — Operational dashboard. A role- and location-scoped overview: today's pickups
 * and returns, overdue rentals, the assignment queue, finance/integration exceptions, and the
 * fleet-readiness breakdown. Each card drills into the matching queue. A metric that can't be
 * read shows "unavailable", never `0` (FR-RPT-001). Live system-health sits below.
 */

/** A stat card that drills to `to`; on a read error it shows "unavailable", not a number. */
function StatCard({
  label,
  value,
  hint,
  to,
  emphasis,
  error,
}: {
  label: string;
  value: string | number;
  hint?: string;
  to: string;
  emphasis?: boolean;
  error?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {error ? (
          <p className="text-sm text-muted-foreground" data-testid="metric-unavailable">
            {t('ops.dash.unavailable')}
          </p>
        ) : (
          <p
            className={`text-2xl font-semibold tabular-nums ${
              emphasis && Number(value) > 0 ? 'text-destructive' : ''
            }`}
          >
            {value}
          </p>
        )}
        {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        <Link to={to} className="text-xs font-medium text-primary hover:underline">
          {t('ops.dash.view')} →
        </Link>
      </CardContent>
    </Card>
  );
}

export function OpsDashboard() {
  const { t, fmt } = useI18n();
  const dash = useOpsDashboard();
  const health = useQuery({
    queryKey: ['meta', 'health-summary'],
    queryFn: ({ signal }) => metaApi.healthSummary(signal),
    refetchInterval: 30_000,
  });

  const d = dash.data;
  const err = dash.isError;
  const fleet = d?.fleet;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('ops.dash.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('ops.dash.subtitle')}</p>
        {d ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {d.scopeNote} · {t('ops.dash.updated', { time: fmt.time(d.checkedAt) })}
          </p>
        ) : null}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="ops-dash-stats">
        <StatCard
          label={t('ops.dash.assignQueue')}
          value={d?.assignQueue ?? 0}
          to="/work"
          emphasis
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
          to="/rentals"
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
          to="/rentals"
          error={err}
        />
        <StatCard
          label={t('ops.dash.overdue')}
          value={d?.overdue ?? 0}
          to="/rentals"
          emphasis
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
                    ['ops.dash.fleet.available', fleet.available, 'text-success'],
                    ['ops.dash.fleet.onRent', fleet.on_rent, ''],
                    ['ops.dash.fleet.prep', fleet.prep, 'text-warning'],
                    ['ops.dash.fleet.maintenance', fleet.maintenance, 'text-warning'],
                  ] as const
                ).map(([label, n, cls]) => (
                  <li
                    key={label}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <span className="text-muted-foreground">{t(label)}</span>
                    <span className={`font-semibold tabular-nums ${cls}`}>{n}</span>
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
            ) : (
              <p className="flex items-center gap-2">
                <span className="text-2xl font-semibold tabular-nums">
                  {d.financeExceptions.total}
                </span>
                {d.financeExceptions.total > 0 ? (
                  <Badge variant="warning">
                    {d.financeExceptions.recoveryCases} + {d.financeExceptions.reconciliation}
                  </Badge>
                ) : null}
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

      <Card>
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
