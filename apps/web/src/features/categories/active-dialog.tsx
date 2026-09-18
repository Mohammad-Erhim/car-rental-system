import { useI18n } from '@carrental/i18n/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormDialog } from '@/components/form-dialog';
import { useSetCategoryActive, useSetFeatureActive } from '@/lib/admin-hooks';

export type ActiveTarget =
  | { kind: 'category'; code: string; name: string }
  | { kind: 'feature'; code: string; name: string };

/** Confirms taking a category or feature out of use. Restoring needs no confirmation. */
export function DeactivateDialog({
  target,
  open,
  onOpenChange,
}: {
  target: ActiveTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const setCategory = useSetCategoryActive();
  const setFeature = useSetFeatureActive();
  const form = useForm<Record<string, never>>({ defaultValues: {} });
  const isCategory = target.kind === 'category';

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{}}
      destructive
      title={t(isCategory ? 'ops.cat.deactivateTitle' : 'ops.cat.featureDeactivateTitle', {
        name: target.name,
      })}
      description={t(isCategory ? 'ops.cat.deactivateBody' : 'ops.cat.featureDeactivateBody')}
      submitLabel={t('ops.cat.deactivate')}
      onSubmit={async () => {
        await (isCategory ? setCategory : setFeature).mutateAsync({
          code: target.code,
          active: false,
        });
        toast.success(t(isCategory ? 'ops.cat.deactivated' : 'ops.cat.featureDeactivated'));
      }}
    ></FormDialog>
  );
}
