import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  clean,
  DAY_KEYS,
  emptyLocation,
  inCoordinateRange,
  LOCATION_CODE,
  locationValues,
  opensBeforeCloses,
  TIME_ZONES,
  toSlots,
  validTurnaround,
  type LocationValues,
} from './location-model';

import {
  CheckboxGroupField,
  CheckField,
  SelectField,
  TextareaField,
  TextField,
} from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { Switch } from '@/components/ui/switch';
import { useUpsertLocation, type OpsLocation } from '@/lib/admin-hooks';
import { useOpsCategories } from '@/lib/ops-discovery-hooks';

const digits = (v: string) => v.replace(/\D/g, '');

function WeekEditor({ form }: { form: UseFormReturn<LocationValues> }) {
  const { t } = useI18n();
  const hours = form.watch('regularHours');
  return (
    <ul className="divide-y rounded-lg border" data-testid="loc-hours">
      {hours.map((s, i) => (
        <li key={s.day} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
          <span className="w-24 text-sm font-medium">{t(`ops.loc.day.${DAY_KEYS[s.day]}`)}</span>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={!s.closed}
              onCheckedChange={(open) =>
                form.setValue(`regularHours.${i}.closed`, !open, { shouldDirty: true })
              }
              aria-label={`${t(`ops.loc.day.${DAY_KEYS[s.day]}`)} — ${t('ops.loc.open')}`}
            />
            <span className="text-muted-foreground">
              {s.closed ? t('ops.loc.closed') : t('ops.loc.open')}
            </span>
          </label>
          {s.closed ? null : (
            <div className="flex items-start gap-2">
              <TextField
                control={form.control}
                name={`regularHours.${i}.open`}
                label={t('ops.loc.open')}
                type="time"
                className="w-32 [&>label]:sr-only"
              />
              <span className="pt-2.5 text-muted-foreground">–</span>
              <TextField
                control={form.control}
                name={`regularHours.${i}.close`}
                label={t('ops.loc.close')}
                type="time"
                className="w-32 [&>label]:sr-only"
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Create a location, or edit one (`location` set). The code is uppercase, 2–20 characters and
 * fixed once created. Discovery obeys every change immediately, including the weekly hours.
 */
export function LocationSheet({
  location,
  existingCodes,
  open,
  onOpenChange,
}: {
  location: OpsLocation | null;
  existingCodes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const editing = location !== null;
  const upsert = useUpsertLocation();
  const categories = useOpsCategories();

  const schema = useMemo(() => {
    const required = t('error.field.required');
    return z
      .object({
        code: z
          .string()
          .refine((v) => editing || LOCATION_CODE.test(v), { message: t('ops.loc.codeInvalid') })
          .refine((v) => editing || !existingCodes.includes(v), {
            message: t('ops.cat.codeDup'),
          }),
        name: z.string().trim().min(1, required),
        timezone: z.string().min(1, required),
        afterHoursReturn: z.boolean(),
        turnaroundMinutes: z
          .string()
          .refine(validTurnaround, { message: t('ops.loc.turnaroundInvalid') }),
        pickupInstructions: z.string(),
        returnInstructions: z.string(),
        supportedCategoryCodes: z.array(z.string()),
        line1: z.string(),
        city: z.string(),
        region: z.string(),
        postalCode: z.string(),
        country: z.string(),
        phone: z.string(),
        email: z
          .string()
          .trim()
          .refine((v) => v === '' || /^\S+@\S+\.\S+$/.test(v), {
            message: t('ops.loc.emailInvalid'),
          }),
        latitude: z
          .string()
          .refine((v) => inCoordinateRange(v, 90), { message: t('ops.loc.coordInvalid') }),
        longitude: z
          .string()
          .refine((v) => inCoordinateRange(v, 180), { message: t('ops.loc.coordInvalid') }),
        regularHours: z.array(
          z.object({
            day: z.number(),
            closed: z.boolean(),
            open: z.string(),
            close: z.string(),
          }),
        ),
      })
      .superRefine((v, ctx) => {
        v.regularHours.forEach((s, i) => {
          if (!s.closed && !opensBeforeCloses(s.open, s.close)) {
            ctx.addIssue({
              code: 'custom',
              path: ['regularHours', i, 'close'],
              message: t('ops.loc.exInverted'),
            });
          }
        });
      });
  }, [t, editing, existingCodes]);

  const defaults = location ? locationValues(location) : emptyLocation();
  const form = useForm<LocationValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const zones = useMemo(
    () =>
      TIME_ZONES.includes(defaults.timezone) ? TIME_ZONES : [defaults.timezone, ...TIME_ZONES],
    [defaults.timezone],
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      size="lg"
      title={editing ? t('ops.loc.editTitle', { name: location.name }) : t('ops.loc.newTitle')}
      description={t('ops.loc.sheetHint')}
      submitLabel={editing ? t('ops.loc.save') : t('ops.loc.create')}
      onSubmit={async (v) => {
        await upsert.mutateAsync({
          code: v.code,
          name: v.name.trim(),
          timezone: v.timezone,
          afterHoursReturn: v.afterHoursReturn,
          turnaroundMinutes: Number(v.turnaroundMinutes),
          pickupInstructions: v.pickupInstructions.trim() || null,
          returnInstructions: v.returnInstructions.trim() || null,
          supportedCategoryCodes: v.supportedCategoryCodes,
          address: clean({
            line1: v.line1,
            city: v.city,
            region: v.region,
            postalCode: v.postalCode,
            country: v.country,
          }),
          contact: clean({ phone: v.phone, email: v.email }),
          latitude: v.latitude.trim() || null,
          longitude: v.longitude.trim() || null,
          regularHours: toSlots(v.regularHours),
        });
        toast.success(editing ? t('ops.loc.saved') : t('ops.loc.savedNew'));
      }}
    >
      <FormSection title={t('ops.loc.secBasics')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="name"
            label={t('ops.loc.name')}
            autoFocus={!editing}
            data-testid="loc-name"
          />
          {editing ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('ops.loc.code')}</p>
              <p className="bidi-isolate pt-2 font-mono text-sm text-muted-foreground">
                {location.code}
              </p>
            </div>
          ) : (
            <TextField
              control={form.control}
              name="code"
              label={t('ops.loc.code')}
              description={t('ops.loc.codeHint')}
              autoComplete="off"
              maxLength={20}
              normalize={(v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '')}
              data-testid="loc-new-code"
            />
          )}
          <SelectField
            control={form.control}
            name="timezone"
            label={t('ops.loc.timezone')}
            description={t('ops.loc.timezoneHint')}
            options={zones.map((z) => ({ value: z, label: z }))}
            testId="loc-timezone"
          />
          <TextField
            control={form.control}
            name="turnaroundMinutes"
            label={t('ops.loc.turnaround')}
            description={t('ops.loc.turnaroundHint')}
            inputMode="numeric"
            normalize={digits}
          />
        </div>
        <CheckField
          control={form.control}
          name="afterHoursReturn"
          label={t('ops.loc.afterHours')}
          description={t('ops.loc.afterHoursHint')}
          variant="switch"
          testId="loc-afterhours"
        />
      </FormSection>

      <FormSection title={t('ops.loc.weeklyHours')} hint={t('ops.loc.weeklyHoursHint')}>
        <WeekEditor form={form} />
      </FormSection>

      <FormSection title={t('ops.loc.categories')} hint={t('ops.loc.categoriesHint2')}>
        <CheckboxGroupField
          control={form.control}
          name="supportedCategoryCodes"
          label={t('ops.loc.categories')}
          emptyLabel={t('ops.loc.categoriesNone')}
          options={(categories.data ?? []).map((c) => ({ value: c.code, label: c.displayName }))}
          testId="loc-categories"
        />
      </FormSection>

      <FormSection title={t('ops.loc.secAddress')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="line1"
            label={t('ops.loc.addressLine1')}
            className="sm:col-span-2"
          />
          <TextField control={form.control} name="city" label={t('ops.loc.city')} />
          <TextField control={form.control} name="region" label={t('ops.loc.region')} />
          <TextField control={form.control} name="postalCode" label={t('ops.loc.postalCode')} />
          <TextField control={form.control} name="country" label={t('ops.loc.country')} />
          <TextField
            control={form.control}
            name="latitude"
            label={t('ops.loc.latitude')}
            description={t('ops.loc.coordsHint')}
            inputMode="decimal"
          />
          <TextField
            control={form.control}
            name="longitude"
            label={t('ops.loc.longitude')}
            inputMode="decimal"
          />
        </div>
      </FormSection>

      <FormSection title={t('ops.loc.secContact')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="phone" label={t('ops.loc.phone')} type="tel" />
          <TextField control={form.control} name="email" label={t('ops.loc.email')} type="email" />
        </div>
      </FormSection>

      <FormSection title={t('ops.loc.secInstructions')}>
        <TextareaField
          control={form.control}
          name="pickupInstructions"
          label={t('ops.loc.pickupInstructions')}
        />
        <TextareaField
          control={form.control}
          name="returnInstructions"
          label={t('ops.loc.returnInstructions')}
        />
      </FormSection>
    </FormSheet>
  );
}
