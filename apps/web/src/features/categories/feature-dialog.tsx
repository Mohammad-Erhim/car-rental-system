import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  digitsOnly,
  emptyFeature,
  FEATURE_CODE,
  FEATURE_GROUPS,
  featureValues,
  type FeatureValues,
} from './category-model';

import { FormDialog } from '@/components/form-dialog';
import { SelectField, TextField } from '@/components/form-fields';
import { useUpsertFeature, type FeatureView } from '@/lib/admin-hooks';

/**
 * Create or edit one vehicle feature (an entry of the list a category picks from). Like a
 * category, its code is fixed once created and a taken code is refused rather than overwritten.
 */
export function FeatureDialog({
  feature,
  existingCodes,
  open,
  onOpenChange,
}: {
  /** set to edit; null to create */
  feature: FeatureView | null;
  existingCodes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const editing = feature !== null;
  const upsert = useUpsertFeature();

  const schema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .refine((v) => editing || FEATURE_CODE.test(v), { message: t('ops.cat.codeInvalid') })
          .refine((v) => editing || !existingCodes.includes(v), { message: t('ops.cat.codeDup') }),
        label: z.string().trim().min(1, t('error.field.required')),
        group: z.enum(['comfort', 'safety', 'tech', 'utility']),
        sortOrder: z.string(),
      }),
    [t, editing, existingCodes],
  );

  const defaults: FeatureValues = feature ? featureValues(feature) : emptyFeature();
  const form = useForm<FeatureValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={editing ? t('ops.cat.featureEditTitle') : t('ops.cat.featureNewTitle')}
      description={t('ops.cat.featureDialogHint')}
      submitLabel={editing ? t('ops.cat.saveEdit') : t('ops.cat.featureAdd')}
      onSubmit={async (v) => {
        await upsert.mutateAsync({
          code: v.code,
          label: v.label.trim(),
          group: v.group,
          sortOrder: Number(v.sortOrder || 0),
          ifMatch: feature?.version,
        });
        toast.success(editing ? t('ops.cat.featureSaved') : t('ops.cat.featureCreated'));
      }}
    >
      <TextField
        control={form.control}
        name="label"
        label={t('ops.cat.featureLabel')}
        autoFocus={!editing}
        data-testid="feature-label"
      />
      {editing ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('ops.cat.code')}</p>
          <p className="bidi-isolate font-mono text-sm text-muted-foreground">{feature.code}</p>
        </div>
      ) : (
        <TextField
          control={form.control}
          name="code"
          label={t('ops.cat.code')}
          description={t('ops.cat.codeHint')}
          autoComplete="off"
          normalize={(v) => v.toLowerCase().replace(/[^a-z0-9_]/g, '')}
          data-testid="feature-code"
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="group"
          label={t('ops.cat.group')}
          options={FEATURE_GROUPS.map((g) => ({ value: g, label: t(`ops.cat.group.${g}`) }))}
          testId="feature-group"
        />
        <TextField
          control={form.control}
          name="sortOrder"
          label={t('ops.cat.sortOrder')}
          inputMode="numeric"
          normalize={digitsOnly}
        />
      </div>
    </FormDialog>
  );
}
