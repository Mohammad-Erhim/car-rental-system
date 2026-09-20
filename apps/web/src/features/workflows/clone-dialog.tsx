import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { paths } from '@/app/paths';
import { FormDialog } from '@/components/form-dialog';
import { TextField } from '@/components/form-fields';
import { useCloneDefinition } from '@/lib/workflow-hooks';

/** Make an editable copy of any workflow (including the built-in ones) and open it in the builder. */
export function CloneDialog({
  def,
  onClose,
}: {
  def: { id: string; name: string; code: string };
  onClose: () => void;
}) {
  const { t } = useI18n();
  const clone = useCloneDefinition();
  const navigate = useNavigate();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('ops.wf.commentRequired')).max(120),
        code: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, t('ops.wf.codeInvalid')),
      }),
    [t],
  );
  const defaults = { name: `${def.name} (copy)`, code: `${def.code}_copy`.slice(0, 40) };
  const form = useForm({ resolver: zodResolver(schema), defaultValues: defaults });
  return (
    <FormDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      form={form}
      defaultValues={defaults}
      title={t('ops.wf.cloneTitle', { name: def.name })}
      description={t('ops.wf.cloneBody')}
      submitLabel={t('ops.wf.clone')}
      onSubmit={async (v) => {
        const made = await clone.mutateAsync({ id: def.id, code: v.code, name: v.name.trim() });
        toast.success(t('ops.wf.cloned'));
        onClose();
        navigate(paths.workflow(made.id));
      }}
    >
      <TextField control={form.control} name="name" label={t('ops.wf.nameLabel')} />
      <TextField control={form.control} name="code" label={t('ops.wf.codeLabel')} />
    </FormDialog>
  );
}
