import { useI18n } from '@carrental/i18n/react';
import { CarFront, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Fleet {
  available: number;
  on_rent: number;
  prep: number;
  maintenance: number;
}

const STATES = [
  {
    key: 'available',
    labelKey: 'ops.dash.fleet.available',
    bar: 'bg-success',
    text: 'text-success',
  },
  { key: 'on_rent', labelKey: 'ops.dash.fleet.onRent', bar: 'bg-primary', text: 'text-primary' },
  { key: 'prep', labelKey: 'ops.dash.fleet.prep', bar: 'bg-warning', text: 'text-warning' },
  {
    key: 'maintenance',
    labelKey: 'ops.dash.fleet.maintenance',
    bar: 'bg-destructive',
    text: 'text-destructive',
  },
] as const;

/** Where the fleet is right now: a proportional bar plus one drill-down tile per state. */
export function FleetReadinessCard({
  fleet,
  loading,
  unavailable,
  className,
}: {
  className?: string;
  fleet: Fleet | undefined;
  loading: boolean;
  unavailable: boolean;
}) {
  const { t } = useI18n();
  const total = fleet ? STATES.reduce((n, s) => n + fleet[s.key], 0) : 0;

  return (
    <SectionCard
      title={t('ops.dash.fleetReadiness')}
      icon={CarFront}
      className={className}
      actions={
        <Link
          to="/fleet"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
        >
          {t('ops.dash.view')}
          <ChevronRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      }
    >
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-2.5 w-full rounded-full" />
          <div className="grid grid-cols-2 gap-3">
            {STATES.map((s) => (
              <Skeleton key={s.key} className="h-[3.75rem]" />
            ))}
          </div>
        </div>
      ) : unavailable || !fleet ? (
        <StateView kind="error" title={t('ops.dash.unavailable')} className="py-6" />
      ) : (
        <div className="space-y-4">
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={STATES.map((s) => `${t(s.labelKey)}: ${fleet[s.key]}`).join(', ')}
          >
            {STATES.map((s) =>
              fleet[s.key] > 0 ? (
                <span
                  key={s.key}
                  className={cn('h-full', s.bar)}
                  style={{ width: `${(fleet[s.key] / total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <ul className="grid grid-cols-2 gap-3" data-testid="ops-dash-fleet">
            {STATES.map((s) => (
              <li key={s.key}>
                <Link
                  to={`/fleet?state=${s.key}`}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3.5 py-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent/50"
                >
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <span
                      className={cn('size-2 shrink-0 rounded-full', s.bar)}
                      aria-hidden="true"
                    />
                    <span className="truncate">{t(s.labelKey)}</span>
                  </span>
                  <span className={cn('text-lg font-semibold tabular-nums', s.text)}>
                    {fleet[s.key]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
