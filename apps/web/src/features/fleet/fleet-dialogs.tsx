import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { SelectField } from '@/components/form-fields';
import { LookupSelect } from '@/components/lookup-select';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useLocations } from '@/lib/discovery-hooks';
import { useLocationScope } from '@/lib/location-scope';
import {
  useAddFleetBlock,
  useReleaseFleetBlock,
  useSetUnitRetired,
  useTransferUnit,
  type FleetBlock,
  type OpsUnit,
} from '@/lib/ops-discovery-hooks';

export const BLOCK_KINDS = ['maintenance', 'damage', 'admin_block'] as const;
const KNOWN_KINDS = new Set<string>(BLOCK_KINDS);

/** Localised label for a block kind, with a readable fallback for one we don't know yet. */
export function useBlockKindLabel() {
  const { t } = useI18n();
  return (kind: string) =>
    KNOWN_KINDS.has(kind) ? t(`ops.fleet.blockKind.${kind}`) : kind.replace(/_/g, ' ');
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Hold a vehicle out of bookings (maintenance also takes it out of service). */
export function BlockDialog({
  unit,
  activeHolds,
  open,
  onOpenChange,
}: DialogProps & { unit: OpsUnit; activeHolds: number }) {
  const { t } = useI18n();
  const kindLabel = useBlockKindLabel();
  const addBlock = useAddFleetBlock();
  const schema = useMemo(
    () => z.object({ kind: z.string(), reasonCode: z.string().min(1, t('error.field.required')) }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { kind: 'maintenance', reasonCode: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      destructive
      title={t('ops.fleet.blockTitle', { plate: unit.plate })}
      description={
        <>
          {t('ops.fleet.blockBodyMaintenance')}
          {activeHolds > 0 ? (
            <span className="mt-2 block font-medium text-warning">
              {t('ops.fleet.alreadyHeld', { n: activeHolds })}
            </span>
          ) : null}
        </>
      }
      submitLabel={t('ops.fleet.block')}
      onSubmit={async ({ kind, reasonCode }) => {
        await addBlock.mutateAsync({
          unitId: unit.id,
          kind,
          reasonCode,
          startAt: new Date().toISOString(),
        });
        toast.success(
          t(kind === 'maintenance' ? 'ops.fleet.blockedMsg' : 'ops.fleet.blockedMsgOther', {
            plate: unit.plate,
          }),
        );
      }}
    >
      <SelectField
        control={form.control}
        name="kind"
        label={t('ops.fin.kind')}
        options={BLOCK_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
      />
      <FormField
        control={form.control}
        name="reasonCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('ops.fleet.reason')}</FormLabel>
            <FormControl>
              <LookupSelect
                typeCode="block_reason"
                value={field.value}
                onChange={field.onChange}
                invalid={!!form.formState.errors.reasonCode}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </FormDialog>
  );
}

/** Move a vehicle to another location. */
export function TransferDialog({ unit, open, onOpenChange }: DialogProps & { unit: OpsUnit }) {
  const { t } = useI18n();
  const transfer = useTransferUnit();
  // the destination is a write target, not a view filter: the full org list, not just the
  // actor's own scope — a fleet manager may transfer to a branch outside their view
  const locations = useLocations();
  const { options: mine, restricted } = useLocationScope();
  const schema = useMemo(
    () => z.object({ toLocationCode: z.string().min(1, t('error.field.required')) }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { toLocationCode: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.fleet.transferTitle', { plate: unit.plate })}
      description={t('ops.fleet.transferBody')}
      submitLabel={t('ops.fleet.transfer')}
      onSubmit={async ({ toLocationCode }) => {
        const r = await transfer.mutateAsync({ unitId: unit.id, toLocationCode });
        toast.success(
          t('ops.fleet.transferredMsg', { plate: unit.plate, to: r.currentLocationCode }),
        );
      }}
    >
      <SelectField
        control={form.control}
        name="toLocationCode"
        label={t('ops.fleet.transferTo')}
        noneLabel={t('ops.fleet.transferPick')}
        options={(locations.data ?? [])
          .filter((l) => l.code !== unit.currentLocationCode)
          .map((l) => ({ value: l.code, label: `${l.name} (${l.code})` }))}
      />
      {restricted &&
      form.watch('toLocationCode') &&
      !mine.some((o) => o.code === form.watch('toLocationCode')) ? (
        <p role="note" className="text-sm text-warning" data-testid="transfer-leaves-note">
          {t('ops.fleet.transferLeaves')}
        </p>
      ) : null}
    </FormDialog>
  );
}

/** Retire a vehicle from the active fleet, or bring a retired one back. */
export function RetireDialog({ unit, open, onOpenChange }: DialogProps & { unit: OpsUnit }) {
  const { t } = useI18n();
  const setRetired = useSetUnitRetired();
  const restoring = unit.state === 'retired';
  const form = useForm<Record<string, never>>({ defaultValues: {} });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{}}
      destructive={!restoring}
      title={t(restoring ? 'ops.fleet.restoreTitle' : 'ops.fleet.retireTitle', {
        plate: unit.plate,
      })}
      description={t(restoring ? 'ops.fleet.restoreBody' : 'ops.fleet.retireBody')}
      submitLabel={restoring ? t('ops.fleet.restore') : t('ops.fleet.retire')}
      onSubmit={async () => {
        await setRetired.mutateAsync({ id: unit.id, retired: !restoring });
        toast.success(
          t(restoring ? 'ops.fleet.unitRestoredMsg' : 'ops.fleet.unitRetiredMsg', {
            plate: unit.plate,
          }),
        );
      }}
    ></FormDialog>
  );
}

/** Lift an active hold. */
export function ReleaseDialog({ block, open, onOpenChange }: DialogProps & { block: FleetBlock }) {
  const { t } = useI18n();
  const release = useReleaseFleetBlock();
  const form = useForm<Record<string, never>>({ defaultValues: {} });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{}}
      title={t('ops.fleet.releaseTitle', { plate: block.plate })}
      description={t('ops.fleet.releaseBody')}
      submitLabel={t('ops.fleet.release')}
      onSubmit={async () => {
        await release.mutateAsync(block.id);
        toast.success(t('ops.fleet.releasedMsg', { plate: block.plate }));
      }}
    ></FormDialog>
  );
}
