import { useI18n } from '@carrental/i18n/react';

import { Badge } from '@/components/ui/badge';

/** Active / inactive marker for catalogue records that are deactivated rather than deleted. */
export function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useI18n();
  return (
    <Badge variant={active ? 'success' : 'secondary'}>
      {active ? t('ops.cat.active') : t('ops.cat.inactive')}
    </Badge>
  );
}
