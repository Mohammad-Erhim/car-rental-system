import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  FileQuestion,
  Inbox,
  Lock,
  RefreshCw,
  SearchX,
  TimerReset,
  TriangleAlert,
  WifiOff,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

import { Button } from './button';
import { Skeleton } from './skeleton';

/**
 * The 12 shared UI states (SRS §7.2 / design §4.3). Every route/list/panel that can be in one
 * of these states renders it through this component so the pattern is consistent and testable
 * (`data-appstate` is the stable locator, SRS-UI-011).
 */
export type AppStateKind =
  | 'loading'
  | 'empty'
  | 'no-results'
  | 'validation'
  | 'failure'
  | 'success'
  | 'unavailable'
  | 'permission-denied'
  | 'stale'
  | 'offline'
  | 'pending'
  | 'expired';

const ICONS: Record<AppStateKind, typeof Inbox> = {
  loading: RefreshCw,
  empty: Inbox,
  'no-results': SearchX,
  validation: TriangleAlert,
  failure: AlertTriangle,
  success: CheckCircle2,
  unavailable: Ban,
  'permission-denied': Lock,
  stale: RefreshCw,
  offline: WifiOff,
  pending: Clock3,
  expired: TimerReset,
};

export interface AppStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive';
}

export interface AppStateViewProps {
  kind: AppStateKind;
  title: string;
  /** What happened + what did NOT change + what the user can do (SRS-UI-003, FR-GBL-005). */
  description?: ReactNode;
  primaryAction?: AppStateAction;
  secondaryAction?: AppStateAction;
  /** For `loading`: render skeleton rows matching the final layout instead of the icon block. */
  skeleton?: ReactNode;
  className?: string;
  /** Compact inline placement (e.g. inside a card) vs. full-height page block. */
  inline?: boolean;
}

export function AppStateView({
  kind,
  title,
  description,
  primaryAction,
  secondaryAction,
  skeleton,
  className,
  inline = false,
}: AppStateViewProps) {
  if (kind === 'loading') {
    return (
      <div
        data-appstate="loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={cn('w-full', inline ? '' : 'py-8', className)}
      >
        <span className="sr-only">{title}</span>
        {skeleton ?? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </div>
    );
  }

  const Icon = ICONS[kind];
  const tone =
    kind === 'failure' || kind === 'validation'
      ? 'text-destructive'
      : kind === 'success'
        ? 'text-success'
        : kind === 'stale' || kind === 'offline' || kind === 'pending' || kind === 'expired'
          ? 'text-warning'
          : 'text-muted-foreground';

  return (
    <div
      data-appstate={kind}
      role={kind === 'failure' || kind === 'validation' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col items-center text-center',
        inline ? 'gap-2 py-6' : 'gap-3 py-12',
        className,
      )}
    >
      <Icon className={cn('size-8', tone)} aria-hidden="true" />
      <h2 className={cn('font-semibold', inline ? 'text-base' : 'text-lg')}>{title}</h2>
      {description ? (
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      ) : null}
      {(primaryAction || secondaryAction) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {primaryAction && (
            <Button
              variant={primaryAction.variant ?? 'default'}
              size={inline ? 'sm' : 'default'}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant ?? 'outline'}
              size={inline ? 'sm' : 'default'}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
      {kind === 'permission-denied' && <FileQuestion className="sr-only" aria-hidden="true" />}
    </div>
  );
}
