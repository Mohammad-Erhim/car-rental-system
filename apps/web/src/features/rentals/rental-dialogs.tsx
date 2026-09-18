import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { SelectField, TextareaField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { FormControl, FormItem, FormLabel } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useOpsUnits } from '@/lib/ops-discovery-hooks';
import {
  useExtendRental,
  usePickup,
  useRaiseIncident,
  useReadiness,
  useReturnRental,
} from '@/lib/rental-hooks';
import { cn } from '@/lib/utils';

interface DialogProps {
  reference: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const INCIDENT_CATEGORIES = ['breakdown', 'accident', 'damage', 'other'] as const;
const whole = /^\d+$/;
const amount = /^\d+(\.\d{1,2})?$/;

/** Shared field rules, localised. */
function useRules() {
  const { t } = useI18n();
  return useMemo(
    () => ({
      km: z.string().trim().regex(whole, t('ops.rent.numberOnly')),
      pct: z
        .string()
        .trim()
        .regex(whole, t('ops.rent.pct0to100'))
        .refine((v) => Number(v) <= 100, t('ops.rent.pct0to100')),
      required: z.string().trim().min(1, t('error.field.required')),
    }),
    [t],
  );
}

/** Hand the vehicle over: odometer + fuel out and the driver's licence. */
export function PickupDialog({
  reference,
  defaultDriver,
  open,
  onOpenChange,
}: DialogProps & { defaultDriver?: string | null }) {
  const { t } = useI18n();
  const pickup = usePickup(reference);
  const r = useRules();
  const schema = useMemo(
    () =>
      z.object({
        odometerKm: r.km,
        fuelPct: r.pct,
        driverName: r.required,
        licenceNumber: r.required,
      }),
    [r],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = {
    odometerKm: '',
    fuelPct: '100',
    driverName: defaultDriver ?? '',
    licenceNumber: '',
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.rent.runPickup')}
      description={t('ops.rent.pickupDesc')}
      submitLabel={t('ops.rent.confirmPickup')}
      onSubmit={async (v) => {
        await pickup.mutateAsync({
          odometerKm: Number(v.odometerKm),
          fuelPct: Number(v.fuelPct),
          driverName: v.driverName.trim(),
          licenceNumber: v.licenceNumber.trim(),
        });
        toast.success(t('ops.rent.pickupDone', { ref: reference }));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={form.control}
          name="odometerKm"
          label={t('ops.rent.odoOut')}
          inputMode="numeric"
          autoFocus
          data-testid={`pickup-odo-${reference}`}
        />
        <TextField
          control={form.control}
          name="fuelPct"
          label={t('ops.rent.fuelOut')}
          inputMode="numeric"
        />
      </div>
      <TextField
        control={form.control}
        name="driverName"
        label={t('ops.rent.driverName')}
        data-testid={`pickup-driver-${reference}`}
      />
      <TextField
        control={form.control}
        name="licenceNumber"
        label={t('ops.rent.licence')}
        description={t('ops.rent.licenceHint')}
        data-testid={`pickup-licence-${reference}`}
      />
    </FormDialog>
  );
}

/**
 * Take the vehicle back. Irreversible: it closes the rental and settles fuel + damage against the
 * card on file, so the dialog shows a live summary of what will be charged before confirming.
 */
export function ReturnDialog({
  reference,
  currency,
  odometerOutKm,
  fuelOutPct,
  open,
  onOpenChange,
}: DialogProps & { currency: string; odometerOutKm: number | null; fuelOutPct: number | null }) {
  const { t, fmt } = useI18n();
  const ret = useReturnRental(reference);
  const r = useRules();
  const money = (minor: number) => fmt.money({ amountMinor: minor, currency });

  const schema = useMemo(
    () =>
      z
        .object({
          odometerKm: r.km,
          fuelPct: r.pct,
          findings: z.array(
            z.object({
              area: r.required,
              description: r.required,
              charge: z
                .string()
                .trim()
                .refine((v) => v === '' || amount.test(v), t('error.field.invalid')),
            }),
          ),
        })
        .superRefine((v, ctx) => {
          if (
            odometerOutKm != null &&
            whole.test(v.odometerKm) &&
            Number(v.odometerKm) < odometerOutKm
          ) {
            ctx.addIssue({
              code: 'custom',
              path: ['odometerKm'],
              message: t('ops.rent.odoTooLow'),
            });
          }
        }),
    [r, t, odometerOutKm],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { odometerKm: '', fuelPct: '100', findings: [] };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'findings' });
  const live = useWatch({ control: form.control });

  const odo = whole.test(live.odometerKm ?? '') ? Number(live.odometerKm) : null;
  const fuel = whole.test(live.fuelPct ?? '') ? Number(live.fuelPct) : null;
  const deficit = fuel != null && fuelOutPct != null ? Math.max(0, fuelOutPct - fuel) : 0;
  const findingsMinor = (live.findings ?? []).reduce(
    (sum, f) => sum + (f?.charge && amount.test(f.charge) ? Math.round(Number(f.charge) * 100) : 0),
    0,
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.rent.returnConfirmTitle')}
      description={t('ops.rent.returnConfirmBody')}
      submitLabel={t('ops.rent.confirmReturn')}
      size="lg"
      onSubmit={async (v) => {
        const findings = v.findings.map((f) => ({
          area: f.area.trim().slice(0, 80),
          description: f.description.trim().slice(0, 500),
          chargeMinor: f.charge.trim() ? Math.round(Number(f.charge) * 100) : 0,
        }));
        const res = await ret.mutateAsync({
          odometerKm: Number(v.odometerKm),
          fuelPct: Number(v.fuelPct),
          findings: findings.length ? findings : undefined,
        });
        if (res.settlementCollected) {
          toast.success(
            t('ops.rent.returnedMsg', {
              total: money(res.adjustmentMinor),
              fuel: money(res.fuelMinor),
            }),
          );
        } else {
          // returned, but the money wasn't collected — finance owns the follow-up
          toast.warning(
            t('ops.rent.returnedSettlementFailedMsg', { total: money(res.adjustmentMinor) }),
            {
              duration: 15000,
            },
          );
        }
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <TextField
          control={form.control}
          name="odometerKm"
          label={t('ops.rent.odoIn')}
          description={
            odometerOutKm != null ? t('ops.rent.odoOutWas', { km: odometerOutKm }) : undefined
          }
          placeholder={t('ops.rent.odoPlaceholder')}
          inputMode="numeric"
          autoFocus
          data-testid={`return-odo-${reference}`}
        />
        <TextField
          control={form.control}
          name="fuelPct"
          label={t('ops.rent.fuelIn')}
          description={t('ops.rent.fuelInHint')}
          inputMode="numeric"
          data-testid={`return-fuel-${reference}`}
        />
      </div>

      <section className="space-y-3" aria-label={t('ops.rent.findings')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{t('ops.rent.findings')}</h3>
            <p className="text-xs text-muted-foreground">{t('ops.rent.findingsHint')}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => append({ area: '', description: '', charge: '' })}
            data-testid={`return-add-finding-${reference}`}
          >
            <Plus aria-hidden="true" />
            {t('ops.rent.addFinding')}
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
            {t('ops.rent.noFindingsYet')}
          </p>
        ) : null}

        {fields.map((f, i) => (
          <fieldset
            key={f.id}
            className="space-y-3 rounded-lg border bg-muted/20 p-4"
            data-testid={`return-finding-${reference}-${i}`}
          >
            <div className="flex items-center justify-between gap-2">
              <legend className="float-left text-sm font-medium">
                {t('ops.rent.findingN', { n: i + 1 })}
              </legend>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="-me-1.5 -mt-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => remove(i)}
                aria-label={t('ops.rent.removeFinding')}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
              <TextField
                control={form.control}
                name={`findings.${i}.area`}
                label={t('ops.rent.findingAreaLabel')}
                placeholder={t('ops.rent.findingAreaHint')}
                maxLength={80}
              />
              <TextField
                control={form.control}
                name={`findings.${i}.charge`}
                label={`${t('ops.rent.findingCharge')} (${currency})`}
                placeholder="0.00"
                inputMode="decimal"
              />
            </div>
            <TextField
              control={form.control}
              name={`findings.${i}.description`}
              label={t('ops.rent.findingDesc')}
              placeholder={t('ops.rent.findingDescHint')}
              maxLength={500}
            />
          </fieldset>
        ))}
      </section>

      <dl className="space-y-1.5 rounded-lg bg-muted/50 p-4 text-sm">
        <dt className="font-semibold">{t('ops.rent.returnReview')}</dt>
        <dd className="text-muted-foreground">
          {t('ops.rent.returnOdoLine', {
            inKm: live.odometerKm || '—',
            outLine:
              odometerOutKm != null && odo != null
                ? t('ops.rent.returnOdoDelta', { km: odo - odometerOutKm })
                : '',
          })}
        </dd>
        <dd className="text-muted-foreground">
          {deficit > 0
            ? t('ops.rent.returnFuelLine', {
                inPct: live.fuelPct ?? '',
                outPct: fuelOutPct ?? 100,
                deficit,
              })
            : t('ops.rent.returnFuelLineNoDeficit', { inPct: live.fuelPct ?? '' })}
        </dd>
        <dd className="text-muted-foreground">
          {fields.length
            ? t('ops.rent.returnFindingsLine', { n: fields.length, total: money(findingsMinor) })
            : t('ops.rent.returnNoFindings')}
        </dd>
        <dd className="pt-1 text-xs text-muted-foreground">{t('ops.rent.returnSettleNote')}</dd>
      </dl>
    </FormDialog>
  );
}

/** Log an incident on a rental in progress, optionally swapping to a same-category spare. */
export function IncidentDialog({
  reference,
  categoryCode,
  locationCode,
  open,
  onOpenChange,
}: DialogProps & { categoryCode: string | null; locationCode: string }) {
  const { t } = useI18n();
  const incident = useRaiseIncident(reference);
  const defaults = { category: 'breakdown', replacementUnitId: '', note: '' };
  const form = useForm<typeof defaults>({ defaultValues: defaults });
  // a replacement must be a same-category available unit at this location — the API rejects a
  // category mismatch — so only offer those
  const spares = useOpsUnits(
    { categoryCode: categoryCode ?? undefined, locationCode, state: 'available' },
    { enabled: open },
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      destructive
      title={t('ops.rent.incidentTitle')}
      submitLabel={t('ops.rent.incidentSubmit')}
      onSubmit={async (v) => {
        await incident.mutateAsync({
          category: v.category as (typeof INCIDENT_CATEGORIES)[number],
          note: v.note.trim() || undefined,
          replacementUnitId: v.replacementUnitId || undefined,
        });
        toast.success(
          v.replacementUnitId
            ? t('ops.rent.incidentSwapped', { ref: reference })
            : t('ops.rent.incidentLogged', { ref: reference }),
        );
      }}
    >
      <SelectField
        control={form.control}
        name="category"
        label={t('ops.rent.incidentCategory')}
        options={INCIDENT_CATEGORIES.map((c) => ({
          value: c,
          label: t(`ops.rent.incidentCat.${c}`),
        }))}
        testId={`incident-category-${reference}`}
      />
      <SelectField
        control={form.control}
        name="replacementUnitId"
        label={t('ops.rent.incidentReplacement')}
        noneLabel={t('ops.rent.incidentNoReplacement')}
        options={(spares.data?.results ?? []).map((u) => ({
          value: u.id,
          label: `${u.plate} — ${[u.year, u.make, u.model].filter(Boolean).join(' ') || u.vin}`,
        }))}
        testId={`incident-replacement-${reference}`}
      />
      <TextareaField control={form.control} name="note" label={t('ops.rent.incidentNote')} />
    </FormDialog>
  );
}

/** Record the readiness check on a returned vehicle: back to the fleet, or off to maintenance. */
export function ReadinessDialog({ reference, open, onOpenChange }: DialogProps) {
  const { t } = useI18n();
  const readiness = useReadiness(reference);
  const defaults = { outcome: 'pass' };
  const form = useForm<typeof defaults>({ defaultValues: defaults });
  const outcome = useWatch({ control: form.control, name: 'outcome' });

  const options = [
    {
      value: 'pass',
      title: t('ops.rentd.readyPassBtn'),
      body: t('ops.rentd.readyPassBody'),
    },
    {
      value: 'fail',
      title: t('ops.rentd.readyFailBtn'),
      body: t('ops.rentd.readyFailBody'),
    },
  ];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      destructive={outcome === 'fail'}
      title={t('ops.rent.readinessTitle')}
      description={t('ops.rent.readinessDesc')}
      submitLabel={outcome === 'fail' ? t('ops.rentd.readyFailBtn') : t('ops.rentd.readyPassBtn')}
      onSubmit={async (v) => {
        const passed = v.outcome === 'pass';
        await readiness.mutateAsync(passed);
        toast.success(passed ? t('ops.rentd.readyPass') : t('ops.rentd.readyFail'));
      }}
    >
      <RadioGroup
        value={outcome}
        onValueChange={(v) => form.setValue('outcome', v)}
        aria-label={t('ops.rent.readinessTitle')}
      >
        {options.map((o) => (
          <FormItem key={o.value}>
            <FormLabel
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-accent/50',
                outcome === o.value &&
                  (o.value === 'fail'
                    ? 'border-destructive bg-destructive/5'
                    : 'border-primary bg-primary/5'),
              )}
            >
              <FormControl>
                <RadioGroupItem value={o.value} className="mt-0.5" />
              </FormControl>
              <span className="space-y-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {o.value === 'fail' ? <Wrench className="size-3.5" aria-hidden="true" /> : null}
                  {o.title}
                </span>
                <span className="block text-xs text-muted-foreground">{o.body}</span>
              </span>
            </FormLabel>
          </FormItem>
        ))}
      </RadioGroup>
    </FormDialog>
  );
}

/** Extend an active hire. Re-prices for the new dates and charges the difference. */
export function ExtendDialog({
  reference,
  currency,
  currentReturnAt,
  open,
  onOpenChange,
}: DialogProps & { currency: string; currentReturnAt: string }) {
  const { t, fmt } = useI18n();
  const extend = useExtendRental(reference);
  const schema = useMemo(
    () =>
      z.object({
        newReturnAt: z
          .string()
          .min(1, t('error.field.required'))
          .refine((v) => new Date(v) > new Date(currentReturnAt), t('ops.rentd.extendLater')),
      }),
    [t, currentReturnAt],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { newReturnAt: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.rentd.extendTitle')}
      description={t('ops.rentd.extendBody')}
      submitLabel={t('ops.rentd.extend')}
      onSubmit={async ({ newReturnAt }) => {
        const res = await extend.mutateAsync({ newReturnAt: new Date(newReturnAt).toISOString() });
        toast.success(
          t('ops.rentd.extended', {
            delta: fmt.money({ amountMinor: res.deltaMinor, currency }),
          }),
        );
      }}
    >
      <p className="text-sm text-muted-foreground">
        {t('ops.rentd.currentReturn', { at: fmt.dateTime(currentReturnAt) })}
      </p>
      <TextField
        control={form.control}
        name="newReturnAt"
        label={t('ops.rentd.newReturn')}
        type="datetime-local"
        min={currentReturnAt.slice(0, 16)}
      />
    </FormDialog>
  );
}
