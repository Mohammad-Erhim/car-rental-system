import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  CATEGORY_CODE,
  categoryValues,
  digitsOnly,
  emptyCategory,
  groupFeatures,
  inRange,
  LIMITS,
  type CategoryValues,
} from './category-model';

import { SelectField, TextField, TextareaField } from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { MediaPickerField } from '@/components/media-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField, FormItem } from '@/components/ui/form';
import { useCatalogueFeatures, useUpsertCategory, type CategoryView } from '@/lib/admin-hooks';

/**
 * Create or edit a vehicle category — everything the public site shows on a vehicle card comes
 * from here. The code is the category's identity and can't change once it exists; creating with a
 * code that is taken is refused here, because the API would silently overwrite that category.
 */
export function CategorySheet({
  category,
  existingCodes,
  open,
  onOpenChange,
}: {
  /** set to edit; null to create */
  category: CategoryView | null;
  existingCodes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const editing = category !== null;
  const upsert = useUpsertCategory();
  const features = useCatalogueFeatures();

  const schema = useMemo(() => {
    const required = t('error.field.required');
    const range = (key: keyof typeof LIMITS) =>
      z.string().refine((v) => inRange(v, LIMITS[key]), {
        message: t('ops.cat.range', { min: LIMITS[key][0], max: LIMITS[key][1] }),
      });
    return z.object({
      code: z
        .string()
        .refine((v) => editing || CATEGORY_CODE.test(v), { message: t('ops.cat.codeInvalid') })
        .refine((v) => editing || !existingCodes.includes(v), { message: t('ops.cat.codeDup') }),
      class: z.string().trim().min(1, required),
      displayName: z.string().trim().min(1, required),
      description: z.string(),
      passengers: range('passengers'),
      luggage: range('luggage'),
      doors: range('doors'),
      transmission: z.enum(['automatic', 'manual']),
      sortOrder: z.string(),
      featureCodes: z.array(z.string()),
      imageRef: z.string().nullable(),
      imageUrl: z.string().nullable(),
    });
  }, [t, editing, existingCodes]);

  const defaults: CategoryValues = category ? categoryValues(category) : emptyCategory();
  const form = useForm<CategoryValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const selected = form.watch('featureCodes');
  const [imageRef, imageUrl] = form.watch(['imageRef', 'imageUrl']);
  const code = form.watch('code');

  const groups = groupFeatures(features.data ?? []);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      size="lg"
      title={
        editing ? t('ops.cat.editTitle', { name: category.displayName }) : t('ops.cat.newTitle')
      }
      description={t('ops.cat.sheetHint')}
      submitLabel={editing ? t('ops.cat.saveEdit') : t('ops.cat.save')}
      onSubmit={async (v) => {
        await upsert.mutateAsync({
          code: v.code,
          class: v.class.trim(),
          displayName: v.displayName.trim(),
          description: v.description.trim() || undefined,
          passengers: Number(v.passengers),
          luggage: Number(v.luggage),
          doors: Number(v.doors),
          transmission: v.transmission,
          sortOrder: Number(v.sortOrder || 0),
          featureCodes: v.featureCodes,
          imageRef: v.imageRef ?? undefined,
          ifMatch: category?.version,
        });
        toast.success(editing ? t('ops.cat.saved') : t('ops.cat.created'));
      }}
    >
      <FormSection title={t('ops.cat.secBasics')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="displayName"
            label={t('ops.cat.displayName')}
            autoFocus={!editing}
            data-testid="category-name"
          />
          {editing ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('ops.cat.code')}</p>
              <p className="bidi-isolate pt-2 font-mono text-sm text-muted-foreground">
                {category.code}
              </p>
            </div>
          ) : (
            <TextField
              control={form.control}
              name="code"
              label={t('ops.cat.code')}
              description={t('ops.cat.codeHint')}
              autoComplete="off"
              normalize={(v) => v.toLowerCase().replace(/[^a-z0-9_]/g, '')}
              data-testid="category-code"
            />
          )}
          <TextField
            control={form.control}
            name="class"
            label={t('ops.cat.class')}
            description={t('ops.cat.classHint')}
            data-testid="category-class"
          />
          <SelectField
            control={form.control}
            name="transmission"
            label={t('ops.cat.transmission')}
            options={[
              { value: 'automatic', label: t('ops.cat.automatic') },
              { value: 'manual', label: t('ops.cat.manual') },
            ]}
            testId="category-transmission"
          />
        </div>
        <TextareaField
          control={form.control}
          name="description"
          label={t('ops.cat.description')}
          data-testid="category-description"
        />
      </FormSection>

      <FormSection title={t('ops.cat.secCapacity')} hint={t('ops.cat.secCapacityHint')}>
        <div className="grid gap-4 sm:grid-cols-3">
          {(['passengers', 'luggage', 'doors'] as const).map((name) => (
            <TextField
              key={name}
              control={form.control}
              name={name}
              label={t(`ops.cat.${name}`)}
              inputMode="numeric"
              normalize={digitsOnly}
              data-testid={`category-${name}`}
            />
          ))}
        </div>
      </FormSection>

      <FormSection title={t('ops.cat.image')} hint={t('ops.cat.imageHint')}>
        <MediaPickerField
          value={imageRef}
          previewUrl={imageUrl}
          purpose="vehicle_category"
          ownerType="vehicle_category"
          ownerId={code}
          onChange={(img) => {
            form.setValue('imageRef', img?.ref ?? null, { shouldDirty: true });
            form.setValue('imageUrl', img?.url ?? null, { shouldDirty: true });
          }}
          changeLabel={t('ops.cat.imageChange')}
          removeLabel={t('ops.cat.imageRemove')}
          title={t('ops.cat.imagePickerTitle')}
          testId="category-image"
        />
      </FormSection>

      <FormSection
        title={t('ops.cat.features')}
        hint={t('ops.cat.featuresPicked', { n: selected.length })}
      >
        <FormField
          control={form.control}
          name="featureCodes"
          render={({ field }) => (
            <FormItem className="space-y-4" data-testid="category-features">
              {features.isLoading ? (
                <p className="text-sm text-muted-foreground">{t('ops.st.loading')}</p>
              ) : !groups.length ? (
                <p className="text-sm text-muted-foreground">{t('ops.cat.noFeaturesNow')}</p>
              ) : (
                groups.map(({ group, features: list }) => (
                  <fieldset key={group} className="space-y-2">
                    <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t(`ops.cat.group.${group}`)}
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {list.map((f) => {
                        const checked = field.value.includes(f.code);
                        // a deactivated feature can't be newly picked, but stays if already there
                        const disabled = !f.isActive && !checked;
                        return (
                          <label
                            key={f.code}
                            className="flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 font-normal has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                            title={f.isActive ? undefined : t('ops.cat.featureInactiveHint')}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={disabled}
                              onCheckedChange={(v) =>
                                field.onChange(
                                  v === true
                                    ? [...field.value, f.code]
                                    : field.value.filter((c) => c !== f.code),
                                )
                              }
                            />
                            <span className="min-w-0 flex-1 truncate">{f.label}</span>
                            {f.isActive ? null : (
                              <span className="text-xs text-muted-foreground">
                                {t('ops.cat.inactive')}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))
              )}
            </FormItem>
          )}
        />
      </FormSection>

      <FormSection title={t('ops.cat.secDisplay')}>
        <TextField
          control={form.control}
          name="sortOrder"
          label={t('ops.cat.sortOrder')}
          description={t('ops.cat.sortOrderHint')}
          inputMode="numeric"
          normalize={digitsOnly}
          className="sm:max-w-[12rem]"
        />
      </FormSection>
    </FormSheet>
  );
}
