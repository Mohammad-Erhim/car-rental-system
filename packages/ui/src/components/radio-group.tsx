import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';
import { forwardRef } from 'react';

import { cn } from '../lib/utils.js';

/**
 * Visible radio group — for a small mutually-exclusive set the user should compare
 * (design UI-DEC-001/006/015). Not a dropdown.
 */
export const RadioGroup = forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-2', className)} {...props} />
));
RadioGroup.displayName = 'RadioGroup';

export const RadioGroupItem = forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'aspect-square size-5 rounded-full border border-input text-primary ring-offset-background',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle className="size-2.5 fill-current text-current" aria-hidden="true" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = 'RadioGroupItem';

/** Convenience: a labelled row of radio options. */
export function RadioCardOption({
  value,
  id,
  title,
  description,
}: {
  value: string;
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
    >
      <RadioGroupItem value={value} id={id} className="mt-0.5" />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        {description ? (
          <span className="block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
