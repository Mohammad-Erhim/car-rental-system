import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { undeclaredVars } from './template-model';

import { TextareaField, TextField } from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useSaveTemplateDraft, type TemplateDetail, type TemplateVar } from '@/lib/admin-hooks';

interface Values {
  subject: string;
  body: string;
  variables: Array<{ name: string; required: boolean; legal: boolean }>;
}

/**
 * Write the subject, body and declared variables of one template in one language, saved as a
 * draft. Every `{{placeholder}}` used in the text has to be declared as a variable — the API
 * refuses the draft otherwise, so the form catches it first.
 */
export function TemplateSheet({
  templateKey,
  channel,
  locale,
  detail,
  open,
  onOpenChange,
}: {
  templateKey: string;
  channel: string;
  locale: string;
  /** null when this language has no row yet — start blank */
  detail: TemplateDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const save = useSaveTemplateDraft();

  const schema = useMemo(
    () =>
      z
        .object({
          subject: z.string(),
          body: z.string().trim().min(1, t('error.field.required')),
          variables: z.array(
            z.object({
              name: z.string().trim().min(1, t('error.field.required')),
              required: z.boolean(),
              legal: z.boolean(),
            }),
          ),
        })
        .superRefine((v, ctx) => {
          const missing = undeclaredVars(v.subject, v.body, v.variables);
          if (missing.length) {
            ctx.addIssue({
              code: 'custom',
              path: ['body'],
              message: t('ops.tpl.undeclared', { list: missing.join(', ') }),
            });
          }
        }),
    [t],
  );
  const defaults: Values = {
    subject: detail?.subject ?? '',
    body: detail?.bodyTemplate ?? '',
    variables: (detail?.variables ?? []).map((v) => ({
      name: v.name,
      required: !!v.required,
      legal: !!v.legal,
    })),
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const vars = useFieldArray({ control: form.control, name: 'variables' });
  const [subject, body, variables] = form.watch(['subject', 'body', 'variables']);
  const missing = undeclaredVars(subject, body, variables);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      size="lg"
      title={t('ops.tpl.editTitle', { locale: locale.toUpperCase() })}
      description={
        <span className="bidi-isolate font-mono text-xs">
          {templateKey} · {channel}
        </span>
      }
      submitLabel={t('ops.tpl.saveDraft')}
      onSubmit={async (v) => {
        await save.mutateAsync({
          key: templateKey,
          channel,
          localeCode: locale,
          subject: v.subject || null,
          bodyTemplate: v.body,
          variables: v.variables.map<TemplateVar>((x) => ({
            name: x.name.trim(),
            ...(x.required ? { required: true } : {}),
            ...(x.legal ? { legal: true } : {}),
          })),
        });
        toast.success(t('ops.tpl.draftSaved'));
      }}
    >
      <FormSection title={t('ops.tpl.secContent')}>
        <TextField
          control={form.control}
          name="subject"
          label={t('ops.tpl.subject')}
          autoFocus
          data-testid="tpl-subject"
        />
        <TextareaField
          control={form.control}
          name="body"
          label={t('ops.tpl.body')}
          description={t('ops.tpl.bodyHint')}
          rows={12}
          className="[&_textarea]:font-mono [&_textarea]:text-[13px]"
          data-testid="tpl-body"
        />
      </FormSection>

      <FormSection title={t('ops.tpl.variables')} hint={t('ops.tpl.variablesHint')}>
        {vars.fields.length ? (
          <ul className="divide-y rounded-lg border">
            {vars.fields.map((f, i) => (
              <li key={f.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 p-3">
                <TextField
                  control={form.control}
                  name={`variables.${i}.name`}
                  label={t('ops.tpl.varName')}
                  className="min-w-[10rem] flex-1 [&>label]:sr-only"
                  data-testid="tpl-var-name"
                />
                <div className="flex items-center gap-4 pt-2.5">
                  {(['required', 'legal'] as const).map((flag) => (
                    <label key={flag} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.watch(`variables.${i}.${flag}`)}
                        onCheckedChange={(c) =>
                          form.setValue(`variables.${i}.${flag}`, c === true, { shouldDirty: true })
                        }
                      />
                      {t(`ops.tpl.${flag}`)}
                    </label>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('action.remove')}
                    onClick={() => vars.remove(i)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => vars.append({ name: '', required: false, legal: false })}
          data-testid="tpl-add-var"
        >
          <Plus aria-hidden="true" />
          {t('ops.tpl.addVariable')}
        </Button>
        {missing.length ? (
          <Alert variant="destructive" data-testid="tpl-undeclared">
            <AlertDescription>
              {t('ops.tpl.undeclared', { list: missing.join(', ') })}
            </AlertDescription>
          </Alert>
        ) : null}
      </FormSection>
    </FormSheet>
  );
}
