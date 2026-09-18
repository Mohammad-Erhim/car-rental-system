import { cn } from '@/lib/utils';

export interface CountPill {
  value: string;
  label: string;
  count: number | undefined;
}

/**
 * A wrapping row of "label + count" filter pills — the whole shape of a list at a glance, with
 * the selected one highlighted. Wraps instead of scrolling, so it works at any width.
 */
export function CountPills({
  pills,
  value,
  onChange,
  label,
  className,
}: {
  pills: CountPill[];
  value: string;
  onChange: (value: string) => void;
  /** accessible name of the group */
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {pills.map((p) => {
        const active = p.value === value;
        return (
          <button
            key={p.value || 'all'}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(p.value)}
            data-testid={`pill-${p.value || 'all'}`}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {p.label}
            {p.count === undefined ? null : (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs font-semibold tabular-nums',
                  active ? 'bg-primary-foreground/20' : 'bg-muted text-foreground',
                )}
              >
                {p.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
