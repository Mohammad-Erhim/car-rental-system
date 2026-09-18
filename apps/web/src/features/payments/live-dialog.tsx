import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { CheckField } from '@/components/form-fields';
import { useUpdatePaymentConfig } from '@/lib/admin-hooks';

/** Switching to live charges real cards from that moment, so it needs an explicit acknowledgement. */
export function LiveDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const update = useUpdatePaymentConfig();
  const schema = useMemo(
    () =>
      z.object({
        ack: z.boolean().refine((v) => v, { message: t('ops.pay.ackRequired') }),
      }),
    [t],
  );
  const defaults = { ack: false };
  const form = useForm({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      destructive
      title={t('ops.pay.liveConfirmTitle')}
      description={t('ops.pay.liveConfirmBody')}
      submitLabel={t('ops.pay.liveConfirmAction')}
      onSubmit={async () => {
        await update.mutateAsync({ activeDriver: 'stripe_live', live: { acknowledgeLive: true } });
        toast.success(t('ops.pay.switched', { mode: t('ops.pay.mode.stripe_live') }));
      }}
    >
      <CheckField
        control={form.control}
        name="ack"
        label={t('ops.pay.liveConfirmAck')}
        testId="pay-ack-live"
      />
    </FormDialog>
  );
}
