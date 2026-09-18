import { useI18n } from '@carrental/i18n/react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { useLocationStatus, useOpsLocationImpact, type OpsLocation } from '@/lib/admin-hooks';

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
  const n = (impact.data?.futureReservations ?? 0) + (impact.data?.openRentals ?? 0);

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
            ? t('ops.loc.archiveImpact', { n })
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
