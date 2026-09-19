import { useI18n } from '@carrental/i18n/react';

import { DetailList } from '@/components/detail-list';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { diffPayloads } from '@/features/config-workflow/payload-diff';
import type { AuditRow } from '@/lib/admin-hooks';

export const OUTCOME_TONE: Record<string, BadgeProps['variant']> = {
  accepted: 'success',
  rejected: 'warning',
  failed: 'destructive',
};

/**
 * One audit event in full: who, what, on which record, the reason given, and what changed
 * (field by field, from the masked before/after snapshots — sensitive values were masked at write
 * time, SRS-SEC-011, and are never un-masked here). Actor and target can narrow the list.
 */
export function AuditDetailSheet({
  row,
  onActor,
  onTarget,
  open,
  onOpenChange,
}: {
  row: AuditRow;
  onActor: (actorId: string) => void;
  onTarget: (type: string, id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, fmt } = useI18n();
  const changes = diffPayloads(row.before ?? {}, row.after ?? {});
  const mono = (v: string) => <span className="bidi-isolate break-all font-mono text-xs">{v}</span>;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={t('action.close')} className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetHeader className="pe-8">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span className="bidi-isolate break-all font-mono text-base">{row.action}</span>
            <Badge variant={OUTCOME_TONE[row.outcome] ?? 'secondary'}>{row.outcome}</Badge>
          </SheetTitle>
          <SheetDescription>{fmt.dateTime(row.occurredAt)}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <DetailList
            className="sm:grid-cols-1 xl:grid-cols-1"
            items={[
              {
                term: t('ops.audit.hActor'),
                detail: (
                  <span className="flex flex-wrap items-center gap-2">
                    {row.actor}
                    {row.actorId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onActor(row.actorId!);
                          onOpenChange(false);
                        }}
                      >
                        {t('ops.audit.filterByActor')}
                      </Button>
                    ) : null}
                  </span>
                ),
              },
              {
                term: t('ops.audit.hTarget'),
                detail:
                  row.targetType && row.targetId ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span>{row.targetType}</span>
                      {mono(row.targetId)}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onTarget(row.targetType!, row.targetId!);
                          onOpenChange(false);
                        }}
                      >
                        {t('ops.audit.filterByTarget')}
                      </Button>
                    </span>
                  ) : (
                    (row.targetType ?? '—')
                  ),
              },
              {
                term: t('ops.audit.filterSurface'),
                detail: row.surface ? t(`ops.audit.surface.${row.surface}`) : '—',
              },
              { term: t('ops.audit.reason'), detail: row.reason || '—' },
            ]}
          />

          <section aria-label={t('ops.audit.changes')} className="space-y-2">
            <h3 className="text-sm font-semibold">{t('ops.audit.changes')}</h3>
            {changes.length ? (
              <ul
                className="space-y-1.5 rounded-lg border bg-muted/30 p-3"
                data-testid="audit-changes"
              >
                {changes.map((c) => (
                  <li key={c.path} className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-xs">
                    <span className="text-muted-foreground">{c.path}:</span>
                    <span>{c.before ?? '∅'}</span>
                    <span aria-hidden="true">→</span>
                    <span className="font-medium">{c.after ?? '∅'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('ops.audit.noChanges')}</p>
            )}
          </section>

          {row.before || row.after ? (
            <details className="rounded-lg border">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                {t('ops.audit.rawSnapshots')}
              </summary>
              <div className="grid gap-3 border-t p-3">
                {(['before', 'after'] as const).map((k) => (
                  <div key={k}>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t(`ops.audit.${k}`)}
                    </p>
                    <pre className="max-h-64 overflow-auto rounded-md border bg-background p-2 text-xs">
                      {JSON.stringify(row[k] ?? {}, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
