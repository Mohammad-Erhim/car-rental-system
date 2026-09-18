import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { opensBeforeCloses } from './location-model';

import { FormDialog } from '@/components/form-dialog';
import { SelectField, TextField } from '@/components/form-fields';
import { useAddHoursException } from '@/lib/admin-hooks';

interface Values {
  date: string;
  kind: 'closed' | 'reduced';
  open: string;
  close: string;
  reason: string;
}

const defaults: Values = { date: '', kind: 'closed', open: '09:00', close: '13:00', reason: '' };

/** Close a location for a day, or shorten its hours for that day (a holiday, an event). */
export function ExceptionDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const add = useAddHoursException();
  const today = new Date().toISOString().slice(0, 10);

  const schema = useMemo(
    () =>
      z
        .object({
          date: z.string().min(1, t('ops.loc.exDateRequired')),
          kind: z.enum(['closed', 'reduced']),
          open: z.string(),
          close: z.string(),
          reason: z.string(),
        })
        .superRefine((v, ctx) => {
          if (v.kind === 'reduced' && !opensBeforeCloses(v.open, v.close)) {
            ctx.addIssue({ code: 'custom', path: ['close'], message: t('ops.loc.exInverted') });
          }
        }),
    [t],
  );
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const kind = form.watch('kind');

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.loc.addException')}
      description={t('ops.loc.exceptionsHint')}
      submitLabel={t('ops.loc.addException')}
      onSubmit={async (v) => {
        const closed = v.kind === 'closed';
        await add.mutateAsync({
          code,
          date: v.date,
          closed,
          open: closed ? null : v.open,
          close: closed ? null : v.close,
          reason: v.reason.trim() || undefined,
        });
        toast.success(t('ops.loc.exAdded'));
      }}
    >
      <TextField
        control={form.control}
        name="date"
        label={t('ops.loc.exceptionDate')}
        type="date"
        min={today}
        data-testid="loc-ex-date"
      />
      <SelectField
        control={form.control}
        name="kind"
        label={t('ops.loc.exceptionKind')}
        options={[
          { value: 'closed', label: t('ops.loc.exClosed') },
          { value: 'reduced', label: t('ops.loc.exReduced') },
        ]}
        testId="loc-ex-kind"
      />
      {kind === 'reduced' ? (
        <div className="grid grid-cols-2 gap-4">
          <TextField control={form.control} name="open" label={t('ops.loc.open')} type="time" />
          <TextField control={form.control} name="close" label={t('ops.loc.close')} type="time" />
        </div>
      ) : null}
      <TextField control={form.control} name="reason" label={t('ops.loc.exceptionReason')} />
    </FormDialog>
  );
}
