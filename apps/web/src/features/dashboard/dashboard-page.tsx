import { useI18n } from '@carrental/i18n/react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  Gauge,
  RefreshCw,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { FinanceExceptionsCard } from './finance-exceptions-card';
import { FleetReadinessCard } from './fleet-readiness-card';
import { HealthCard } from './health-card';
import { TrendsCard } from './trends-card';

import { paths } from '@/app/paths';
import { Page, PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { scopeText } from '@/features/reports/report-columns';
import { useOpsDashboard } from '@/lib/admin-hooks';
import { formatMinor } from '@/lib/discovery-hooks';
import { useLocationScope } from '@/lib/location-scope';

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
 * SCREEN-OPS-002 — Operational dashboard. A role- and location-scoped overview: the assignment
 * queue, today's pickups / returns, overdue rentals, fleet utilisation, revenue and
 * cancellations, fleet readiness, finance exceptions and live system health. Every KPI tile is a
 * whole click target that drills into the matching queue, already filtered. Urgent counts raise
 * a banner at the top. A metric that can't be read shows "unavailable", never `0` (FR-RPT-001).
 */
export function DashboardPage() {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const { codes: locationCode, nameOf } = useLocationScope();
  const dash = useOpsDashboard(locationCode);
  const now = useNow();

  // the header health chip links to `/#ops-dash-health`
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#ops-dash-health') {
      document.getElementById('ops-dash-health')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [hash]);

  const d = dash.data;
  const loading = dash.isLoading;
  const unavailable = dash.isError;
  const today = new Date().toISOString().slice(0, 10);

  const ageMin = dash.dataUpdatedAt ? Math.round((now - dash.dataUpdatedAt) / 60_000) : 0;
  const updated =
    dash.dataUpdatedAt && ageMin >= 1 ? fmt.relativeTime(-ageMin, 'minute') : t('ops.dash.justNow');
  const urgent = d ? d.assignQueue > 0 || d.overdue > 0 : false;

  // props every tile shares
  const tile = {
    loading,
    unavailable,
    viewLabel: t('ops.dash.view'),
    unavailableLabel: t('ops.dash.unavailable'),
  };

  return (
    <Page>
      <PageHeader
        title={t('ops.dash.title')}
        description={t('ops.dash.subtitle')}
        meta={
          d ? (
            <span>
              {scopeText(i18n, d.scopeNote, nameOf)} · {t('ops.dash.updated', { time: updated })}
            </span>
          ) : null
        }
        actions={
          <Button
            variant="outline"
            onClick={() => void dash.refetch()}
            loading={dash.isFetching}
            data-testid="ops-dash-refresh"
          >
            {dash.isFetching ? null : <RefreshCw aria-hidden="true" />}
            {t('ops.dash.refresh')}
          </Button>
        }
      />

      {unavailable ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            {t('ops.dash.loadError')}
            <Button variant="outline" size="sm" onClick={() => void dash.refetch()}>
              {t('action.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {d && urgent ? (
        <Alert variant="warning" data-testid="ops-dash-urgent">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>{t('ops.dash.urgent.title')}</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
              {d.overdue > 0 ? (
                <li>
                  <Link to="/rentals?state=overdue" className="font-medium text-primary underline">
                    {t('ops.dash.urgent.overdue', { n: d.overdue })}
                  </Link>
                </li>
              ) : null}
              {d.assignQueue > 0 ? (
                <li>
                  <Link to={paths.reservations} className="font-medium text-primary underline">
                    {t('ops.dash.urgent.assign', { n: d.assignQueue })}
                  </Link>
                </li>
              ) : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-label={t('ops.dash.title')} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="ops-dash-stats">
          <StatCard
            {...tile}
            label={t('ops.dash.assignQueue')}
            value={d?.assignQueue ?? 0}
            to={paths.reservations}
            tone="alert"
            zeroLabel={t('ops.dash.zero.assignQueue')}
            icon={ClipboardList}
          />
          <StatCard
            {...tile}
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
            to={`/rentals?flow=pickup&from=${today}&to=${today}`}
            icon={ArrowDownToLine}
          />
          <StatCard
            {...tile}
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
            to={`/rentals?flow=return&from=${today}&to=${today}`}
            icon={ArrowUpFromLine}
          />
          <StatCard
            {...tile}
            label={t('ops.dash.overdue')}
            value={d?.overdue ?? 0}
            to="/rentals?state=overdue"
            tone="alert"
            zeroLabel={t('ops.dash.zero.overdue')}
            icon={AlertTriangle}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="ops-dash-stats-2">
          <StatCard
            {...tile}
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
            icon={Gauge}
          />
          <StatCard
            {...tile}
            label={t('ops.dash.revenueToday')}
            value={
              d?.revenueToday ? formatMinor(d.revenueToday.minor, d.revenueToday.currency) : '—'
            }
            hint={
              d?.revenueToday?.other?.length
                ? t('ops.dash.revenueOther', {
                    list: d.revenueToday.other
                      .map((o) => formatMinor(o.minor, o.currency))
                      .join(' · '),
                  })
                : undefined
            }
            to="/finance"
            icon={Wallet}
          />
          <StatCard
            {...tile}
            label={t('ops.dash.cancellations')}
            value={d?.cancellationsToday ?? 0}
            to={`${paths.reservations}?view=all&state=cancelled`}
            tone="alert"
            zeroLabel={t('ops.dash.zero.cancellations')}
            icon={XCircle}
            className="sm:col-span-2 xl:col-span-1"
          />
        </div>
      </section>

      <TrendsCard locationCode={locationCode} />

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <FleetReadinessCard
          className="lg:col-span-2"
          fleet={d?.fleet}
          loading={loading}
          unavailable={unavailable}
        />
        <FinanceExceptionsCard
          data={d?.financeExceptions}
          loading={loading}
          unavailable={unavailable}
          orgWideNote={Boolean(locationCode)}
        />
      </div>

      <HealthCard />
    </Page>
  );
}
