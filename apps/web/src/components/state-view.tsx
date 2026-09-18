import { AlertTriangle, Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Empty / error placeholder for a section or a whole screen. Loading is not a state view — use
 * `Skeleton` shaped like the content so the layout doesn't jump.
 */
export function StateView({
  kind = 'empty',
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  children,
  ...rest
}: {
  kind?: 'empty' | 'error';
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  const Icon = icon ?? (kind === 'error' ? AlertTriangle : Inbox);
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      {...rest}
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 py-10 text-center',
        className,
      )}
    >
      <span
        className={cn(
          'grid size-12 place-items-center rounded-full',
          kind === 'error'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
      {children}
    </div>
  );
}
