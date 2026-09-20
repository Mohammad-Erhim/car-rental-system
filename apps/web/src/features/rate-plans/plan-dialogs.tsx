import { useI18n } from '@carrental/i18n/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { wouldReplace } from './plan-model';

import { FormDialog } from '@/components/form-dialog';
import { useDeleteRatePlan, usePublishRatePlan, type RatePlan } from '@/lib/ops-discovery-hooks';
import { usePendingApproval } from '@/lib/workflow-hooks';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Publish confirmation (design §12.5: a publish confirm shows its effect): which category and
 * scope goes live from when, the headline price, and which published plans it supersedes.
 */
export function PublishDialog({
  plan,
  all,
  scopeName,
  open,
  onOpenChange,
}: DialogProps & { plan: RatePlan; all: RatePlan[]; scopeName: string }) {
  const { t, fmt } = useI18n();
  const pending = usePendingApproval();
  const publish = usePublishRatePlan();
  const form = useForm<Record<string, never>>({ defaultValues: {} });
  const replaced = wouldReplace(plan, all);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{}}
      title={t('ops.rp.publishTitle')}
      submitLabel={t('ops.rp.publish')}
      onSubmit={async () => {
        const res = await publish.mutateAsync(plan.id);
        if (pending(res)) return;
        toast.success(t('ops.rp.published', { name: plan.name }));
      }}
    >
      <div className="space-y-3 text-sm">
        <p>
          {t('ops.rp.publishEffect', {
            category: plan.categoryCode,
            scope: scopeName,
            from: fmt.date(plan.effectiveFrom),
          })}
        </p>
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground">
          {t('ops.rp.publishBase', {
            price: fmt.money({ amountMinor: plan.baseDayMinor, currency: plan.currency }),
            tax: +(plan.taxBps / 100).toFixed(2),
            fees: plan.fees.length,
            tiers: plan.tiers.length,
          })}
        </p>
        <p className={replaced.length ? 'font-medium text-warning' : undefined}>
          {replaced.length
            ? t('ops.rp.publishReplaces', { names: replaced.map((o) => o.name).join(', ') })
            : t('ops.rp.publishReplacesNone')}
        </p>
        <p className="text-muted-foreground">{t('ops.rp.publishImmutable')}</p>
      </div>
    </FormDialog>
  );
}

/** Permanently remove a draft. */
export function DeletePlanDialog({ plan, open, onOpenChange }: DialogProps & { plan: RatePlan }) {
  const { t } = useI18n();
  const del = useDeleteRatePlan();
  const form = useForm<Record<string, never>>({ defaultValues: {} });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{}}
      destructive
      title={t('ops.rp.deleteTitle')}
      description={t('ops.rp.deleteBody', { name: plan.name })}
      submitLabel={t('ops.rp.deleteDraft')}
      onSubmit={async () => {
        await del.mutateAsync(plan.id);
        toast.success(t('ops.rp.deleted'));
      }}
    ></FormDialog>
  );
}
