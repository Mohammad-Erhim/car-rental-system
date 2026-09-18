import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { TextareaField } from '@/components/form-fields';
import { useResolveCase, useResolveException } from '@/lib/finance-hooks';

export type ResolveTarget = { type: 'case' | 'exception'; id: string };

/**
 * Close a recovery case or a reconciliation exception. A note is required — it becomes part of
 * the audit trail, and nothing is ever closed silently.
 */
export function ResolveDialog({
  target,
  open,
  onOpenChange,
}: {
  target: ResolveTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const resolveCase = useResolveCase();
  const resolveException = useResolveException();
  const schema = useMemo(
    () => z.object({ note: z.string().trim().min(1, t('ops.fin.noteRequired')) }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { note: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.fin.resolveTitle')}
      description={t('ops.fin.resolveBody')}
      submitLabel={t('ops.fin.resolve')}
      onSubmit={async ({ note }) => {
        const input = { id: target.id, note: note.trim() };
        if (target.type === 'case') await resolveCase.mutateAsync(input);
        else await resolveException.mutateAsync(input);
        toast.success(t('ops.fin.resolved'));
      }}
    >
      <TextareaField
        control={form.control}
        name="note"
        label={t('ops.fin.resolutionNote')}
        rows={4}
        data-testid="finance-resolve-note"
      />
    </FormDialog>
  );
}
