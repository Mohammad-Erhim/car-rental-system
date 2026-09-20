import { useI18n } from '@carrental/i18n/react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { describeRule } from './builder/rule';
import { RuleBuilder } from './builder/rule-builder';
import { ruleWords } from './variables';

import { ChoiceTabs } from '@/components/choice-tabs';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  useRemoveBinding,
  useSaveBinding,
  type BindingRow,
  type DefinitionRow,
  type GovernedAction,
} from '@/lib/workflow-hooks';

/**
 * "Different workflow depending on the request" — e.g. refunds over 500 go to Finance, everything
 * else is applied directly. Routes are tried top to bottom; the first whose condition matches wins,
 * and if none does the action's default (below) applies. Reorder with the arrows.
 */
export function RoutesEditor({
  action,
  routes,
  workflows,
  canManage,
}: {
  action: GovernedAction;
  routes: BindingRow[];
  workflows: DefinitionRow[];
  canManage: boolean;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const words = ruleWords(i18n);
  const save = useSaveBinding();
  const remove = useRemoveBinding();
  const [editing, setEditing] = useState<BindingRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<BindingRow | null>(null);
  const ordered = [...routes].sort((a, b) => b.priority - a.priority);

  const move = async (index: number, delta: -1 | 1) => {
    const other = ordered[index + delta];
    const mine = ordered[index];
    if (!other || !mine) return;
    // swap priorities (make them distinct first so a swap is always visible)
    const hi = Math.max(mine.priority, other.priority) + (mine.priority === other.priority ? 1 : 0);
    const lo = Math.min(mine.priority, other.priority);
    try {
      await save.mutateAsync({
        id: mine.id,
        actionKey: action.key,
        definitionId: mine.definitionId,
        condition: mine.condition,
        label: mine.label ?? undefined,
        priority: delta === -1 ? hi : lo,
      });
      await save.mutateAsync({
        id: other.id,
        actionKey: action.key,
        definitionId: other.definitionId,
        condition: other.condition,
        label: other.label ?? undefined,
        priority: delta === -1 ? lo : hi,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('ops.wf.saveFail'));
    }
  };

  return (
    <div className="mt-5 space-y-3 border-t pt-4" data-testid={`routes-${action.key}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">{t('ops.wfr.title')}</h4>
          <p className="text-xs text-muted-foreground">{t('ops.wfr.help')}</p>
        </div>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing('new')}
            data-testid={`route-add-${action.key}`}
          >
            <Plus aria-hidden="true" />
            {t('ops.wfr.add')}
          </Button>
        ) : null}
      </div>
      {ordered.length ? (
        <ol className="space-y-2">
          {ordered.map((r, i) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{r.label || t('ops.wfr.routeN', { n: i + 1 })}</p>
                <p className="text-muted-foreground">
                  {t('ops.wfr.when')}{' '}
                  <span className="bidi-isolate text-xs">
                    {r.condition ? describeRule(r.condition, words) || '…' : t('ops.wfr.always')}
                  </span>{' '}
                  → {r.definitionName}
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-0.5">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={i === 0 || save.isPending}
                    aria-label={t('ops.wfr.up')}
                    onClick={() => void move(i, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={i === ordered.length - 1 || save.isPending}
                    aria-label={t('ops.wfr.down')}
                    onClick={() => void move(i, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('ops.wfr.edit')}
                    onClick={() => setEditing(r)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('ops.wfr.remove')}
                    onClick={() => setDeleting(r)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">{t('ops.wfr.none')}</p>
      )}
      {editing ? (
        <RouteSheet
          action={action}
          route={editing === 'new' ? null : editing}
          workflows={workflows}
          nextPriority={(ordered[0]?.priority ?? 0) + 10}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setDeleting(null)}
          title={t('ops.wfr.removeTitle')}
          description={t('ops.wfr.removeBody')}
          confirmLabel={t('ops.wfr.remove')}
          onConfirm={async () => {
            await remove.mutateAsync(deleting.id);
            toast.success(t('ops.wf.bindingSaved'));
          }}
        />
      ) : null}
    </div>
  );
}

function RouteSheet({
  action,
  route,
  workflows,
  nextPriority,
  onClose,
}: {
  action: GovernedAction;
  route: BindingRow | null;
  workflows: DefinitionRow[];
  nextPriority: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const save = useSaveBinding();
  const usable = workflows.filter(
    (w) => !w.archived && w.publishedRevision !== null && w.code !== 'direct',
  );
  const variables = action.variables.filter((v) => v !== 'initiator_roles');
  const [label, setLabel] = useState(route?.label ?? '');
  const [rule, setRule] = useState<Record<string, unknown>>(route?.condition ?? {});
  const [definitionId, setDefinitionId] = useState(route?.definitionId ?? usable[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const ruleEmpty = Object.keys(rule).length === 0;

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({
        id: route?.id,
        actionKey: action.key,
        definitionId,
        condition: ruleEmpty ? null : rule,
        label: label.trim() || undefined,
        priority: route?.priority ?? nextPriority,
      });
      toast.success(t('ops.wf.bindingSaved'));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ops.wf.saveFail'));
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('action.close')} className="p-0 sm:max-w-lg">
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="border-b p-6 pe-12">
            <SheetTitle>{t(route ? 'ops.wfr.editTitle' : 'ops.wfr.addTitle')}</SheetTitle>
            <SheetDescription>{action.label}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="route-label">{t('ops.wfr.label')}</Label>
              <Input
                id="route-label"
                value={label}
                maxLength={120}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('ops.wfr.labelHint')}
              />
            </div>
            <RuleBuilder
              value={rule}
              onChange={setRule}
              variables={variables}
              label={t('ops.wfr.condition')}
            />
            {ruleEmpty ? (
              <p className="text-xs text-muted-foreground">{t('ops.wfr.emptyRule')}</p>
            ) : null}
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('ops.wfr.useWorkflow')}</p>
              <ChoiceTabs
                layout="list"
                value={definitionId}
                onChange={setDefinitionId}
                label={t('ops.wfr.useWorkflow')}
                options={usable.map((w) => ({
                  value: w.id,
                  label: w.name,
                  description: w.description ?? t('ops.wf.stepCount', { n: w.stepCount }),
                }))}
              />
            </div>
          </div>
          <SheetFooter className="border-t bg-muted/20 p-6">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('action.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              loading={save.isPending}
              disabled={!definitionId}
              data-testid="route-save"
            >
              {t('ops.wfr.save')}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
