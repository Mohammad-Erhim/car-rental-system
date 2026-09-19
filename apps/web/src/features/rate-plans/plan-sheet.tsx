import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  emptyPlanValues,
  planToValues,
  todayIso,
  valuesToInput,
  type PlanValues,
} from './plan-model';

import { SelectField, TextField } from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { LookupSelect } from '@/components/lookup-select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useLocationScope } from '@/lib/location-scope';
import { useOpsCategories, useSaveRatePlan, type RatePlan } from '@/lib/ops-discovery-hooks';

const decimal = /^\d+(\.\d{1,2})?$/;
const whole = /^\d+$/;

/**
 * Create a draft, edit one (`plan` set, sent with its version as `If-Match`), or start a new
 * draft from an existing plan (`initial` set, no `plan`). A published plan is immutable — this is
 * how a price changes.
 */
export function PlanSheet({
  plan,
  initial,
  open,
  onOpenChange,
}: {
  /** the draft being edited, or null when creating */
  plan: RatePlan | null;
  /** starting values when cloning; ignored when editing */
  initial?: PlanValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const categories = useOpsCategories();
  const { options: locationOptions, restricted } = useLocationScope();
  const save = useSaveRatePlan();
  const editing = plan !== null;
  // active branches the account may price, plus the plan's own branch if it has since been archived
  const scopeChoices = useMemo(() => {
    const list = locationOptions
      .filter((o) => o.status === 'active')
      .map((o) => ({ value: o.code, label: `${o.name} (${o.code})` }));
    const own = plan?.locationCode;
    if (own && !list.some((l) => l.value === own)) {
      const o = locationOptions.find((x) => x.code === own);
      list.push({
        value: own,
        label: `${o?.name ?? own} (${own}) · ${t('ops.locFilter.archivedTag')}`,
      });
    }
    return list;
  }, [locationOptions, plan?.locationCode, t]);

  const schema = useMemo(() => {
    const req = t('error.field.required');
    const invalid = t('error.field.invalid');
    return z
      .object({
        categoryCode: z.string().min(1, req),
        name: z.string().trim().min(1, req),
        // a restricted account can only price its own branches — an org-wide plan is not theirs to set
        scope: restricted ? z.string().min(1, req) : z.string(),
        currency: z.string().min(1, req),
        effectiveFrom: z.string().min(1, req),
        effectiveTo: z.string(),
        baseDay: z
          .string()
          .trim()
          .regex(decimal, invalid)
          .refine((v) => Number(v) > 0, t('error.field.mustBePositive')),
        hour: z
          .string()
          .trim()
          .refine((v) => v === '' || decimal.test(v), invalid),
        taxPct: z
          .string()
          .trim()
          .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) <= 100, t('error.field.outOfRange')),
        minDuration: z
          .string()
          .trim()
          .refine((v) => whole.test(v) && Number(v) >= 1, invalid),
        maxDuration: z
          .string()
          .trim()
          .refine((v) => v === '' || whole.test(v), invalid),
        fees: z.array(
          z.object({
            code: z.string().trim().min(1, req),
            label: z.string().trim().min(1, req),
            amount: z.string().trim().regex(decimal, invalid),
            taxable: z.boolean(),
          }),
        ),
        tiers: z.array(
          z.object({
            minHours: z
              .string()
              .trim()
              .refine((v) => whole.test(v) && Number(v) >= 1, invalid),
            day: z
              .string()
              .trim()
              .regex(decimal, invalid)
              .refine((v) => Number(v) > 0, t('error.field.mustBePositive')),
          }),
        ),
      })
      .superRefine((v, ctx) => {
        if (v.effectiveTo && v.effectiveTo < v.effectiveFrom) {
          ctx.addIssue({
            code: 'custom',
            path: ['effectiveTo'],
            message: t('error.field.beforeFrom'),
          });
        }
        const min = Number(v.minDuration);
        if (v.maxDuration && whole.test(v.maxDuration) && Number(v.maxDuration) < min) {
          ctx.addIssue({
            code: 'custom',
            path: ['maxDuration'],
            message: t('error.field.invalid'),
          });
        }
        const seenFee = new Set<string>();
        v.fees.forEach((f, i) => {
          const code = f.code.trim();
          if (code && seenFee.has(code)) {
            ctx.addIssue({
              code: 'custom',
              path: ['fees', i, 'code'],
              message: t('error.field.used'),
            });
          }
          seenFee.add(code);
        });
        const seenTier = new Set<string>();
        v.tiers.forEach((tr, i) => {
          const key = tr.minHours.trim();
          if (key && seenTier.has(key)) {
            ctx.addIssue({
              code: 'custom',
              path: ['tiers', i, 'minHours'],
              message: t('error.field.used'),
            });
          }
          seenTier.add(key);
        });
      });
  }, [t]);

  const defaults: PlanValues = plan ? planToValues(plan) : (initial ?? emptyPlanValues());
  const form = useForm<PlanValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const fees = useFieldArray({ control: form.control, name: 'fees' });
  const tiers = useFieldArray({ control: form.control, name: 'tiers' });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      size="lg"
      title={editing ? t('ops.rp.editing', { name: plan.name }) : t('ops.rp.newDraft')}
      submitLabel={editing ? t('ops.rp.saveDraft') : t('ops.rp.createDraft')}
      onSubmit={async (v) => {
        await save.mutateAsync({
          ...valuesToInput(v, plan?.id),
          ifMatch: plan ? plan.version : undefined,
        });
        toast.success(editing ? t('ops.rp.updated') : t('ops.rp.created'));
      }}
    >
      <FormSection title={t('ops.rp.secBasics')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="categoryCode"
            label={t('ops.rp.category')}
            noneLabel={t('ops.rp.chooseCategory')}
            options={(categories.data ?? []).map((c) => ({
              value: c.code,
              label: `${c.displayName} (${c.code})`,
            }))}
            testId="rp-category"
          />
          <TextField
            control={form.control}
            name="name"
            label={t('ops.rp.name')}
            data-testid="rp-name"
          />
          <SelectField
            control={form.control}
            name="scope"
            label={t('ops.rp.scope')}
            noneLabel={restricted ? undefined : t('ops.rp.allLocations')}
            options={scopeChoices}
          />
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('ops.rp.currency')}</FormLabel>
                <FormControl>
                  <LookupSelect typeCode="currency" value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </FormSection>

      <FormSection title={t('ops.rp.secPricing')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            control={form.control}
            name="baseDay"
            label={t('ops.rp.baseDay')}
            description={t('ops.rp.baseDayHint')}
            inputMode="decimal"
            data-testid="rp-base"
          />
          <TextField
            control={form.control}
            name="hour"
            label={t('ops.rp.extraHour')}
            description={t('ops.rp.extraHourHint')}
            inputMode="decimal"
          />
          <TextField
            control={form.control}
            name="taxPct"
            label={t('ops.rp.taxPct')}
            inputMode="decimal"
          />
        </div>
      </FormSection>

      <FormSection title={t('ops.rp.secValidity')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="effectiveFrom"
            label={t('ops.rp.effectiveFrom')}
            description={t('ops.rp.effectiveFromHint')}
            type="date"
            min={editing ? undefined : todayIso()}
          />
          <TextField
            control={form.control}
            name="effectiveTo"
            label={t('ops.rp.effectiveTo')}
            description={t('ops.rp.effectiveToHint')}
            type="date"
            min={form.watch('effectiveFrom') || undefined}
          />
          <TextField
            control={form.control}
            name="minDuration"
            label={t('ops.rp.minDuration')}
            inputMode="numeric"
          />
          <TextField
            control={form.control}
            name="maxDuration"
            label={t('ops.rp.maxDuration')}
            description={t('ops.rp.maxDurationHint')}
            inputMode="numeric"
          />
        </div>
      </FormSection>

      <FormSection title={t('ops.rp.fees')}>
        {fees.fields.map((f, i) => (
          <div key={f.id} className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr_7rem]">
              <TextField
                control={form.control}
                name={`fees.${i}.code`}
                label={t('ops.rp.feeCode')}
              />
              <TextField
                control={form.control}
                name={`fees.${i}.label`}
                label={t('ops.rp.feeLabel')}
              />
              <TextField
                control={form.control}
                name={`fees.${i}.amount`}
                label={t('ops.rp.feeAmount')}
                inputMode="decimal"
              />
            </div>
            <div className="flex items-center justify-between">
              <FormField
                control={form.control}
                name={`fees.${i}.taxable`}
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer font-normal">
                      {t('ops.rp.feeTaxable')}
                    </FormLabel>
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => fees.remove(i)}
              >
                <Trash2 aria-hidden="true" />
                {t('ops.rp.remove')}
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fees.append({ code: '', label: '', amount: '', taxable: true })}
          data-testid="rp-add-fee"
        >
          <Plus aria-hidden="true" />
          {t('ops.rp.addFee')}
        </Button>
      </FormSection>

      <FormSection title={t('ops.rp.tiers')} hint={t('ops.rp.tiersHint')}>
        {tiers.fields.map((f, i) => (
          <div key={f.id} className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <TextField
                control={form.control}
                name={`tiers.${i}.minHours`}
                label={t('ops.rp.tierMinHours')}
                inputMode="numeric"
              />
              <TextField
                control={form.control}
                name={`tiers.${i}.day`}
                label={t('ops.rp.tierRate')}
                inputMode="decimal"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mt-7 text-muted-foreground hover:text-destructive"
              onClick={() => tiers.remove(i)}
              aria-label={t('ops.rp.remove')}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => tiers.append({ minHours: '', day: '' })}
        >
          <Plus aria-hidden="true" />
          {t('ops.rp.addTier')}
        </Button>
      </FormSection>
    </FormSheet>
  );
}
