import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';

import { cn } from '../lib/utils.js';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', invalid, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex h-[var(--control-h)] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export interface PasswordInputProps extends Omit<InputProps, 'type'> {
  /** accessible label for the reveal toggle when the password is hidden */
  revealLabel: string;
  /** accessible label for the toggle when the password is shown */
  hideLabel: string;
}

/**
 * A password field with the reveal toggle *inside* the input (COMP-SH-004). The toggle sits on
 * the trailing edge via logical properties (`pe-*` / `end-0`), so it lands correctly in both LTR
 * and RTL. Icon-only with an `aria-label` — no layout-shifting "Show" / "Hide" text.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ revealLabel, hideLabel, className, ...props }, ref) => {
    const [shown, setShown] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={shown ? 'text' : 'password'}
          className={cn('pe-11', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? hideLabel : revealLabel}
          title={shown ? hideLabel : revealLabel}
          className={cn(
            'absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-md text-muted-foreground',
            'transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {shown ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
      'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      invalid && 'border-destructive focus-visible:ring-destructive',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
