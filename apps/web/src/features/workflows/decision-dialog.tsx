import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { TextareaField } from '@/components/form-fields';
import type { WorkflowDecision } from '@/lib/workflow-hooks';

/** Approve / reject / send back / complete — with a comment that is required when the step says so. */
export function DecisionDialog({
  open,
  onOpenChange,
  decision,
  subject,
  requireComment,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: WorkflowDecision;
  subject: string;
  requireComment: boolean;
  onSubmit: (comment: string) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const mustComment = requireComment && decision !== 'approve';
  const schema = useMemo(
    () =>
      z.object({
        comment: mustComment
          ? z.string().trim().min(1, t('ops.wf.commentRequired'))
          : z.string().trim().max(2000),
      }),
    [mustComment, t],
  );
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { comment: '' } });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{ comment: '' }}
      destructive={decision === 'reject'}
      title={t(`ops.wf.dialog.${decision}`)}
      description={subject}
      submitLabel={t(`ops.wf.do.${decision}`)}
      onSubmit={(v) => onSubmit(v.comment.trim())}
    >
      <TextareaField
        control={form.control}
        name="comment"
        label={t(mustComment ? 'ops.wf.commentLabelRequired' : 'ops.wf.commentLabel')}
        rows={3}
        autoFocus
        data-testid="wf-comment"
      />
    </FormDialog>
  );
}
