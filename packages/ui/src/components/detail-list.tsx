import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

export interface DetailItem {
  /** label (already localised) */
  term: ReactNode;
  /** value */
  detail: ReactNode;
  /** span both columns (long value / description) */
  wide?: boolean;
}

/**
 * Key/value detail block (STAGE-012) — the `<dl>` grid the ops detail panels (reservation,
 * rate plan, config version, rental) were each re-implementing. Responsive: one column on
 * phones, two from `sm`.
 */
export function DetailList({
  items,
  className,
  testid,
}: {
  items: DetailItem[];
  className?: string;
  testid?: string;
}) {
  return (
    <dl className={cn('grid gap-3 sm:grid-cols-2', className)} data-testid={testid}>
      {items.map((it, i) => (
        <div key={i} className={cn('min-w-0', it.wide && 'sm:col-span-2')}>
          <dt className="text-xs text-muted-foreground">{it.term}</dt>
          <dd className="mt-0.5 text-sm font-medium">{it.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
