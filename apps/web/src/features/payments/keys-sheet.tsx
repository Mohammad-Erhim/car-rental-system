import { useI18n } from '@carrental/i18n/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { SecretField } from './secret-field';

import { TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { useUpdatePaymentConfig, type PaymentConfigSummary } from '@/lib/admin-hooks';
import { FormMessageError } from '@/lib/use-form-submit';

interface Values {
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
}

/**
 * Save the Stripe credentials for one mode. Only what is typed is sent, so an untouched saved
 * secret stays as it is. Every write is step-up confirmed by the shared provider.
 */
export function KeysSheet({
  mode,
  config,
  open,
  onOpenChange,
}: {
  mode: 'test' | 'live';
  config: PaymentConfigSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const update = useUpdatePaymentConfig();
  const c = config[mode];
  const defaults: Values = { publishableKey: '', secretKey: '', webhookSecret: '' };
  const form = useForm<Values>({ defaultValues: defaults });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t(mode === 'test' ? 'ops.pay.testSection' : 'ops.pay.liveSection')}
      description={t(mode === 'test' ? 'ops.pay.testSectionHint' : 'ops.pay.liveSectionHint')}
      submitLabel={t(mode === 'test' ? 'ops.pay.saveTest' : 'ops.pay.saveLive')}
      onSubmit={async (v) => {
        const body = {
          publishableKey: v.publishableKey.trim() || undefined,
          secretKey: v.secretKey || undefined,
          webhookSecret: v.webhookSecret || undefined,
        };
        if (!body.publishableKey && !body.secretKey && !body.webhookSecret) {
          throw new FormMessageError(t('ops.pay.nothingToSave'));
        }
        await update.mutateAsync({ [mode]: body });
        toast.success(t(mode === 'test' ? 'ops.pay.savedTest' : 'ops.pay.savedLive'));
      }}
    >
      <TextField
        control={form.control}
        name="publishableKey"
        label={t('ops.pay.publishableKey')}
        description={t('ops.pay.publishableKeyHint')}
        placeholder={c.publishableKey ?? (mode === 'test' ? 'pk_test_…' : 'pk_live_…')}
        autoComplete="off"
        data-testid={`pay-${mode}-publishable`}
      />
      <SecretField
        control={form.control}
        name="secretKey"
        label={t('ops.pay.secretKey')}
        configured={c.configured}
        last4={c.secretKeyLast4}
        testId={`pay-${mode}-secret`}
      />
      <SecretField
        control={form.control}
        name="webhookSecret"
        label={t('ops.pay.webhookSecret')}
        description={t('ops.pay.webhookSecretHint')}
        configured={c.webhookConfigured}
        last4={null}
        testId={`pay-${mode}-webhook`}
      />
    </FormSheet>
  );
}
