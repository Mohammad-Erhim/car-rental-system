import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ChipOption {
  value: string;
  label: string;
}

/**
 * Picks ANY number of values from a short list, every one visible — the multi-choice counterpart of
 * `ChoiceTabs`. Nothing chosen means "all" (the caller decides what that means; `allLabel` gives it
 * a chip of its own so "everything" is a visible choice, not an absence).
 */
export function ToggleChips({
  value,
  onChange,
  options,
  label,
  allLabel,
  className,
  testIdPrefix,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: ChipOption[];
  /** accessible name of the group */
  label: string;
  allLabel: string;
  className?: string;
  testIdPrefix?: string;
}) {
  const chip = (checked: boolean) =>
    cn(
      'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      checked
        ? 'border-primary bg-primary/10 text-foreground'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
    );
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      <button
        type="button"
        aria-pressed={value.length === 0}
        className={chip(value.length === 0)}
        onClick={() => onChange([])}
        data-testid={testIdPrefix ? `${testIdPrefix}-all` : undefined}
      >
        {value.length === 0 ? <Check className="size-3.5" aria-hidden="true" /> : null}
        {allLabel}
      </button>
      {options.map((o) => {
        const checked = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={checked}
            className={chip(checked)}
            onClick={() =>
              onChange(checked ? value.filter((v) => v !== o.value) : [...value, o.value])
            }
            data-testid={testIdPrefix ? `${testIdPrefix}-${o.value}` : undefined}
          >
            {checked ? <Check className="size-3.5" aria-hidden="true" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
