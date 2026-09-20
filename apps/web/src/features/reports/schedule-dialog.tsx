import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { reportTitle } from './report-columns';
import { CRON_PRESETS, parseRecipients, recipientsValid } from './report-model';

import { FormDialog } from '@/components/form-dialog';
import { ChoiceField, TextareaField, TextField } from '@/components/form-fields';
import { useScheduleReport, type ReportDefinition } from '@/lib/admin-hooks';

interface Values {
  definitionCode: string;
  preset: string;
  cron: string;
  recipients: string;
}

const CUSTOM = 'custom';

/** Deliver a report by email on a schedule. The cron is picked from presets or written out. */
export function ScheduleDialog({
  definitions,
  defaultCode,
  open,
  onOpenChange,
}: {
  definitions: ReportDefinition[];
  defaultCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const schedule = useScheduleReport();

  const schema = useMemo(
    () =>
      z.object({
        definitionCode: z.string().min(1, t('error.field.required')),
        preset: z.string(),
        cron: z
          .string()
          .trim()
          .refine((v) => v.split(/\s+/).length === 5, { message: t('ops.rpt.cronInvalid') }),
        recipients: z.string().refine((v) => recipientsValid(parseRecipients(v)), {
          message: t('ops.rpt.recipientsInvalid'),
        }),
      }),
    [t],
  );
  const defaults: Values = {
    definitionCode: defaultCode,
    preset: CRON_PRESETS[0].value,
    cron: CRON_PRESETS[0].value,
    recipients: '',
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const preset = form.watch('preset');
  // choosing a preset writes its cron; typing in the cron box switches the preset to custom
  useEffect(() => {
    if (preset !== CUSTOM)
      form.setValue('cron', preset, { shouldValidate: form.formState.isSubmitted });
  }, [preset, form]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.rpt.newSchedule')}
      description={t('ops.rpt.needExportHint')}
      submitLabel={t('ops.rpt.scheduleAction')}
      onSubmit={async (v) => {
        await schedule.mutateAsync({
          definitionCode: v.definitionCode,
          cron: v.cron.trim(),
          recipients: parseRecipients(v.recipients),
        });
        toast.success(t('ops.rpt.scheduleCreated'));
      }}
    >
      <ChoiceField
        control={form.control}
        name="definitionCode"
        label={t('ops.rpt.report')}
        options={definitions.map((d) => ({ value: d.code, label: reportTitle(i18n, d) }))}
        testIdPrefix="schedule-report"
      />
      <ChoiceField
        control={form.control}
        name="preset"
        label={t('ops.rpt.cronPreset')}
        options={[
          ...CRON_PRESETS.map((p) => ({ value: p.value, label: t(p.labelKey) })),
          { value: CUSTOM, label: t('ops.rpt.cronCustom') },
        ]}
        testIdPrefix="schedule-preset"
      />
      <TextField
        control={form.control}
        name="cron"
        label={t('ops.rpt.cron')}
        description={t('ops.rpt.cronHint')}
        className="[&_input]:font-mono"
        onInput={() => form.setValue('preset', CUSTOM)}
        data-testid="schedule-cron"
      />
      <TextareaField
        control={form.control}
        name="recipients"
        label={t('ops.rpt.recipients')}
        description={t('ops.rpt.recipientsHint')}
        rows={2}
        data-testid="schedule-recipients"
      />
    </FormDialog>
  );
}
