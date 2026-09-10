import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '../lib/utils.js';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** A single option for {@link LookupSelect}, fed from a reference-data type. */
export interface LookupOption {
  code: string;
  label: string;
}

/** Styled native `<select>` — matches {@link Input}. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex h-[var(--control-h)] w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';

export interface LookupOption {
  code: string;
  label: string;
}

/**
 * A `<select>` fed by a reference-data option list. Presentational only — the caller supplies
 * `options` (and `loading` / `error`) from a data hook, so both apps share the control while
 * their data layer stays app-local.
 */
export function LookupSelect({
  options,
  value,
  onChange,
  loading,
  error,
  onRetry,
  id,
  describedBy,
  invalid,
  disabled,
  placeholder = 'Select…',
  loadingLabel = 'Loading…',
  errorLabel = 'Could not load the options.',
  retryLabel = 'Retry',
  className,
}: {
  options: LookupOption[];
  value: string;
  onChange: (code: string) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  loadingLabel?: string;
  errorLabel?: string;
  retryLabel?: string;
  className?: string;
}) {
  if (error) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-destructive">{errorLabel}</p>
        {onRetry ? (
          <button type="button" className="text-sm underline" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <Select
      id={id}
      aria-describedby={describedBy}
      invalid={invalid}
      disabled={disabled || loading}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">{loading ? loadingLabel : placeholder}</option>
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
