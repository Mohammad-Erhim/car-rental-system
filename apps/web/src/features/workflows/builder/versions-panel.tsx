import type { WorkflowSpec } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { History, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { diffSpecs } from './diff';

import { SectionCard } from '@/components/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DefinitionDetail } from '@/lib/workflow-hooks';

const TONE = { published: 'success', draft: 'warning', superseded: 'secondary' } as const;

/** A short, readable summary of what a diff contains (step names where we have them). */
export function DiffSummary({
  diff,
  nameOf,
}: {
  diff: ReturnType<typeof diffSpecs>;
  nameOf: (id: string) => string;
}) {
  const { t } = useI18n();
  if (diff.empty) return <p className="text-sm text-muted-foreground">{t('ops.wfb.noChanges')}</p>;
  return (
    <ul className="space-y-1 text-sm" data-testid="diff-summary">
      {diff.added.map((id) => (
        <li key={`a-${id}`} className="text-success">
          + {t('ops.wfb.diffAdded', { name: nameOf(id) })}
        </li>
      ))}
      {diff.removed.map((id) => (
        <li key={`r-${id}`} className="text-destructive">
          − {t('ops.wfb.diffRemoved', { name: nameOf(id) })}
        </li>
      ))}
      {diff.changed.map((c) => (
        <li key={`c-${c.id}`}>
          ~ {t('ops.wfb.diffChanged', { name: nameOf(c.id), fields: c.fields.join(', ') })}
        </li>
      ))}
      {diff.startChanged ? <li>~ {t('ops.wfb.diffStart')}</li> : null}
      {diff.fallbackChanged ? <li>~ {t('ops.wfb.diffFallback')}</li> : null}
      {diff.revisionsChanged ? <li>~ {t('ops.wfb.diffRevisions')}</li> : null}
    </ul>
  );
}

/** Every saved version, what changed in each, and a way back: restoring copies it into the editor as a new draft. */
export function VersionsPanel({
  detail,
  canManage,
  onRestore,
}: {
  detail: DefinitionDetail;
  canManage: boolean;
  onRestore: (spec: WorkflowSpec) => void;
}) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const versions = detail.versions; // newest first
  const nameOf = (spec: WorkflowSpec | null | undefined) => (id: string) =>
    spec?.steps[id]?.name ?? id;
  return (
    <SectionCard
      title={t('ops.wfb.versionsTitle')}
      description={t('ops.wfb.versionsBody')}
      icon={History}
      data-testid="versions-panel"
    >
      <ol className="divide-y">
        {versions.map((v, i) => {
          const spec = v.spec as unknown as WorkflowSpec;
          const prev = versions[i + 1]?.spec as unknown as WorkflowSpec | undefined;
          const diff = diffSpecs(prev ?? null, spec);
          const expanded = open === v.id;
          return (
            <li key={v.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{t('ops.wfb.revN', { n: v.revision })}</span>
                  <Badge variant={TONE[v.status]}>{t(`ops.wfb.vstatus.${v.status}`)}</Badge>
                  <span className="text-muted-foreground">
                    {fmt.dateTime(v.publishedAt ?? v.createdAt)}
                  </span>
                  {v.note ? <span className="text-muted-foreground">· {v.note}</span> : null}
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : v.id)}
                  >
                    {t(expanded ? 'ops.wfb.hideChanges' : 'ops.wfb.showChanges')}
                  </Button>
                  {canManage && v.status !== 'draft' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onRestore(spec)}
                      data-testid={`restore-${v.revision}`}
                    >
                      <RotateCcw aria-hidden="true" />
                      {t('ops.wfb.restore')}
                    </Button>
                  ) : null}
                </div>
              </div>
              {expanded ? (
                <DiffSummary diff={diff} nameOf={(id) => nameOf(spec)(id) || nameOf(prev)(id)} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
