import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface ChoiceOption {
  value: string;
  label: ReactNode;
  /** a short explanation shown under the label in the `list` layout */
  description?: ReactNode;
  disabled?: boolean;
  testId?: string;
}

/**
 * Picks ONE value — on a form or on a record — as a row of tabs instead of a dropdown, so every
 * choice is visible and one tap away. It is a radio group underneath (arrow keys move and select,
 * the group has one tab stop, screen readers announce "n of m"), styled as pills; the choices wrap
 * onto further lines rather than being hidden behind a menu or a sideways scroll.
 *
 * Use `TabsList`/`StateSwitcher` to switch between *panels of a page*; use this to *choose a value*.
 * Pass `layout="list"` for options that need a sentence of explanation.
 */
export function ChoiceTabs({
  value,
  onChange,
  options,
  label,
  layout = 'pills',
  disabled,
  className,
  testIdPrefix,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  /** accessible name of the group */
  label: string;
  layout?: 'pills' | 'list';
  disabled?: boolean;
  className?: string;
  testIdPrefix?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={onChange}
      aria-label={label}
      disabled={disabled}
      orientation={layout === 'list' ? 'vertical' : 'horizontal'}
      className={cn(
        layout === 'pills'
          ? 'flex flex-wrap gap-1 rounded-lg bg-muted p-1'
          : 'grid gap-2',
        className,
      )}
    >
      {options.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          data-testid={o.testId ?? (testIdPrefix ? `${testIdPrefix}-${o.value}` : undefined)}
          className={cn(
            'text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
            layout === 'pills'
              ? 'min-h-9 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow'
              : 'rounded-lg border p-3 text-sm hover:bg-accent/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 data-[state=checked]:ring-1 data-[state=checked]:ring-primary',
          )}
        >
          {layout === 'pills' ? (
            o.label
          ) : (
            <span className="block">
              <span className="block font-medium">{o.label}</span>
              {o.description ? (
                <span className="mt-0.5 block text-muted-foreground">{o.description}</span>
              ) : null}
            </span>
          )}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
