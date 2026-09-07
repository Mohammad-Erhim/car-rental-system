import type { HTMLAttributes } from 'react';

import { cn } from '../lib/utils';

/** STATE-LOADING primitive — must match the final layout footprint (SRS §7.2). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      aria-hidden="true"
      {...props}
    />
  );
}
