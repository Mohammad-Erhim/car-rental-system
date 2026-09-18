import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { SelectField, TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { MediaPickerField } from '@/components/media-picker';
import { FormItem, FormLabel } from '@/components/ui/form';
import {
  useCreateUnit,
  useOpsCategories,
  useUpdateUnit,
  type OpsUnit,
} from '@/lib/ops-discovery-hooks';

/**
 * Add a vehicle, or edit one (`unit` set). The current location isn't editable — moving a car is
 * the Transfer action, which also checks it isn't on rent.
 */
export function UnitSheet({
  unit,
  locations,
  open,
  onOpenChange,
}: {
  unit: OpsUnit | null;
  /** locations the actor may create a vehicle at */
  locations: Array<{ code: string; name: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const editing = unit !== null;
  const categories = useOpsCategories();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();

  const schema = useMemo(
    () =>
      z.object({
        categoryCode: z.string().min(1, t('error.field.required')),
        locationCode: editing ? z.string() : z.string().min(1, t('error.field.required')),
        plate: z.string().trim().min(1, t('error.field.required')),
        vin: z.string().trim().min(1, t('error.field.required')),
        year: z.string(),
        make: z.string(),
        model: z.string(),
        colour: z.string(),
        imageRef: z.string().nullable(),
        imageUrl: z.string().nullable(),
      }),
    [t, editing],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = {
    categoryCode: unit?.categoryCode ?? '',
    locationCode: unit?.currentLocationCode ?? '',
    plate: unit?.plate ?? '',
    vin: unit?.vin ?? '',
    year: unit?.year ?? '',
    make: unit?.make ?? '',
    model: unit?.model ?? '',
    colour: unit?.colour ?? '',
    imageRef: unit?.imageRef ?? null,
    imageUrl: unit?.imageUrl ?? null,
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const image = form.watch(['imageRef', 'imageUrl']);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={
        editing ? t('ops.fleet.editingVehicle', { plate: unit.plate }) : t('ops.fleet.addVehicle')
      }
      submitLabel={editing ? t('ops.fleet.saveVehicle') : t('ops.fleet.addVehicleSubmit')}
      onSubmit={async (v) => {
        const body = {
          categoryCode: v.categoryCode,
          vin: v.vin.trim(),
          plate: v.plate.trim(),
          year: v.year.trim() || undefined,
          make: v.make.trim() || undefined,
          model: v.model.trim() || undefined,
          colour: v.colour.trim() || undefined,
          // explicit null (not omitted) clears an existing image — an update treats a missing key
          // as "leave unchanged"
          imageRef: v.imageRef,
        };
        if (editing) {
          await updateUnit.mutateAsync({ id: unit.id, ...body, ifMatch: unit.version });
          toast.success(t('ops.fleet.unitSaved'));
        } else {
          await createUnit.mutateAsync({ ...body, locationCode: v.locationCode });
          toast.success(t('ops.fleet.unitCreated'));
        }
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="categoryCode"
          label={t('ops.tbl.category')}
          noneLabel={t('ops.fleet.anyCategory')}
          options={(categories.data ?? []).map((c) => ({ value: c.code, label: c.displayName }))}
          testId="unit-category"
        />
        {editing ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('ops.search.location')}</p>
            <p className="pt-2 text-sm text-muted-foreground">
              <span className="bidi-isolate">{unit.currentLocationCode}</span> ·{' '}
              {t('ops.fleet.locationEditHint')}
            </p>
          </div>
        ) : (
          <SelectField
            control={form.control}
            name="locationCode"
            label={t('ops.search.location')}
            noneLabel={t('ops.search.anyLocation')}
            options={locations.map((l) => ({ value: l.code, label: `${l.name} (${l.code})` }))}
            testId="unit-location"
          />
        )}
        <TextField
          control={form.control}
          name="plate"
          label={t('ops.tbl.plate')}
          data-testid="unit-plate"
        />
        <TextField
          control={form.control}
          name="vin"
          label={t('ops.tbl.vin')}
          data-testid="unit-vin"
        />
        <TextField
          control={form.control}
          name="make"
          label={t('ops.fleet.make')}
          data-testid="unit-make"
        />
        <TextField
          control={form.control}
          name="model"
          label={t('ops.fleet.model')}
          data-testid="unit-model"
        />
        <TextField
          control={form.control}
          name="year"
          label={t('ops.fleet.year')}
          inputMode="numeric"
          data-testid="unit-year"
        />
        <TextField
          control={form.control}
          name="colour"
          label={t('ops.fleet.colour')}
          data-testid="unit-colour"
        />
      </div>

      <FormItem>
        <FormLabel>{t('ops.fleet.image')}</FormLabel>
        <MediaPickerField
          value={image[0]}
          previewUrl={image[1]}
          purpose="vehicle_unit"
          ownerType="vehicle_unit"
          ownerId={form.getValues('plate')}
          onChange={(img) => {
            form.setValue('imageRef', img?.ref ?? null, { shouldDirty: true });
            form.setValue('imageUrl', img?.url ?? null, { shouldDirty: true });
          }}
          changeLabel={t('ops.fleet.imageChange')}
          removeLabel={t('ops.fleet.imageRemove')}
          title={t('ops.fleet.imagePickerTitle')}
          testId="unit-image"
        />
      </FormItem>
    </FormSheet>
  );
}
