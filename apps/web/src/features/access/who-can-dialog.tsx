import { useI18n } from '@carrental/i18n/react';

import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useWhoCan, type AccessSource, type PermissionAction } from '@/lib/access-hooks';

export const sourceLabel = (
  s: AccessSource,
  t: (k: string, v?: Record<string, string | number>) => string,
) =>
  s.kind === 'role'
    ? s.name
    : t(s.effect === 'allow' ? 'ops.access.viaAllow' : 'ops.access.viaDeny');

/** Everyone who can do one thing right now, and through which role or exception. */
export function WhoCanDialog({
  action,
  open,
  onOpenChange,
}: {
  action: PermissionAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const who = useWhoCan(action.code);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('action.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('ops.access.whoCanTitle')}</DialogTitle>
          <DialogDescription>
            <span className="bidi-isolate font-mono">{action.code}</span> — {action.description}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto" data-testid="who-can-list">
          {who.isLoading ? (
            <Skeleton className="h-24" />
          ) : who.isError ? (
            <StateView kind="error" title={t('ops.access.loadFail')} />
          ) : !who.data?.length ? (
            <StateView title={t('ops.access.nobody')} className="py-8" />
          ) : (
            <ul className="divide-y">
              {who.data.map((p) => (
                <li
                  key={p.accountId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.sources.map((s, i) => (
                      <Badge key={i} variant="secondary">
                        {sourceLabel(s, t)}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
