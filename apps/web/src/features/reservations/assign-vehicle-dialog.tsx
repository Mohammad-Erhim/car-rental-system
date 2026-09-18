import { useI18n } from '@carrental/i18n/react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { FormDialog } from '@/components/form-dialog';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOpsUnits } from '@/lib/ops-discovery-hooks';
import { useAssignVehicle } from '@/lib/rental-hooks';

/** The bits of a reservation the assign flow needs — satisfied by both the list row and detail. */
export interface AssignTarget {
  reference: string;
  categoryCode: string;
  pickupLocationCode: string;
  pickedUnit: { id: string; plate: string; make: string | null; model: string | null } | null;
}

/** "auto-pick" — Radix Select can't hold an empty value. */
const AUTO = '__auto__';

const carName = (u: { make: string | null; model: string | null }) =>
  [u.make, u.model].filter(Boolean).join(' ');

/**
 * Assign a vehicle to a confirmed reservation, which creates its rental. One modal shared by the
 * queue and the detail page. The staff member can leave it on auto-pick or choose one of the
 * available vehicles; a car the customer picked at checkout is offered first and flagged.
 */
export function AssignVehicleDialog({
  target,
  open,
  onOpenChange,
  variant = 'assign',
}: {
  target: AssignTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `reassign` swaps the car on a rental that hasn't been picked up yet (no new rental is made) */
  variant?: 'assign' | 'reassign';
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const assign = useAssignVehicle();
  const form = useForm<{ unitId: string }>({ defaultValues: { unitId: '' } });
  const units = useOpsUnits(
    {
      categoryCode: target.categoryCode,
      locationCode: target.pickupLocationCode,
      state: 'available',
    },
    { enabled: open },
  );

  const available = units.data?.results ?? [];
  const pick = target.pickedUnit;
  // the customer's pick may no longer be "available" (or may not have loaded) — still offer it
  const pickListed = !!pick && available.some((u) => u.id === pick.id);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{ unitId: pick?.id ?? '' }}
      title={variant === 'reassign' ? t('ops.rentd.reassignTitle') : t('ops.resv.assignTitle')}
      description={
        variant === 'reassign'
          ? t('ops.rentd.reassignBody')
          : t('ops.resv.assignBody', { ref: target.reference })
      }
      submitLabel={variant === 'reassign' ? t('ops.rentd.reassign') : t('ops.queue.assign')}
      onSubmit={async ({ unitId }) => {
        const rental = await assign.mutateAsync({
          reference: target.reference,
          unitId: unitId || undefined,
        });
        if (variant === 'reassign') {
          toast.success(t('ops.rentd.reassigned'));
          return;
        }
        toast.success(t('ops.queue.assigned', { ref: target.reference }), {
          description: t('ops.queue.assignedTo', { rental: rental.reference }),
          action: {
            label: t('ops.queue.openRental'),
            onClick: () => navigate(`/rentals/${encodeURIComponent(rental.reference)}`),
          },
        });
      }}
    >
      {pick ? (
        <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
          {t('ops.resv.customerPicked', { car: carName(pick), plate: pick.plate })}
        </p>
      ) : null}

      <FormField
        control={form.control}
        name="unitId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('ops.resv.assignUnit')}</FormLabel>
            <Select
              value={field.value || AUTO}
              onValueChange={(v) => field.onChange(v === AUTO ? '' : v)}
            >
              <FormControl>
                <SelectTrigger data-testid="assign-unit-select">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={AUTO}>{t('ops.resv.assignAuto')}</SelectItem>
                {available.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.plate} — {[u.year, u.make, u.model].filter(Boolean).join(' ') || u.vin}
                    {u.id === pick?.id ? ` (${t('ops.resv.customerPickedBadge')})` : ''}
                  </SelectItem>
                ))}
                {pick && !pickListed ? (
                  <SelectItem value={pick.id}>
                    {pick.plate} — {carName(pick)} ({t('ops.resv.customerPickedBadge')})
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <FormDescription>{t('ops.resv.assignUnitHint')}</FormDescription>
          </FormItem>
        )}
      />
    </FormDialog>
  );
}
