import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Label/value pairs in a responsive grid (a real `<dl>`). Values that are codes or references
 * should be wrapped by the caller in `.bidi-isolate` so they stay LTR inside RTL pages.
 */
export function DetailList({
  items,
  className,
}: {
  items: Array<{ term: string; detail: ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={cn('grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3', className)}>
      {items.map((it) => (
        <div key={it.term} className="min-w-0 space-y-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {it.term}
          </dt>
          <dd className="text-sm font-medium">{it.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
