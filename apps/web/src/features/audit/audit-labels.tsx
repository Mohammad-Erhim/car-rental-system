import { useI18n } from '@carrental/i18n/react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { labelFor, type LabelI18n } from '@/lib/labels';

const OUTCOME_TONE: Record<string, BadgeProps['variant']> = {
  accepted: 'success',
  rejected: 'warning',
  failed: 'destructive',
};

/** "accepted" / "rejected" / "failed" as a translated badge. */
export function OutcomeBadge({ outcome }: { outcome: string }) {
  const i18n = useI18n();
  return (
    <Badge variant={OUTCOME_TONE[outcome] ?? 'secondary'}>
      {labelFor(i18n, `ops.audit.outcome.${outcome}`, outcome)}
    </Badge>
  );
}

// the module a code starts with is an internal name, not something a person would say
const INTERNAL_PREFIX = /^(iam|admin|config|booking|pricing|media|notify|organization)\./;

/** What happened, in words: a translated sentence for known actions, else the code made readable. */
export function actionLabel(i18n: LabelI18n, action: string): string {
  return labelFor(i18n, `ops.audit.act.${action}`, action.replace(INTERNAL_PREFIX, ''));
}

/** The kind of record an event is about ("config_version" → "Config version"). */
export function targetLabel(i18n: LabelI18n, type: string): string {
  return labelFor(i18n, `ops.audit.target.${type}`, type);
}
