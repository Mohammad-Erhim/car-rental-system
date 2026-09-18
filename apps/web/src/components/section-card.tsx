import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * A titled card section: brand-tinted icon chip + title (+ description) on the start, optional
 * actions on the end, then the body. Used for every dashboard-style block so headers align.
 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  className,
  contentClassName,
  children,
  ...rest
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <Card className={cn('flex flex-col', className)} {...rest}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0 p-5 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-[1.125rem]" aria-hidden="true" />
            </span>
          ) : null}
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </CardHeader>
      <CardContent className={cn('flex-1 p-5 pt-0', contentClassName)}>{children}</CardContent>
    </Card>
  );
}
