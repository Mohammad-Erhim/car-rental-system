import { useI18n } from '@carrental/i18n/react';

import { Badge, type BadgeProps } from '@/components/ui/badge';

/**
 * Reservation + rental lifecycle states → badge tone. The label is always text (never colour
 * alone, FR-GBL-007); an unknown state gets the i18n layer's humane fallback ("on_hold" → "On hold")
 * and is reported through `onMissingKey`, so a new backend state is noticed rather than hidden.
 */
const TONE: Record<string, BadgeProps['variant']> = {
  pending: 'warning',
  awaiting_pickup: 'warning',
  confirmed: 'default',
  active: 'default',
  fulfilled: 'success',
  closed: 'success',
  cancelled: 'secondary',
  no_show: 'destructive',
  overdue: 'destructive',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useI18n();
  return (
    <Badge variant={TONE[status] ?? 'secondary'} className={className}>
      {t(`ops.status.${status}`)}
    </Badge>
  );
}
