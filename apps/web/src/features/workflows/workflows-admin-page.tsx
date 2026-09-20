import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Eye, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Requests } from './tasks-page';

import { FormDialog } from '@/components/form-dialog';
import { TextField } from '@/components/form-fields';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useListParams } from '@/lib/use-list-params';
import {
  useBindings,
  useCloneDefinition,
  useDefinitions,
  useGovernedActions,
  useRemoveBinding,
  useSaveBinding,
  useSimulate,
  type BindingRow,
  type DefinitionRow,
  type GovernedAction,
} from '@/lib/workflow-hooks';

const TABS = ['actions', 'workflows', 'requests'] as const;
type Tab = (typeof TABS)[number];
const DIRECT = '__direct__';

/**
 * Administration → Workflows. Which approval pipeline (if any) stands in front of each action the
 * system can govern, the pipelines themselves, and every request in flight. Nothing is fixed in
 * code except the list of actions that *can* be governed. The visual step builder arrives next;
 * until then a pipeline is chosen from the built-in ones or a copy of them.
 */
export function WorkflowsAdminPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('workflow.manage');
  const { state, update } = useListParams(['tab'] as const);
  const tab: Tab = (TABS as readonly string[]).includes(state.tab) ? (state.tab as Tab) : 'actions';
  return (
    <Page>
      <PageHeader title={t('ops.wf.adminTitle')} description={t('ops.wf.adminSubtitle')} />
      <StateSwitcher
        label={t('ops.wf.adminTitle')}
        value={tab}
        onChange={(v) => update({ tab: v === 'actions' ? '' : v })}
        testIdPrefix="wf-admin-tab"
        options={TABS.map((v) => ({ value: v, label: t(`ops.wf.adminTab.${v}`) }))}
      />
      {tab === 'actions' ? <ActionsTab canManage={canManage} /> : null}
      {tab === 'workflows' ? <DefinitionsTab canManage={canManage} /> : null}
      {tab === 'requests' ? <Requests scope="all" /> : null}
    </Page>
  );
}

function ActionsTab({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const actions = useGovernedActions();
  const defs = useDefinitions();
  const bindings = useBindings();
  const save = useSaveBinding();
  const remove = useRemoveBinding();

  if (actions.isLoading || defs.isLoading || bindings.isLoading)
    return <Skeleton className="h-64 rounded-xl" />;
  if (!actions.data || !defs.data || !bindings.data) {
    return (
      <StateView
        kind="error"
        title={t('ops.wf.loadFail')}
        actionLabel={t('ops.st.retry')}
        onAction={() => {
          void actions.refetch();
          void defs.refetch();
          void bindings.refetch();
        }}
      />
    );
  }
  const usable = defs.data.filter((d) => !d.archived && d.publishedRevision !== null);
  const change = async (action: GovernedAction, current: BindingRow | undefined, value: string) => {
    try {
      if (value === DIRECT) {
        if (current) await remove.mutateAsync(current.id);
      } else {
        await save.mutateAsync({ id: current?.id, actionKey: action.key, definitionId: value });
      }
      toast.success(t('ops.wf.bindingSaved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('ops.wf.saveFail'));
    }
  };

  return (
    <div className="space-y-4" data-testid="wf-actions">
      <p className="text-sm text-muted-foreground">{t('ops.wf.actionsHelp')}</p>
      {actions.data.map((a) => {
        const mine = bindings.data.filter((b) => b.actionKey === a.key);
        const plain = mine.find((b) => !b.condition);
        const conditional = mine.filter((b) => b.condition);
        return (
          <Card key={a.key} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <h3 className="flex items-center gap-2 font-semibold">
                  {a.label}
                  {a.securityCritical ? (
                    <Badge variant="warning">
                      <ShieldAlert className="me-1 size-3" aria-hidden="true" />
                      {t('ops.wf.securityCritical')}
                    </Badge>
                  ) : null}
                </h3>
                <p className="text-sm text-muted-foreground">{a.description}</p>
                <p className="bidi-isolate font-mono text-xs text-muted-foreground">{a.key}</p>
                {conditional.length ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {conditional.map((b) => (
                      <Badge key={b.id} variant="outline">
                        {b.label ?? t('ops.wf.conditional')} → {b.definitionName}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="w-full sm:w-72">
                <Select
                  value={plain?.definitionId ?? DIRECT}
                  onValueChange={(v) => void change(a, plain, v)}
                  disabled={!canManage || save.isPending || remove.isPending}
                >
                  <SelectTrigger
                    aria-label={t('ops.wf.pickWorkflow', { action: a.label })}
                    data-testid={`wf-bind-${a.key}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DIRECT}>{t('ops.wf.direct')}</SelectItem>
                    {usable
                      .filter((d) => d.code !== 'direct')
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        );
      })}
      {!canManage ? <p className="text-sm text-muted-foreground">{t('ops.wf.readOnly')}</p> : null}
    </div>
  );
}

function DefinitionsTab({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const defs = useDefinitions();
  const [preview, setPreview] = useState<DefinitionRow | null>(null);
  const [clone, setClone] = useState<DefinitionRow | null>(null);

  if (defs.isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (defs.isError || !defs.data) {
    return (
      <StateView
        kind="error"
        title={t('ops.wf.loadFail')}
        actionLabel={t('ops.st.retry')}
        onAction={() => void defs.refetch()}
      />
    );
  }
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2" data-testid="wf-definitions">
        {defs.data.map((d) => (
          <Card key={d.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                  {d.name}
                  {d.isSystem ? <Badge variant="secondary">{t('ops.wf.builtIn')}</Badge> : null}
                  {d.archived ? <Badge variant="outline">{t('ops.wf.archived')}</Badge> : null}
                </h3>
                {d.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('ops.wf.stepCount', { n: d.stepCount })} ·{' '}
                  {t('ops.wf.boundCount', { n: d.boundActions })}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('ops.wf.preview')}
                  onClick={() => setPreview(d)}
                >
                  <Eye aria-hidden="true" />
                </Button>
                {canManage ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('ops.wf.clone')}
                    onClick={() => setClone(d)}
                  >
                    <Copy aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
      {preview ? <PreviewDialog def={preview} onClose={() => setPreview(null)} /> : null}
      {clone ? <CloneDialog def={clone} onClose={() => setClone(null)} /> : null}
    </>
  );
}

/** "Who would be asked?" — the simulator, run for the person looking (they are the requester). */
function PreviewDialog({ def, onClose }: { def: DefinitionRow; onClose: () => void }) {
  const { t } = useI18n();
  const { mutate, data, isPending, isError } = useSimulate();
  useEffect(() => {
    mutate({ definitionId: def.id });
  }, [def.id, mutate]);
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('ops.wf.previewTitle', { name: def.name })}</DialogTitle>
          <DialogDescription>{t('ops.wf.previewBody')}</DialogDescription>
        </DialogHeader>
        {isPending ? <Skeleton className="h-24 rounded-lg" /> : null}
        {data?.direct ? <p className="text-sm">{t('ops.wf.previewDirect')}</p> : null}
        {data && !data.direct ? (
          <ol className="space-y-3 text-sm" data-testid="wf-preview">
            {data.path.map((p, i) => (
              <li key={p.stepId} className="rounded-lg border p-3">
                <p className="font-medium">
                  {i + 1}. {p.name}{' '}
                  <span className="text-xs text-muted-foreground">
                    ({t(`ops.wf.stepType.${p.type}`)})
                  </span>
                </p>
                {p.asks.length ? (
                  <p className="mt-1 text-muted-foreground">
                    {t(`ops.wf.mode.${p.mode ?? 'any'}`, { n: p.required ?? 1 })}:{' '}
                    {p.asks.map((a) => a.name).join(', ')}
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
          </ol>
        ) : null}
        {isError ? <p className="text-sm text-destructive">{t('ops.wf.loadFail')}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

function CloneDialog({ def, onClose }: { def: DefinitionRow; onClose: () => void }) {
  const { t } = useI18n();
  const clone = useCloneDefinition();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('ops.wf.commentRequired')).max(120),
        code: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, t('ops.wf.codeInvalid')),
      }),
    [t],
  );
  const defaults = { name: `${def.name} (copy)`, code: `${def.code}_copy`.slice(0, 40) };
  const form = useForm({ resolver: zodResolver(schema), defaultValues: defaults });
  return (
    <FormDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      form={form}
      defaultValues={defaults}
      title={t('ops.wf.cloneTitle', { name: def.name })}
      description={t('ops.wf.cloneBody')}
      submitLabel={t('ops.wf.clone')}
      onSubmit={async (v) => {
        await clone.mutateAsync({ id: def.id, code: v.code, name: v.name.trim() });
        toast.success(t('ops.wf.cloned'));
      }}
    >
      <TextField control={form.control} name="name" label={t('ops.wf.nameLabel')} />
      <TextField control={form.control} name="code" label={t('ops.wf.codeLabel')} />
    </FormDialog>
  );
}
