import type { ReactNode } from 'react';

import { cn } from '../lib/utils.js';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** primary action(s), right-aligned on wide screens */
  actions?: ReactNode;
  /** breadcrumb / eyebrow line above the title */
  eyebrow?: ReactNode;
  className?: string;
}

/**
 * Consistent screen header for the operations dashboard (design §7.3): eyebrow, title,
 * one-line description, and an actions slot. Wraps cleanly on phones.
 */
export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
