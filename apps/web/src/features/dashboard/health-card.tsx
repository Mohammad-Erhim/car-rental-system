import { useI18n } from '@carrental/i18n/react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CircleSlash, Activity, type LucideIcon } from 'lucide-react';

import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Skeleton } from '@/components/ui/skeleton';
import { metaApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS: Record<string, { icon: LucideIcon; className: string }> = {
  ok: { icon: CheckCircle2, className: 'text-success' },
  degraded: { icon: AlertTriangle, className: 'text-warning' },
  down: { icon: AlertTriangle, className: 'text-destructive' },
};

/**
 * Live dependency health (the header status chip links here). Unknown/failed reads are shown as
 * unknown, never as healthy.
 */
export function HealthCard() {
  const { t, fmt } = useI18n();
  const health = useQuery({
    queryKey: ['meta', 'health-summary'],
    queryFn: ({ signal }) => metaApi.healthSummary(signal),
    refetchInterval: 30_000,
  });

  return (
    <SectionCard
      id="ops-dash-health"
      className="scroll-mt-24"
      title={t('ops.dash.health')}
      icon={Activity}
      description={
        health.data
          ? t('ops.dash.checkedAt', { time: fmt.time(health.data.checkedAt) })
          : t('ops.dash.checking')
      }
    >
      {health.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : health.isError || !health.data ? (
        <StateView
          kind="error"
          title={t('state.failure.title')}
          description={t('ops.dash.healthUnread')}
          actionLabel={t('action.retry')}
          onAction={() => void health.refetch()}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="health-components">
          {health.data.components.map((c) => {
            const s = STATUS[c.status] ?? { icon: CircleSlash, className: 'text-muted-foreground' };
            return (
              <li
                key={c.name}
                data-component={c.name}
                data-status={c.status}
                className="flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-sm"
              >
                <span
                  className={cn(
                    'truncate font-medium',
                    c.name.length <= 3 ? 'uppercase' : 'capitalize',
                  )}
                >
                  {c.name}
                </span>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 font-medium',
                    s.className,
                  )}
                >
                  <s.icon className="size-4" aria-hidden="true" />
                  {c.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
