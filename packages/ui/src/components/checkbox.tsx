import { Check } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '../lib/utils.js';

/**
 * Native checkbox styled. Checkbox semantics = "applies on submit" (design UI-DEC-005).
 * For an immediate-effect toggle use a switch instead.
 */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, ...props }, ref) => (
  <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'peer size-5 cursor-pointer appearance-none rounded border border-input bg-background',
        'checked:border-primary checked:bg-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
    <Check
      className="pointer-events-none absolute size-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100"
      aria-hidden="true"
    />
  </span>
));
Checkbox.displayName = 'Checkbox';
