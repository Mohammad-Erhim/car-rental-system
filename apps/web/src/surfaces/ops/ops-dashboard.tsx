import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@carrental/ui';
import { useQuery } from '@tanstack/react-query';

import { metaApi } from '../../lib/api.js';

/**
 * SCREEN-OPS-002 (foundation slice). Real dashboard metrics land per-stage; for now it proves
 * the ops shell, the health drill, and that unavailable data is labelled, never shown as zero
 * (FR-RPT-001).
 */
export function OpsDashboard() {
  const { t, fmt } = useI18n();
  const health = useQuery({
    queryKey: ['meta', 'health-summary'],
    queryFn: ({ signal }) => metaApi.healthSummary(signal),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('ops.dash.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('ops.dash.subtitle')}</p>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            'ops.dash.pickups',
            'ops.dash.returns',
            'ops.dash.overdue',
            'ops.dash.financeExceptions',
          ] as const
        ).map((label) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{t(label)}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground" data-testid="metric-unavailable">
                {t('ops.dash.metricPending')}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
