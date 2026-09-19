import { useI18n } from '@carrental/i18n/react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import {
  useLocationStatus,
  useOpsLocationImpact,
  type LocationImpact,
  type OpsLocation,
} from '@/lib/admin-hooks';

const TONE = { active: 'success', draft: 'warning', archived: 'secondary' } as const;

export function LocationStatus({ status }: { status: OpsLocation['status'] }) {
  const { t } = useI18n();
  return <Badge variant={TONE[status]}>{t(`ops.loc.status.${status}`)}</Badge>;
}

/**
 * Archive a location (never deleted, history is kept). It first counts the upcoming bookings and
 * open rentals tied to it, says so, and only then forces the archive — the operator sees what
 * they are leaving behind.
 */
/** The non-zero things archiving would strand, as short phrases ("3 vehicles parked here"). */
function impactItems(
  i: LocationImpact,
  t: (key: string, values?: Record<string, string | number>) => string,
): string[] {
  const rows: Array<[number, string]> = [
    [i.futureReservations + i.openRentals, 'ops.loc.impactBookings'],
    [i.units, 'ops.loc.impactUnits'],
    [i.staff, 'ops.loc.impactStaff'],
    [i.ratePlans, 'ops.loc.impactPlans'],
    [i.products, 'ops.loc.impactProducts'],
  ];
  return rows.filter(([n]) => n > 0).map(([n, key]) => t(key, { n }));
}

export function ArchiveDialog({
  location,
  open,
  onOpenChange,
}: {
  location: OpsLocation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const status = useLocationStatus();
  const impact = useOpsLocationImpact(open ? location.code : null);
  const items = impact.data ? impactItems(impact.data, t) : [];
  const n = items.length;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
      title={t('ops.loc.archiveQ')}
      description={
        impact.isLoading
          ? t('ops.st.loading')
          : n > 0
            ? t('ops.loc.archiveImpactList', { items: items.join(', ') })
            : t('ops.loc.archiveBody')
      }
      confirmLabel={t('ops.loc.archive')}
      onConfirm={async () => {
        await status.mutateAsync({ code: location.code, action: 'archive', force: n > 0 });
        toast.success(t('ops.loc.archived', { name: location.name }));
      }}
    />
  );
}

/** Restore an archived location straight away; failures surface as a toast. */
export function useRestoreLocation() {
  const { t } = useI18n();
  const status = useLocationStatus();
  return async (location: OpsLocation) => {
    try {
      await status.mutateAsync({ code: location.code, action: 'restore' });
      toast.success(t('ops.loc.restored', { name: location.name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.loc.statusFail'));
    }
  };
}
