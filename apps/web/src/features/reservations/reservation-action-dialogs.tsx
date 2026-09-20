import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { LookupSelect } from '@/components/lookup-select';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  useCancelReservation,
  useManualRefund,
  useNoShowReservation,
} from '@/lib/reservation-hooks';
import { usePendingApproval } from '@/lib/workflow-hooks';

interface DialogProps {
  reference: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NoteField({
  form,
  required,
  label,
}: {
  form: ReturnType<typeof useForm<{ note: string }>>;
  required?: boolean;
  label: string;
}) {
  return (
    <FormField
      control={form.control}
      name="note"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea rows={3} aria-required={required} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Close a confirmed reservation as a no-show. Irreversible, so it is a destructive confirm. */
export function NoShowDialog({ reference, open, onOpenChange }: DialogProps) {
  const { t } = useI18n();
  const noShow = useNoShowReservation(reference);
  const form = useForm<{ note: string }>({ defaultValues: { note: '' } });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{ note: '' }}
      destructive
      title={t('ops.resv.noShowTitle')}
      description={t('ops.resv.noShowBody')}
      submitLabel={t('ops.resv.markNoShow')}
      onSubmit={async ({ note }) => {
        await noShow.mutateAsync({ note: note.trim() || undefined });
        toast.success(t('ops.resv.noShowDone'));
      }}
    >
      <NoteField form={form} label={t('ops.resv.noteOptional')} />
    </FormDialog>
  );
}

/** Cancel a reservation: a reason (from reference data) is required; the note is optional. */
export function CancelDialog({
  reference,
  currency,
  open,
  onOpenChange,
}: DialogProps & { currency: string }) {
  const { t, fmt } = useI18n();
  const pending = usePendingApproval();
  const cancel = useCancelReservation(reference);
  const schema = useMemo(
    () =>
      z.object({
        reasonCode: z.string().min(1, t('error.field.required')),
        note: z.string(),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { reasonCode: '', note: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const money = (minor: number) => fmt.money({ amountMinor: minor, currency });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      destructive
      title={t('ops.resv.cancelTitle')}
      description={t('ops.resv.cancelBody')}
      submitLabel={t('ops.resv.cancel')}
      onSubmit={async ({ reasonCode, note }) => {
        const res = await cancel.mutateAsync({ reasonCode, note: note.trim() || undefined });
        if (pending(res)) return;
        toast.success(
          t('ops.resv.cancelDone', { refund: money(res.refundMinor), fee: money(res.feeMinor) }),
        );
      }}
    >
      <FormField
        control={form.control}
        name="reasonCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('ops.resv.reason')}</FormLabel>
            <FormControl>
              <LookupSelect
                typeCode="cancel_reason"
                value={field.value}
                onChange={field.onChange}
                invalid={!!form.formState.errors.reasonCode}
              />
            </FormControl>
            <FormDescription>{t('ops.resv.cancelFeeNote')}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="note"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('ops.resv.noteOptional')}</FormLabel>
            <FormControl>
              <Textarea rows={3} {...field} />
            </FormControl>
          </FormItem>
        )}
      />
    </FormDialog>
  );
}

/** A goodwill / dispute refund, independent of cancel and modify. Capped at what is refundable. */
export function RefundDialog({
  reference,
  currency,
  refundableMinor,
  open,
  onOpenChange,
}: DialogProps & { currency: string; refundableMinor: number }) {
  const { t, fmt } = useI18n();
  const pending = usePendingApproval();
  const refund = useManualRefund(reference);
  const max = refundableMinor / 100;
  const schema = useMemo(
    () =>
      z.object({
        amount: z
          .string()
          .min(1, t('error.field.required'))
          .refine((v) => Number(v) > 0, t('error.field.mustBePositive'))
          .refine(
            (v) => Number(v) <= max,
            t('ops.resv.refundMax', { max: fmt.money({ amountMinor: refundableMinor, currency }) }),
          ),
        note: z.string().trim().min(1, t('error.field.required')),
      }),
    [t, fmt, max, refundableMinor, currency],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { amount: max.toFixed(2), note: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      destructive
      title={t('ops.resv.refundTitle')}
      description={t('ops.resv.refundBody', {
        max: fmt.money({ amountMinor: refundableMinor, currency }),
      })}
      submitLabel={t('ops.resv.refund')}
      onSubmit={async ({ amount, note }) => {
        const amountMinor = Math.round(Number(amount) * 100);
        const res = await refund.mutateAsync({ amountMinor, note: note.trim() });
        if (pending(res)) return;
        toast.success(t('ops.resv.refundDone', { amount: fmt.money({ amountMinor, currency }) }));
      }}
    >
      <FormField
        control={form.control}
        name="amount"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('ops.resv.refundAmount')}</FormLabel>
            <FormControl>
              <Input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                max={max.toFixed(2)}
                data-testid="refund-amount"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="note"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('ops.resv.refundReason')}</FormLabel>
            <FormControl>
              <Textarea rows={3} data-testid="refund-note" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </FormDialog>
  );
}
