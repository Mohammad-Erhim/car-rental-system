import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Page frame: constrains width on very large screens and gives every screen the same vertical
 * rhythm. The routed page renders `<Page><PageHeader …/>…sections…</Page>`.
 */
export function Page({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-[1600px] space-y-6', className)} {...props} />;
}

/**
 * The top of every screen: title, one-line description, optional meta row (scope, freshness …)
 * and the page's primary actions. Stacks on small screens; actions wrap under the title.
 * Exactly one `<h1>` per screen lives here.
 */
export function PageHeader({
  title,
  badge,
  description,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  /** a status pill shown beside the title */
  badge?: ReactNode;
  description?: ReactNode;
  /** small, muted facts under the description */
  meta?: ReactNode;
  /** buttons / menus aligned to the end */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          // a div, not a <p>: callers pass rich content (links, badges)
          <div className="max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</div>
        ) : null}
        {meta ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
