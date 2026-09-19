import { useI18n } from '@carrental/i18n/react';
import { History } from 'lucide-react';

import { StateView } from '@/components/state-view';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccessHistory, type AccessEvent } from '@/lib/access-hooks';

/** A short human reading of what changed, from the audit before/after. */
function summary(e: AccessEvent): string {
  const after = e.after ?? {};
  const bits: string[] = [];
  const list = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(', ') : '');
  if (after.roleCode) bits.push(String(after.roleCode));
  if (after.action) bits.push(`${after.action} → ${after.effect ?? ''}`);
  if (Array.isArray(after.added) && after.added.length) bits.push(`+ ${list(after.added)}`);
  if (Array.isArray(after.removed) && after.removed.length) bits.push(`− ${list(after.removed)}`);
  if (after.name && !bits.length) bits.push(String(after.name));
  return bits.join(' · ');
}

/** Every access change, newest first: who did it, to what, and why. */
export function HistoryTab({ accountId }: { accountId?: string }) {
  const { t, fmt } = useI18n();
  const h = useAccessHistory(accountId);
  if (h.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (h.isError || !h.data) {
    return (
      <StateView
        kind="error"
        title={t('ops.access.loadFail')}
        actionLabel={t('ops.st.retry')}
        onAction={() => void h.refetch()}
      />
    );
  }
  if (!h.data.length) return <StateView icon={History} title={t('ops.access.noHistory')} />;
  return (
    <Card className="divide-y" data-testid="access-history">
      {h.data.map((e) => (
        <div key={e.seq} className="flex flex-wrap items-start justify-between gap-2 p-4">
          <div className="min-w-0">
            <p className="font-medium">
              {t(`ops.access.event.${e.action}`) === `ops.access.event.${e.action}`
                ? e.action
                : t(`ops.access.event.${e.action}`)}
            </p>
            <p className="text-sm text-muted-foreground">
              <span
                className={
                  e.targetLabel ? 'font-medium text-foreground' : 'bidi-isolate font-mono text-xs'
                }
              >
                {e.targetLabel ?? e.targetId ?? e.targetType}
              </span>
              {summary(e) ? ` — ${summary(e)}` : ''}
              {e.reason ? ` · ${e.reason}` : ''}
            </p>
          </div>
          <div className="text-end text-xs text-muted-foreground">
            <p>{e.actorLabel ?? t('ops.access.system')}</p>
            <p>{fmt.dateTime(e.occurredAt)}</p>
          </div>
        </div>
      ))}
    </Card>
  );
}
