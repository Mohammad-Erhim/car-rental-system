import { CheckCircle2, ChevronRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'alert';

/**
 * A KPI tile that is *entirely* a link to `to` (a pre-filtered queue). Three honest states:
 * loading (skeleton), unavailable (a read error shows text, never `0`, FR-RPT-001) and a value.
 * With `tone="alert"` a non-zero value turns destructive and zero becomes a reassuring all-clear.
 */
export function StatCard({
  label,
  value,
  hint,
  to,
  icon: Icon,
  tone = 'neutral',
  zeroLabel,
  loading,
  unavailable,
  viewLabel,
  unavailableLabel,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  to: string;
  icon: LucideIcon;
  tone?: Tone;
  /** shown instead of the number when an `alert` tile is at zero */
  zeroLabel?: string;
  loading?: boolean;
  unavailable?: boolean;
  viewLabel: string;
  unavailableLabel: string;
  className?: string;
}) {
  const numeric = typeof value === 'number' ? value : Number(value);
  const known = !loading && !unavailable && Number.isFinite(numeric);
  const isAlerting = tone === 'alert' && known && numeric > 0;
  const isClear = tone === 'alert' && known && numeric === 0;

  return (
    <Link
      to={to}
      data-testid="ops-stat-card"
      className={cn(
        'group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <Card className="flex h-full flex-col justify-between gap-4 p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-lg',
              isAlerting
                ? 'bg-destructive/10 text-destructive'
                : isClear
                  ? 'bg-success/10 text-success'
                  : 'bg-primary/10 text-primary',
            )}
          >
            <Icon className="size-[1.125rem]" aria-hidden="true" />
          </span>
        </div>

        <div className="min-h-[3.25rem] space-y-1">
          {loading ? (
            <>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3.5 w-28" />
            </>
          ) : unavailable ? (
            <p className="text-sm text-muted-foreground" data-testid="metric-unavailable">
              {unavailableLabel}
            </p>
          ) : isClear ? (
            <p className="flex items-center gap-1.5 pt-1 text-base font-semibold text-success">
              <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
              {zeroLabel}
            </p>
          ) : (
            <>
              <p
                className={cn(
                  'text-3xl font-bold tabular-nums tracking-tight',
                  isAlerting && 'text-destructive',
                )}
              >
                {value}
              </p>
              {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
            </>
          )}
        </div>

        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
          {viewLabel}
          <ChevronRight
            className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </Card>
    </Link>
  );
}
