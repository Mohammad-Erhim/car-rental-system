import { useI18n } from '@carrental/i18n/react';

import { Badge } from '@/components/ui/badge';
import type { RatePlan } from '@/lib/ops-discovery-hooks';

/** Plan lifecycle as a badge (text label always shown). */
export function PlanStatus({ status }: { status: RatePlan['status'] }) {
  const { t } = useI18n();
  const variant =
    status === 'published' ? 'success' : status === 'retired' ? 'secondary' : 'warning';
  return <Badge variant={variant}>{t(`ops.cfg.state.${status}`)}</Badge>;
}
