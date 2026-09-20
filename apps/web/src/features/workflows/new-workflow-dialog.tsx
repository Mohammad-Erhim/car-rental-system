import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { toSpec } from './builder/model';
import { TEMPLATE_IDS, templateDoc, type TemplateId } from './builder/templates';

import { paths } from '@/app/paths';
import { FormDialog } from '@/components/form-dialog';
import { ChoiceField, TextField } from '@/components/form-fields';
import { useCreateDefinition } from '@/lib/workflow-hooks';

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, 'w_')
    .slice(0, 40);

/** Start a workflow from a template — the built-in starting points — then edit it in the builder. */
export function NewWorkflowDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const create = useCreateDefinition();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('error.field.required')).max(120),
        code: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, t('ops.wf.codeInvalid')),
        template: z.enum(TEMPLATE_IDS as [TemplateId, ...TemplateId[]]),
      }),
    [t],
  );
  const defaults = { name: '', code: '', template: 'twoPerson' as TemplateId };
  const form = useForm({ resolver: zodResolver(schema), defaultValues: defaults });
  const name = form.watch('name');
  const codeTouched = !!form.formState.dirtyFields.code;
  // the code follows the name until someone edits it themselves
  useEffect(() => {
    if (!codeTouched) form.setValue('code', slugify(name));
  }, [name, codeTouched, form]);
  return (
    <FormDialog
      open
      size="lg"
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      form={form}
      defaultValues={defaults}
      title={t('ops.wfb.newTitle')}
      description={t('ops.wfb.newBody')}
      submitLabel={t('ops.wfb.create')}
      onSubmit={async (v) => {
        const made = await create.mutateAsync({
          code: v.code,
          name: v.name.trim(),
          spec: toSpec(templateDoc(v.template)),
          note: t('ops.wfb.createdFrom', { template: t(`ops.wfb.template.${v.template}`) }),
        });
        toast.success(t('ops.wfb.created'));
        onClose();
        navigate(paths.workflow(made.id));
      }}
    >
      <ChoiceField
        control={form.control}
        name="template"
        label={t('ops.wfb.startFrom')}
        layout="list"
        testIdPrefix="template"
        options={TEMPLATE_IDS.map((id) => ({
          value: id,
          label: t(`ops.wfb.template.${id}`),
          description: t(`ops.wfb.template.${id}Hint`),
        }))}
      />
      <TextField control={form.control} name="name" label={t('ops.wf.nameLabel')} />
      <TextField control={form.control} name="code" label={t('ops.wf.codeLabel')} />
    </FormDialog>
  );
}
