import { useI18n } from '@carrental/i18n/react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Inbox,
  Lock,
  RefreshCw,
  SearchX,
  TimerReset,
  TriangleAlert,
  WifiOff,
  type LucideIcon,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

import { Button, type ButtonVariant } from './button';
import { Skeleton } from './skeleton';
import { Text } from './text';

/** The same 12 shared UI states as `@carrental/ui`'s web `AppStateView` (SRS §7.2 / design §4.3)
 *  — every list/panel/screen that can be in one of these renders it through here. */
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

const ICONS: Record<AppStateKind, LucideIcon> = {
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

/** Default copy per kind, pulled from the shared `state.*` catalogue — a caller only needs to
 *  pass `title`/`description` when the generic copy isn't specific enough. */
function useDefaultCopy(kind: AppStateKind): { title: string; description?: string } {
  const { t } = useI18n();
  switch (kind) {
    case 'loading':
      return { title: t('state.loading.title'), description: t('state.loading.body') };
    case 'empty':
      return { title: t('state.empty.title') };
    case 'no-results':
      return { title: t('state.noResults.title'), description: t('state.noResults.body') };
    case 'validation':
      return { title: t('state.validation.title') };
    case 'failure':
      return { title: t('state.failure.title'), description: t('state.failure.body') };
    case 'success':
      return { title: t('state.success.title') };
    case 'unavailable':
      return { title: t('state.unavailable.title'), description: t('state.unavailable.body') };
    case 'permission-denied':
      return { title: t('state.permissionDenied.title'), description: t('state.permissionDenied.body') };
    case 'stale':
      return { title: t('state.stale.title'), description: t('state.stale.body') };
    case 'offline':
      return { title: t('state.offline.title'), description: t('state.offline.body') };
    case 'pending':
      return { title: t('state.pending.title'), description: t('state.pending.body') };
    case 'expired':
      return { title: t('state.expired.title'), description: t('state.expired.body') };
  }
}

export interface AppStateAction {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
}

export interface AppStateViewProps {
  kind: AppStateKind;
  title?: string;
  description?: ReactNode;
  primaryAction?: AppStateAction;
  secondaryAction?: AppStateAction;
  /** Convenience: wraps `primaryAction` with the shared "Try again" label. */
  onRetry?: () => void;
  skeleton?: ReactNode;
  inline?: boolean;
}

export function AppStateView({
  kind,
  title,
  description,
  primaryAction,
  secondaryAction,
  onRetry,
  skeleton,
  inline = false,
}: AppStateViewProps) {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const defaults = useDefaultCopy(kind);
  const resolvedTitle = title ?? defaults.title;
  const resolvedDescription = description ?? defaults.description;
  const resolvedPrimary: AppStateAction | undefined =
    primaryAction ?? (onRetry ? { label: t('action.retry'), onPress: onRetry, variant: undefined } : undefined);

  if (kind === 'loading') {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={resolvedTitle}
        style={{ gap: space(3), paddingVertical: inline ? 0 : space(6) }}
      >
        {skeleton ?? (
          <>
            <Skeleton height={22} width="42%" />
            {[0, 1].map((i) => (
              <View
                key={i}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  padding: space(4),
                  gap: space(2.5),
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
                  <Skeleton height={52} width={72} radius={16} />
                  <View style={{ flex: 1, gap: space(2) }}>
                    <Skeleton height={18} width="70%" />
                    <Skeleton height={14} width="48%" />
                  </View>
                </View>
                <Skeleton height={14} width="92%" />
              </View>
            ))}
          </>
        )}
      </View>
    );
  }

  const Icon = ICONS[kind];
  const tone =
    kind === 'failure' || kind === 'validation'
      ? colors.destructive
      : kind === 'success'
        ? colors.success
        : kind === 'stale' || kind === 'offline' || kind === 'pending' || kind === 'expired'
          ? colors.warning
          : colors.mutedForeground;

  return (
    <View
      accessibilityRole={kind === 'failure' || kind === 'validation' ? 'alert' : 'text'}
      style={{
        alignItems: 'center',
        gap: inline ? space(2) : space(3),
        paddingVertical: inline ? space(4) : space(10),
        paddingHorizontal: space(4),
      }}
    >
      <Icon size={32} color={tone} />
      <Text variant={inline ? 'bodyStrong' : 'h3'} style={{ textAlign: 'center' }}>
        {resolvedTitle}
      </Text>
      {resolvedDescription ? (
        <Text variant="small" color="mutedForeground" style={{ textAlign: 'center', maxWidth: 320 }}>
          {resolvedDescription}
        </Text>
      ) : null}
      {(resolvedPrimary || secondaryAction) && (
        <View style={{ flexDirection: 'row', gap: space(2), marginTop: space(1), flexWrap: 'wrap', justifyContent: 'center' }}>
          {resolvedPrimary && (
            <Button variant={resolvedPrimary.variant ?? 'primary'} size={inline ? 'sm' : 'md'} onPress={resolvedPrimary.onPress}>
              {resolvedPrimary.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant={secondaryAction.variant ?? 'outline'} size={inline ? 'sm' : 'md'} onPress={secondaryAction.onPress}>
              {secondaryAction.label}
            </Button>
          )}
        </View>
      )}
    </View>
  );
}
