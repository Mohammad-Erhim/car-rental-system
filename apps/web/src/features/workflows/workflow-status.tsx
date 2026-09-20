import { useI18n } from '@carrental/i18n/react';
import { Hourglass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { paths } from '@/app/paths';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { WorkflowStatus, WorkflowSummary } from '@/lib/workflow-hooks';

const TONE: Record<WorkflowStatus, BadgeProps['variant']> = {
  running: 'warning',
  applying: 'warning',
  apply_failed: 'destructive',
  completed: 'success',
  rejected: 'destructive',
  withdrawn: 'secondary',
  cancelled: 'secondary',
  changes_requested: 'warning',
  stale: 'secondary',
};

export function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  const { t } = useI18n();
  return <Badge variant={TONE[status] ?? 'secondary'}>{t(`ops.wf.status.${status}`)}</Badge>;
}

/** "Waiting for Finance · step 2" — the pending request on a record, linking to it. */
export function WorkflowBadge({ summary }: { summary: WorkflowSummary | null | undefined }) {
  const { t } = useI18n();
  if (
    !summary ||
    (summary.status !== 'running' &&
      summary.status !== 'applying' &&
      summary.status !== 'apply_failed')
  ) {
    return null;
  }
  const who = [
    ...summary.waitingFor,
    ...(summary.waitingForMore ? [t('ops.wf.andMore', { n: summary.waitingForMore })] : []),
  ].join(', ');
  return (
    <Link
      to={paths.request(summary.instanceId)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-warning/20"
      data-testid="workflow-badge"
    >
      <Hourglass className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {summary.status === 'apply_failed'
          ? t('ops.wf.applyFailedShort')
          : who
            ? t('ops.wf.waitingFor', { step: summary.stepName ?? summary.definitionName, who })
            : t('ops.wf.waitingNoOne', { step: summary.stepName ?? summary.definitionName })}
      </span>
    </Link>
  );
}
