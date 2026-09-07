import { AlertCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { cn } from '../lib/utils.js';

export interface FieldErrorItem {
  /** field id to focus + anchor */
  id: string;
  message: string;
}

/**
 * COMP-SH-005 error summary. On mount / when errors change it takes focus and each item links
 * to its field (SRS-UI-007, design §12.1). Render it above the form.
 */
export function ErrorSummary({
  title,
  errors,
  className,
}: {
  title: string;
  errors: FieldErrorItem[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (errors.length) ref.current?.focus();
  }, [errors]);

  if (!errors.length) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      data-testid="error-summary"
      className={cn(
        'rounded-md border border-destructive/50 bg-destructive/10 p-4 outline-none focus-visible:ring-2 focus-visible:ring-destructive',
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium text-destructive">
        <AlertCircle className="size-4" aria-hidden="true" />
        {title}
      </p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
        {errors.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              className="underline"
              onClick={(ev) => {
                ev.preventDefault();
                const el = document.getElementById(e.id);
                el?.focus();
                el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
              }}
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
