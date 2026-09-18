import type { LookupValue } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { useLookupMutations } from './use-lookup-mutations';

import { FormDialog } from '@/components/form-dialog';
import { useLookupUsage } from '@/lib/api-hooks';

/**
 * Deactivate a value. Before confirming it looks up where the value is used, so the person knows
 * whether existing records keep it (they do) — and forces the deactivation when it is in use, or
 * when usage couldn't be checked, rather than trapping them.
 */
export function DeactivateDialog({
  typeCode,
  value,
  open,
  onOpenChange,
}: {
  typeCode: string;
  value: LookupValue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { setActive } = useLookupMutations(typeCode);
  const usage = useLookupUsage(typeCode, open ? value.code : null);
  const inUse = (usage.data?.totalReferences ?? 0) > 0;
  const form = useForm<Record<string, never>>({ defaultValues: {} });

  const description = usage.isLoading
    ? t('ops.ref.checkingUsage')
    : usage.isError
      ? t('ops.ref.usageUnknown')
      : inUse
        ? t('ops.ref.deactivateInUse', { n: usage.data!.totalReferences })
        : t('ops.ref.deactivateBody');

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{}}
      destructive
      title={t('ops.ref.deactivateQ')}
      description={description}
      submitLabel={t('ops.ref.deactivate')}
      submitDisabled={usage.isLoading}
      onSubmit={async () => {
        await setActive.mutateAsync({
          id: value.id,
          active: false,
          force: inUse || usage.isError,
        });
        toast.success(t('ops.ref.deactivated'));
      }}
    >
      {null}
    </FormDialog>
  );
}
