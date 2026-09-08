import { useId, type ReactNode } from 'react';

import { cn } from '../lib/utils.js';
import { useUiStrings } from '../providers/ui-strings.js';

import { Label } from './label.js';

export interface FieldProps {
  label: ReactNode;
  /** stable id/name used for label association + error anchoring (SRS-UI-007) */
  htmlFor?: string;
  required?: boolean;
  /** format hint shown BEFORE the input (design §13.2) */
  hint?: ReactNode;
  /** validation error — associated via aria-describedby, shown inline */
  error?: string | null;
  /** overrides the "(optional)" suffix; defaults to the localized value from `UiStringsProvider` */
  optionalText?: string;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/**
 * COMP-SH-005 field wrapper: visible label, hint before input, inline error with correction
 * text, and aria wiring. Errors do not clear valid input (caller's responsibility).
 */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  optionalText,
  className,
  children,
}: FieldProps) {
  const ui = useUiStrings();
  const optional = optionalText ?? ui.optional;
  const generated = useId();
  const id = htmlFor ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} required={required}>
        {label}
        {!required ? (
          <span className="ms-1 text-xs font-normal text-muted-foreground">({optional})</span>
        ) : null}
      </Label>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children({ id, describedBy, invalid: !!error })}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
