import type { Actors, Due } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';

import { ActorsEditor } from './actors-editor';
import {
  newStep,
  type EditorCondition,
  type EditorDoc,
  type EditorParallel,
  type EditorStep,
  type InlineStep,
} from './model';
import { RuleBuilder } from './rule-builder';

import { ChoiceTabs } from '@/components/choice-tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { WorkflowOptions } from '@/lib/workflow-hooks';

export interface StepContext {
  options: WorkflowOptions | undefined;
  /** what a rule may read */
  variables: string[];
  /** the other main-line steps a branch can jump to */
  targets: Array<{ id: string; name: string }>;
  /** the doc, for generating unique ids of new inline steps */
  doc: EditorDoc;
}

const NEXT = '__next__';
const END = '__end__';

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <Label htmlFor={id} className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? (
          <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
        ) : null}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  hint,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Where a step goes next: the following step, the end, or a jump to a named step. */
export function TargetTabs({
  value,
  onChange,
  targets,
  label,
  allowNext = true,
}: {
  value: string | null | undefined;
  onChange: (v: string | null | undefined) => void;
  targets: StepContext['targets'];
  label: string;
  allowNext?: boolean;
}) {
  const { t } = useI18n();
  const current = value === undefined ? NEXT : value === null ? END : value;
  return (
    <ChoiceTabs
      value={current}
      onChange={(v) => onChange(v === NEXT ? undefined : v === END ? null : v)}
      label={label}
      options={[
        ...(allowNext ? [{ value: NEXT, label: t('ops.wfb.thenNext') }] : []),
        { value: END, label: t('ops.wfb.thenEnd') },
        ...targets.map((s) => ({ value: s.id, label: t('ops.wfb.thenJump', { name: s.name }) })),
      ]}
    />
  );
}

function ActorsFields({
  actors,
  onChange,
  ctx,
  label,
}: {
  actors: Actors;
  onChange: (a: Actors) => void;
  ctx: StepContext;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <ActorsEditor
        value={actors.selectors}
        onChange={(selectors) => onChange({ ...actors, selectors })}
        options={ctx.options}
        label={label}
      />
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('ops.wfb.mode')}</p>
        <ChoiceTabs
          layout="list"
          value={actors.mode}
          onChange={(v) =>
            onChange({
              ...actors,
              mode: v as Actors['mode'],
              quorum: v === 'quorum' ? (actors.quorum ?? 2) : undefined,
            })
          }
          label={t('ops.wfb.mode')}
          testIdPrefix="mode"
          options={(['any', 'all', 'quorum', 'sequence'] as const).map((m) => ({
            value: m,
            label: t(`ops.wfb.mode.${m}`),
            description: t(`ops.wfb.mode.${m}Hint`),
          }))}
        />
        {actors.mode === 'quorum' ? (
          <NumberField
            label={t('ops.wfb.quorum')}
            min={1}
            value={actors.quorum}
            onChange={(v) => onChange({ ...actors, quorum: v })}
            hint={t('ops.wfb.quorumHint')}
          />
        ) : null}
      </div>
      <Toggle
        label={t('ops.wfb.excludeInitiator')}
        hint={t('ops.wfb.excludeInitiatorHint')}
        checked={actors.excludeInitiator}
        onChange={(v) => onChange({ ...actors, excludeInitiator: v })}
      />
      <Toggle
        label={t('ops.wfb.requireLocation')}
        hint={t('ops.wfb.requireLocationHint')}
        checked={actors.requireLocationScope}
        onChange={(v) => onChange({ ...actors, requireLocationScope: v })}
      />
    </div>
  );
}

function DueFields({
  due,
  onChange,
  ctx,
}: {
  due: Due | undefined;
  onChange: (d: Due | undefined) => void;
  ctx: StepContext;
}) {
  const { t } = useI18n();
  if (!due) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({ hours: 24, maxReminders: 3, businessHours: false, onTimeout: 'escalate' })
        }
      >
        <Plus aria-hidden="true" />
        {t('ops.wfb.addDeadline')}
      </Button>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid="due-fields">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t('ops.wfb.deadline')}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
          {t('ops.wfb.removeDeadline')}
        </Button>
      </div>
      <NumberField
        label={t('ops.wfb.dueHours')}
        min={1}
        value={due.hours}
        onChange={(v) => onChange({ ...due, hours: v ?? 24 })}
      />
      <Toggle
        label={t('ops.wfb.businessHours')}
        hint={t('ops.wfb.businessHoursHint')}
        checked={due.businessHours}
        onChange={(v) => onChange({ ...due, businessHours: v })}
      />
      <NumberField
        label={t('ops.wfb.remindEvery')}
        min={1}
        value={due.reminderEveryHours}
        onChange={(v) => onChange({ ...due, reminderEveryHours: v })}
        hint={t('ops.wfb.remindHint')}
      />
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('ops.wfb.onTimeout')}</p>
        <ChoiceTabs
          layout="list"
          value={due.onTimeout}
          onChange={(v) => onChange({ ...due, onTimeout: v as Due['onTimeout'] })}
          label={t('ops.wfb.onTimeout')}
          options={(['escalate', 'wait', 'approve', 'reject'] as const).map((m) => ({
            value: m,
            label: t(`ops.wfb.timeout.${m}`),
            description: t(`ops.wfb.timeout.${m}Hint`),
          }))}
        />
      </div>
      {due.onTimeout === 'escalate' ? (
        <ActorsEditor
          value={due.escalateTo ?? []}
          onChange={(escalateTo) =>
            onChange({ ...due, escalateTo: escalateTo.length ? escalateTo : undefined })
          }
          options={ctx.options}
          label={t('ops.wfb.escalateTo')}
        />
      ) : null}
    </div>
  );
}

/** The fields of one step (not a parallel step — that one lays out its branches around these). */
export function StepFields({
  step,
  onChange,
  ctx,
  inline = false,
}: {
  step: EditorStep;
  onChange: (s: EditorStep) => void;
  ctx: StepContext;
  inline?: boolean;
}) {
  const { t } = useI18n();
  const nameId = useId();
  const set = (patch: Record<string, unknown>) => onChange({ ...step, ...patch } as EditorStep);
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>{t('ops.wfb.stepName')}</Label>
        <Input
          id={nameId}
          value={step.name}
          maxLength={80}
          onChange={(e) => set({ name: e.target.value })}
          data-testid="step-name"
        />
      </div>

      {step.type === 'approval' || step.type === 'task' ? (
        <>
          <ActorsFields
            actors={step.actors}
            onChange={(actors) => set({ actors })}
            ctx={ctx}
            label={t(step.type === 'approval' ? 'ops.wfb.whoApproves' : 'ops.wfb.whoDoesIt')}
          />
          {step.type === 'approval' ? (
            <>
              <Toggle
                label={t('ops.wfb.allowChanges')}
                hint={t('ops.wfb.allowChangesHint')}
                checked={step.allowChanges}
                onChange={(v) => set({ allowChanges: v })}
              />
              <Toggle
                label={t('ops.wfb.requireReject')}
                hint={t('ops.wfb.requireRejectHint')}
                checked={step.requireRejectComment}
                onChange={(v) => set({ requireRejectComment: v })}
              />
            </>
          ) : (
            <Toggle
              label={t('ops.wfb.requireNote')}
              hint={t('ops.wfb.requireNoteHint')}
              checked={step.requireNote}
              onChange={(v) => set({ requireNote: v })}
            />
          )}
          <DueFields due={step.due} onChange={(due) => set({ due })} ctx={ctx} />
        </>
      ) : null}

      {step.type === 'auto' ? (
        <>
          <ActorsEditor
            value={step.notify ?? []}
            onChange={(notify) => set({ notify })}
            options={ctx.options}
            label={t('ops.wfb.whoIsTold')}
          />
          <div className="space-y-1.5">
            <Label>{t('ops.wfb.message')}</Label>
            <Textarea
              rows={3}
              maxLength={500}
              value={step.message ?? ''}
              onChange={(e) => set({ message: e.target.value })}
            />
          </div>
        </>
      ) : null}

      {step.type === 'wait' ? (
        <>
          <NumberField
            label={t('ops.wfb.waitHours')}
            min={1}
            value={step.hours}
            onChange={(v) => set({ hours: v ?? 1 })}
            hint={t('ops.wfb.waitHint')}
          />
          <Toggle
            label={t('ops.wfb.businessHours')}
            hint={t('ops.wfb.businessHoursHint')}
            checked={step.businessHours}
            onChange={(v) => set({ businessHours: v })}
          />
        </>
      ) : null}

      {step.type === 'condition' ? (
        <ConditionFields step={step} onChange={onChange} ctx={ctx} />
      ) : null}

      {!inline && step.type !== 'condition' && step.type !== 'parallel' ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('ops.wfb.then')}</p>
          <TargetTabs
            value={step.next}
            onChange={(next) => set({ next })}
            targets={ctx.targets}
            label={t('ops.wfb.then')}
          />
        </div>
      ) : null}
    </div>
  );
}

function ConditionFields({
  step,
  onChange,
  ctx,
}: {
  step: EditorCondition;
  onChange: (s: EditorStep) => void;
  ctx: StepContext;
}) {
  const { t } = useI18n();
  const setBranch = (i: number, patch: Partial<EditorCondition['branches'][number]>) =>
    onChange({
      ...step,
      branches: step.branches.map((b, j) => (j === i ? { ...b, ...patch } : b)),
    });
  return (
    <div className="space-y-4" data-testid="condition-fields">
      <p className="text-sm text-muted-foreground">{t('ops.wfb.conditionHelp')}</p>
      {step.branches.map((b, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-3" data-testid={`branch-${i}`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{t('ops.wfb.branchN', { n: i + 1 })}</p>
            {step.branches.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange({ ...step, branches: step.branches.filter((_, j) => j !== i) })
                }
              >
                <Trash2 aria-hidden="true" />
                {t('ops.wfb.removeBranch')}
              </Button>
            ) : null}
          </div>
          <RuleBuilder
            value={b.when}
            onChange={(when) => setBranch(i, { when })}
            variables={ctx.variables}
            label={t('ops.wfb.when')}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('ops.wfb.thenGoTo')}</p>
            <TargetTabs
              value={b.next}
              onChange={(next) => setBranch(i, { next })}
              targets={ctx.targets}
              label={t('ops.wfb.thenGoTo')}
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          onChange({
            ...step,
            branches: [...step.branches, { label: '', when: {}, next: undefined }],
          })
        }
      >
        <Plus aria-hidden="true" />
        {t('ops.wfb.addBranch')}
      </Button>
      <div className="space-y-2 rounded-lg border border-dashed p-3">
        <p className="text-sm font-semibold">{t('ops.wfb.otherwise')}</p>
        <TargetTabs
          value={step.else}
          onChange={(v) => onChange({ ...step, else: v })}
          targets={ctx.targets}
          label={t('ops.wfb.otherwise')}
        />
      </div>
    </div>
  );
}

const INLINE_TYPES = ['approval', 'task', 'wait', 'auto'] as const;

/** A parallel step: two or more branches, each a short sequence, joined when all (or the first) finish. */
export function ParallelFields({
  step,
  onChange,
  ctx,
}: {
  step: EditorParallel;
  onChange: (s: EditorStep) => void;
  ctx: StepContext;
}) {
  const { t } = useI18n();
  const nameId = useId();
  const [open, setOpen] = useState<string | null>(null);
  const setBranches = (branches: InlineStep[][]) => onChange({ ...step, branches });
  const addInline = (bi: number, type: (typeof INLINE_TYPES)[number]) => {
    const fake = { ...ctx.doc, steps: [...ctx.doc.steps.filter((s) => s.id !== step.id), step] };
    const made = newStep(fake, type, t(`ops.wfb.newName.${type}`)) as InlineStep;
    setBranches(step.branches.map((b, i) => (i === bi ? [...b, made] : b)));
    setOpen(made.id);
  };
  return (
    <div className="space-y-5" data-testid="parallel-fields">
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>{t('ops.wfb.stepName')}</Label>
        <Input
          id={nameId}
          value={step.name}
          maxLength={80}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
          data-testid="step-name"
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('ops.wfb.join')}</p>
        <ChoiceTabs
          layout="list"
          value={step.join}
          onChange={(v) => onChange({ ...step, join: v as 'all' | 'any' })}
          label={t('ops.wfb.join')}
          options={(['all', 'any'] as const).map((j) => ({
            value: j,
            label: t(`ops.wfb.join.${j}`),
            description: t(`ops.wfb.join.${j}Hint`),
          }))}
        />
      </div>
      {step.branches.map((branch, bi) => (
        <div key={bi} className="space-y-3 rounded-lg border p-3" data-testid={`par-branch-${bi}`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{t('ops.wfb.parBranch', { n: bi + 1 })}</p>
            {step.branches.length > 2 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setBranches(step.branches.filter((_, i) => i !== bi))}
              >
                <Trash2 aria-hidden="true" />
                {t('ops.wfb.removeBranch')}
              </Button>
            ) : null}
          </div>
          {branch.map((inline, si) => {
            const expanded = open === inline.id;
            return (
              <div key={inline.id} className="rounded-md border bg-muted/30">
                <div className="flex items-center justify-between gap-2 p-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-start text-sm font-medium"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : inline.id)}
                  >
                    {expanded ? (
                      <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
                    )}
                    <span className="truncate">{inline.name || inline.id}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      ({t(`ops.wf.stepType.${inline.type}`)})
                    </span>
                  </button>
                  {branch.length > 1 ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('ops.wfb.deleteStep')}
                      onClick={() =>
                        setBranches(
                          step.branches.map((b, i) =>
                            i === bi ? b.filter((_, j) => j !== si) : b,
                          ),
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
                {expanded ? (
                  <div className="border-t p-3">
                    <StepFields
                      inline
                      step={inline}
                      ctx={ctx}
                      onChange={(s) =>
                        setBranches(
                          step.branches.map((b, i) =>
                            i === bi ? b.map((x, j) => (j === si ? (s as InlineStep) : x)) : b,
                          ),
                        )
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          <ChoiceTabs
            value=""
            onChange={(v) => addInline(bi, v as (typeof INLINE_TYPES)[number])}
            label={t('ops.wfb.addStepTo', { n: bi + 1 })}
            options={INLINE_TYPES.map((ty) => ({
              value: ty,
              label: `+ ${t(`ops.wf.stepType.${ty}`)}`,
            }))}
          />
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          const fake = {
            ...ctx.doc,
            steps: [...ctx.doc.steps.filter((s) => s.id !== step.id), step],
          };
          setBranches([
            ...step.branches,
            [newStep(fake, 'approval', t('ops.wfb.newName.approval')) as InlineStep],
          ]);
        }}
      >
        <Plus aria-hidden="true" />
        {t('ops.wfb.addParBranch')}
      </Button>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('ops.wfb.then')}</p>
        <TargetTabs
          value={step.next}
          onChange={(next) => onChange({ ...step, next })}
          targets={ctx.targets}
          label={t('ops.wfb.then')}
        />
      </div>
    </div>
  );
}
