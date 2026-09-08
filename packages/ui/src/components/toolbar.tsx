import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

/**
 * The filter / action row above a `DataTable` (STAGE-012). Consistent wrap + spacing; `end`
 * pushes trailing content (a primary action) to the far side.
 */
export function Toolbar({
  children,
  end,
  className,
  'aria-label': ariaLabel,
}: {
  children?: ReactNode;
  end?: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', end && 'justify-between', className)}
      role="group"
      aria-label={ariaLabel}
    >
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {end ? <div className="flex flex-wrap items-center gap-2">{end}</div> : null}
    </div>
  );
}
