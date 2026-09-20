import { useI18n } from '@carrental/i18n/react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ChoiceTabs } from '@/components/choice-tabs';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSimulate, type GovernedAction, type WorkflowIssue } from '@/lib/workflow-hooks';

/** Everything wrong with the pipeline right now, step by step. Publishing is blocked until it is empty. */
export function ValidationPanel({
  issues,
  checking,
  onGoTo,
}: {
  issues: WorkflowIssue[];
  checking: boolean;
  onGoTo: (stepId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <SectionCard
      title={t('ops.wfb.checkTitle')}
      description={t('ops.wfb.checkBody')}
      icon={issues.length ? AlertTriangle : CheckCircle2}
      data-testid="validation-panel"
    >
      {checking && !issues.length ? <Skeleton className="h-10 rounded-lg" /> : null}
      {!checking && !issues.length ? (
        <p className="flex items-center gap-2 text-sm text-success" role="status">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {t('ops.wfb.allGood')}
        </p>
      ) : null}
      {issues.length ? (
        <ul className="space-y-2" role="alert">
          {issues.map((i, n) => (
            <li
              key={n}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
            >
              <span>{i.message}</span>
              {i.stepId ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => onGoTo(i.stepId!)}>
                  {t('ops.wfb.goToStep')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}

/** "Who would be asked?" for a sample request — the current, unsaved pipeline against real people. */
export function SimulatorPanel({
  spec,
  actions,
  disabled,
}: {
  spec: unknown;
  actions: GovernedAction[];
  disabled: boolean;
}) {
  const { t } = useI18n();
  const sim = useSimulate();
  const [actionKey, setActionKey] = useState(actions[0]?.key ?? '');
  const [values, setValues] = useState<Record<string, string>>({});
  const action = actions.find((a) => a.key === actionKey);
  useEffect(() => {
    setValues({});
  }, [actionKey]);
  const context = Object.fromEntries(
    Object.entries(values)
      .filter(([, v]) => v.trim() !== '')
      .map(([k, v]) => [k, /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v.trim()]),
  );
  return (
    <SectionCard
      title={t('ops.wfb.simTitle')}
      description={t('ops.wfb.simBody')}
      data-testid="simulator-panel"
    >
      {actions.length ? (
        <ChoiceTabs
          value={actionKey}
          onChange={setActionKey}
          label={t('ops.wfb.simAction')}
          options={actions.map((a) => ({ value: a.key, label: a.label }))}
        />
      ) : null}
      {action?.variables.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {action.variables
            .filter((v) => v !== 'initiator_roles')
            .map((v) => (
              <div key={v} className="space-y-1.5">
                <Label htmlFor={`sim-${v}`} className="bidi-isolate font-mono text-xs">
                  {v}
                </Label>
                <Input
                  id={`sim-${v}`}
                  value={values[v] ?? ''}
                  onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                  dir="auto"
                />
              </div>
            ))}
        </div>
      ) : null}
      <Button
        className="mt-4"
        type="button"
        disabled={disabled}
        loading={sim.isPending}
        onClick={() => sim.mutate({ spec, actionKey, context })}
        data-testid="simulate"
      >
        {t('ops.wfb.simRun')}
      </Button>
      {sim.data?.direct ? <p className="mt-4 text-sm">{t('ops.wf.previewDirect')}</p> : null}
      {sim.data && !sim.data.direct ? (
        <ol className="mt-4 space-y-2 text-sm" data-testid="sim-path">
          {sim.data.path.map((p, i) => (
            <li key={p.stepId} className="rounded-lg border p-3">
              <p className="font-medium">
                {i + 1}. {p.name}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  ({t(`ops.wf.stepType.${p.type}`)})
                </span>
              </p>
              {p.asks.length ? (
                <p className="mt-1 text-muted-foreground">
                  {t(`ops.wf.mode.${p.mode ?? 'any'}`, { n: p.required ?? 1 })}:{' '}
                  {p.asks.map((a) => a.name).join(', ')}
                  {p.asks.some((a) => a.source === 'fallback')
                    ? ` — ${t('ops.wfb.simFallback')}`
                    : ''}
                </p>
              ) : null}
              {p.branch ? (
                <p className="mt-1 text-muted-foreground">
                  {t('ops.wf.branch', { branch: p.branch })}
                </p>
              ) : null}
              {p.dueHours ? (
                <p className="mt-1 text-muted-foreground">
                  {t('ops.wf.withinHours', { n: p.dueHours })}
                </p>
              ) : null}
            </li>
          ))}
          <li className="text-muted-foreground">
            {t('ops.wfb.simTotal', { n: sim.data.maxHours })}
          </li>
        </ol>
      ) : null}
      {sim.isError ? <p className="mt-4 text-sm text-destructive">{t('ops.wf.loadFail')}</p> : null}
    </SectionCard>
  );
}
