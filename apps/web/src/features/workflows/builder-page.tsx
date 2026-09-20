import { useAuth } from '@carrental/client/react';
import { validateWorkflowGraph, type WorkflowSpec } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { ArrowLeft, Copy, Save, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ActorsEditor, useSelectorNames } from './builder/actors-editor';
import { SimulatorPanel, ValidationPanel } from './builder/check-panel';
import { diffSpecs } from './builder/diff';
import { ImportExport } from './builder/import-export';
import {
  fromSpec,
  insertStep,
  moveStep,
  newStep,
  removeStep,
  replaceStep,
  toSpec,
  type EditorDoc,
  type EditorStep,
  type StepType,
} from './builder/model';
import { Pipeline } from './builder/pipeline';
import type { StepContext } from './builder/step-fields';
import { StepSheet } from './builder/step-sheet';
import { DiffSummary, VersionsPanel } from './builder/versions-panel';
import { CloneDialog } from './clone-dialog';

import { paths } from '@/app/paths';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useListParams } from '@/lib/use-list-params';
import {
  useBindings,
  useDefinition,
  useGovernedActions,
  usePublishDefinition,
  useSaveDraft,
  useValidateWorkflow,
  useWorkflowOptions,
  type WorkflowIssue,
} from '@/lib/workflow-hooks';

const TABS = ['steps', 'check', 'history', 'settings'] as const;
type Tab = (typeof TABS)[number];
const ADD_TYPES: StepType[] = ['approval', 'task', 'condition', 'parallel', 'wait', 'auto'];

/**
 * The workflow builder: the pipeline as cards you reorder and edit, a live check that blocks
 * publishing while anything is wrong, a simulator that shows who would really be asked, the version
 * history with what changed in each, and import / export. Built-in workflows open read-only.
 */
export function BuilderPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('workflow.manage');
  const detail = useDefinition(id);
  const options = useWorkflowOptions();
  const actions = useGovernedActions();
  const bindings = useBindings();
  const { state, update } = useListParams(['tab'] as const);
  const tab: Tab = (TABS as readonly string[]).includes(state.tab) ? (state.tab as Tab) : 'steps';

  if (detail.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (detail.isError || !detail.data) {
    return (
      <StateView
        kind="error"
        title={t('ops.wfb.notFound')}
        actionLabel={t('ops.wf.backToWorkflows')}
        onAction={() => history.back()}
      />
    );
  }
  const def = detail.data;
  const working =
    def.versions.find((v) => v.status === 'draft') ??
    def.versions.find((v) => v.status === 'published') ??
    def.versions[0];
  if (!working) return <StateView kind="error" title={t('ops.wfb.notFound')} />;
  const editable = canManage && !def.isSystem && !def.archived;

  return (
    <Editor
      key={`${def.id}:${working.id}:${working.revision}`}
      def={def}
      initialSpec={working.spec as unknown as WorkflowSpec}
      tab={tab}
      setTab={(v) => update({ tab: v === 'steps' ? '' : v })}
      editable={editable}
      canManage={canManage}
      options={options.data}
      governed={actions.data ?? []}
      boundActionKeys={(bindings.data ?? [])
        .filter((b) => b.definitionId === def.id)
        .map((b) => b.actionKey)}
    />
  );
}

function Editor({
  def,
  initialSpec,
  tab,
  setTab,
  editable,
  canManage,
  options,
  governed,
  boundActionKeys,
}: {
  def: NonNullable<ReturnType<typeof useDefinition>['data']>;
  initialSpec: WorkflowSpec;
  tab: Tab;
  setTab: (t: Tab) => void;
  editable: boolean;
  canManage: boolean;
  options: ReturnType<typeof useWorkflowOptions>['data'];
  governed: NonNullable<ReturnType<typeof useGovernedActions>['data']>;
  boundActionKeys: string[];
}) {
  const { t } = useI18n();
  const names = useSelectorNames(options);
  const start = useMemo(() => fromSpec(initialSpec).doc, [initialSpec]);
  const [doc, setDoc] = useState<EditorDoc>(start);
  const [meta, setMeta] = useState({ name: def.name, description: def.description ?? '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'publish' | { delete: string }>(null);
  const [cloning, setCloning] = useState(false);
  const save = useSaveDraft();
  const publish = usePublishDefinition();
  const validate = useValidateWorkflow();

  const spec = useMemo(() => toSpec(doc), [doc]);
  const dirty =
    JSON.stringify(spec) !== JSON.stringify(initialSpec) ||
    meta.name !== def.name ||
    (meta.description || '') !== (def.description ?? '');
  const live = def.versions.find((v) => v.status === 'published');
  const hasDraft = def.versions.some((v) => v.status === 'draft');

  // variables a rule may read: those of the actions this workflow governs (or of all actions, while unbound)
  const variables = useMemo(() => {
    const scope = boundActionKeys.length
      ? governed.filter((a) => boundActionKeys.includes(a.key))
      : governed;
    return [...new Set(scope.flatMap((a) => a.variables))];
  }, [governed, boundActionKeys]);

  // live check: graph rules run at once, the server (real people, real variables) a moment after typing stops
  const localIssues = useMemo<WorkflowIssue[]>(() => validateWorkflowGraph(spec), [spec]);
  const [serverIssues, setServerIssues] = useState<WorkflowIssue[]>([]);
  const [checking, setChecking] = useState(false);
  const { mutate: runValidate } = validate;
  useEffect(() => {
    if (!editable) return;
    setChecking(true);
    const h = setTimeout(() => {
      runValidate(
        { spec, actionKeys: boundActionKeys },
        {
          onSuccess: (r) => {
            setServerIssues(r.issues);
            setChecking(false);
          },
          onError: () => setChecking(false),
        },
      );
    }, 600);
    return () => clearTimeout(h);
  }, [spec, editable, boundActionKeys, runValidate]);
  const issues = useMemo(() => {
    const seen = new Set<string>();
    return [...localIssues, ...serverIssues].filter((i) => {
      const k = `${i.code}|${i.stepId ?? ''}|${i.message}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [localIssues, serverIssues]);
  const problemsByStep = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const i of issues) if (i.stepId) (out[i.stepId] ??= []).push(i.message);
    return out;
  }, [issues]);

  // never lose work to a stray click
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const editingStep = editing ? doc.steps.find((s) => s.id === editing) : undefined;
  const ctx: StepContext = {
    options,
    variables: variables.length ? variables : ['location'],
    targets: doc.steps.filter((s) => s.id !== editing).map((s) => ({ id: s.id, name: s.name })),
    doc,
  };

  const add = (type: string) => {
    const step = newStep(doc, type as StepType, t(`ops.wfb.newName.${type}`));
    setDoc(insertStep(doc, step));
    setEditing(step.id);
  };
  const saveDraft = async () => {
    await save.mutateAsync({
      id: def.id,
      spec,
      name: meta.name.trim() || def.name,
      description: meta.description,
    });
    toast.success(t('ops.wfb.saved'));
  };
  const publishNow = async () => {
    if (dirty) await saveDraft();
    await publish.mutateAsync({ id: def.id });
    toast.success(t('ops.wfb.published'));
  };
  const publishDiff = diffSpecs(live ? (live.spec as unknown as WorkflowSpec) : null, spec);
  const nameOfStep = (sid: string) =>
    spec.steps[sid]?.name ??
    (live?.spec as unknown as WorkflowSpec | undefined)?.steps[sid]?.name ??
    sid;
  const busy = save.isPending || publish.isPending;
  const canPublish = editable && !issues.length && !checking && (dirty || hasDraft);
  const goTo = (sid: string) => {
    setTab('steps');
    const top = doc.steps.find(
      (s) =>
        s.id === sid ||
        (s.type === 'parallel' && s.branches.some((b) => b.some((i) => i.id === sid))),
    );
    if (top) setEditing(top.id);
  };

  return (
    <Page>
      <Button asChild variant="ghost" size="sm" className="-ms-2">
        <Link to={paths.workflows}>
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          {t('ops.wf.backToWorkflows')}
        </Link>
      </Button>
      <PageHeader
        title={def.name}
        badge={
          <span className="flex flex-wrap gap-1.5">
            {def.isSystem ? <Badge variant="secondary">{t('ops.wf.builtIn')}</Badge> : null}
            {live ? (
              <Badge variant="success">{t('ops.wfb.liveRev', { n: live.revision })}</Badge>
            ) : (
              <Badge variant="warning">{t('ops.wfb.notPublished')}</Badge>
            )}
            {dirty ? (
              <Badge variant="warning">{t('ops.wfb.unsaved')}</Badge>
            ) : hasDraft ? (
              <Badge variant="outline">{t('ops.wfb.draftSaved')}</Badge>
            ) : null}
          </span>
        }
        description={def.description ?? t('ops.wfb.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Button type="button" variant="outline" onClick={() => setCloning(true)}>
                <Copy aria-hidden="true" />
                {t('ops.wf.clone')}
              </Button>
            ) : null}
            {editable ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!dirty || busy}
                  loading={save.isPending}
                  onClick={() => void saveDraft().catch(() => undefined)}
                  data-testid="save-draft"
                >
                  <Save aria-hidden="true" />
                  {t('ops.wfb.saveDraft')}
                </Button>
                <Button
                  type="button"
                  disabled={!canPublish || busy}
                  loading={publish.isPending}
                  onClick={() => setConfirm('publish')}
                  data-testid="publish"
                >
                  <Send aria-hidden="true" />
                  {t('ops.wfb.publish')}
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      {!editable ? (
        <div role="status" className="rounded-lg border bg-muted/40 p-4 text-sm">
          {def.isSystem
            ? t('ops.wfb.readOnlySystem')
            : def.archived
              ? t('ops.wfb.readOnlyArchived')
              : t('ops.wfb.readOnlyPermission')}
        </div>
      ) : null}
      {editable && issues.length ? (
        <button
          type="button"
          className="w-full rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-start text-sm text-destructive"
          onClick={() => setTab('check')}
        >
          {t('ops.wfb.blocked', { n: issues.length })}
        </button>
      ) : null}

      <StateSwitcher
        label={t('ops.wfb.sections')}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        testIdPrefix="builder-tab"
        options={TABS.map((v) => ({ value: v, label: t(`ops.wfb.tab.${v}`) }))}
      />

      {tab === 'steps' ? (
        <Pipeline
          doc={doc}
          names={names}
          problemsByStep={problemsByStep}
          onMove={(from, to) => editable && setDoc(moveStep(doc, from, to))}
          onEdit={(sid) => editable && setEditing(sid)}
          onDelete={(sid) => editable && setConfirm({ delete: sid })}
          onAdd={add}
          addTypes={editable ? ADD_TYPES : []}
        />
      ) : null}

      {tab === 'check' ? (
        <div className="space-y-4">
          <ValidationPanel issues={issues} checking={checking} onGoTo={goTo} />
          <SimulatorPanel
            spec={spec}
            actions={governed}
            disabled={issues.some((i) => i.code === 'invalid_shape')}
          />
        </div>
      ) : null}

      {tab === 'history' ? (
        <VersionsPanel
          detail={def}
          canManage={editable}
          onRestore={(s) => {
            setDoc(fromSpec(s).doc);
            toast.info(t('ops.wfb.restored'));
            setTab('steps');
          }}
        />
      ) : null}

      {tab === 'settings' ? (
        <div className="space-y-4">
          <SectionCard title={t('ops.wfb.detailsTitle')}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wf-name">{t('ops.wf.nameLabel')}</Label>
                <Input
                  id="wf-name"
                  value={meta.name}
                  disabled={!editable}
                  maxLength={120}
                  onChange={(e) => setMeta({ ...meta, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wf-desc">{t('ops.wfb.description')}</Label>
                <Textarea
                  id="wf-desc"
                  rows={2}
                  value={meta.description}
                  disabled={!editable}
                  maxLength={500}
                  onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                />
              </div>
            </div>
          </SectionCard>
          <SectionCard title={t('ops.wfb.fallbackTitle')} description={t('ops.wfb.fallbackBody')}>
            <ActorsEditor
              value={doc.fallbackActors}
              onChange={(fallbackActors) => editable && setDoc({ ...doc, fallbackActors })}
              options={options}
              label={t('ops.wfb.fallbackTitle')}
              allowDynamic={false}
            />
          </SectionCard>
          <SectionCard title={t('ops.wfb.revisionsTitle')} description={t('ops.wfb.revisionsBody')}>
            <Label htmlFor="wf-rev" className="sr-only">
              {t('ops.wfb.revisionsTitle')}
            </Label>
            <Input
              id="wf-rev"
              type="number"
              min={0}
              max={10}
              className="w-28"
              disabled={!editable}
              value={doc.maxRevisions}
              onChange={(e) =>
                setDoc({
                  ...doc,
                  maxRevisions: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                })
              }
            />
          </SectionCard>
          <SectionCard title={t('ops.wfb.usedBy')}>
            {boundActionKeys.length ? (
              <ul className="flex flex-wrap gap-2">
                {boundActionKeys.map((k) => (
                  <li key={k}>
                    <Badge variant="outline">{governed.find((a) => a.key === k)?.label ?? k}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('ops.wfb.unbound')}</p>
            )}
          </SectionCard>
          <ImportExport
            name={meta.name}
            code={def.code}
            spec={spec}
            canEdit={editable}
            onLoad={(s) => {
              setDoc(fromSpec(s).doc);
              toast.info(t('ops.wfb.imported'));
              setTab('steps');
            }}
          />
        </div>
      ) : null}

      {editingStep ? (
        <StepSheet
          key={editingStep.id}
          step={editingStep}
          ctx={ctx}
          onClose={() => setEditing(null)}
          onApply={(s: EditorStep) => {
            setDoc(replaceStep(doc, editingStep.id, s));
            setEditing(null);
          }}
        />
      ) : null}

      {confirm === 'publish' ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={t('ops.wfb.publishTitle')}
          description={
            <span className="block space-y-3">
              <span className="block">{t('ops.wfb.publishBody')}</span>
              <DiffSummary diff={publishDiff} nameOf={nameOfStep} />
            </span>
          }
          confirmLabel={t('ops.wfb.publish')}
          onConfirm={publishNow}
        />
      ) : null}
      {confirm && typeof confirm === 'object' ? (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setConfirm(null)}
          title={t('ops.wfb.deleteTitle')}
          description={t('ops.wfb.deleteBody', { name: nameOfStep(confirm.delete) })}
          confirmLabel={t('ops.wfb.deleteStep')}
          onConfirm={async () => setDoc(removeStep(doc, confirm.delete))}
        />
      ) : null}
      {blocker.state === 'blocked' ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && blocker.reset?.()}
          title={t('ops.wfb.leaveTitle')}
          description={t('ops.wfb.leaveBody')}
          confirmLabel={t('ops.wfb.leave')}
          destructive
          onConfirm={async () => blocker.proceed?.()}
        />
      ) : null}
      {cloning ? <CloneDialog def={def} onClose={() => setCloning(false)} /> : null}
    </Page>
  );
}
