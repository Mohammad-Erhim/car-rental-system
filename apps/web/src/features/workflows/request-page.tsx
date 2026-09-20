import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Check, CircleDashed, Clock, Undo2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { DecisionDialog } from './decision-dialog';
import { WorkflowStatusBadge } from './workflow-status';

import { paths } from '@/app/paths';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DetailList } from '@/components/detail-list';
import { FormDialog } from '@/components/form-dialog';
import { TextareaField } from '@/components/form-fields';
import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BreadcrumbLabelSetter } from '@/layouts/breadcrumb-label';
import {
  useDecide,
  useMonitorAction,
  useRequest,
  useWithdraw,
  type RequestDetail,
  type WorkflowDecision,
} from '@/lib/workflow-hooks';

const OPEN = ['running', 'applying', 'apply_failed'];

/** One request in full: where it stands, who was asked and what they said, the change, and the history. */
export function RequestPage() {
  const { t, fmt } = useI18n();
  const { id } = useParams();
  const req = useRequest(id);
  const decide = useDecide();
  const withdraw = useWithdraw();
  const monitor = useMonitorAction();
  const [dialog, setDialog] = useState<
    | { kind: 'decide'; taskId: string; decision: WorkflowDecision; requireComment: boolean }
    | { kind: 'withdraw' }
    | { kind: 'cancel' }
    | { kind: 'force'; decision: 'approve' | 'reject' }
    | null
  >(null);

  if (req.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (req.isError || !req.data) {
    return (
      <StateView
        kind="error"
        title={t('ops.wf.requestMissing')}
        actionLabel={t('ops.wf.backToTasks')}
        onAction={() => history.back()}
      />
    );
  }
  const r: RequestDetail = req.data;
  const open = OPEN.includes(r.status);
  const close = (o: boolean) => {
    if (!o) setDialog(null);
  };

  return (
    <Page>
      <BreadcrumbLabelSetter label={r.subjectLabel ?? r.actionLabel} />
      <Button asChild variant="ghost" size="sm" className="-ms-2">
        <Link to={paths.tasks}>
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          {t('ops.wf.backToTasks')}
        </Link>
      </Button>
      <PageHeader
        title={r.subjectLabel ?? r.actionLabel}
        badge={<WorkflowStatusBadge status={r.status} />}
        description={r.actionDescription ?? r.actionLabel}
        actions={
          open ? (
            <div className="flex flex-wrap gap-2">
              {r.canWithdraw ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: 'withdraw' })}
                  data-testid="wf-withdraw"
                >
                  <Undo2 aria-hidden="true" />
                  {t('ops.wf.withdraw')}
                </Button>
              ) : null}
              {r.canMonitor ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialog({ kind: 'force', decision: 'approve' })}
                  >
                    {t('ops.wf.forceApprove')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialog({ kind: 'force', decision: 'reject' })}
                  >
                    {t('ops.wf.forceReject')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'cancel' })}>
                    {t('ops.wf.cancelRequest')}
                  </Button>
                </>
              ) : null}
            </div>
          ) : null
        }
      />

      {r.status === 'apply_failed' ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <p className="font-medium">{t('ops.wf.applyFailedTitle')}</p>
          <p className="mt-1 text-muted-foreground">
            {t('ops.wf.applyFailedBody', { n: r.applyAttempts })} {r.lastError}
          </p>
        </div>
      ) : null}
      {r.status === 'stale' ? (
        <div role="status" className="rounded-lg border bg-muted/40 p-4 text-sm">
          {t('ops.wf.staleBody')}
        </div>
      ) : null}

      <SectionCard title={t('ops.wf.summary')}>
        <DetailList
          items={[
            { term: t('ops.wf.requester'), detail: r.initiator.label ?? '—' },
            { term: t('ops.wf.requestedAt'), detail: fmt.dateTime(r.createdAt) },
            { term: t('ops.wf.workflow'), detail: r.definitionName },
            { term: t('ops.wf.revision'), detail: String(r.revision) },
            ...(r.closedAt
              ? [{ term: t('ops.wf.closedAt'), detail: fmt.dateTime(r.closedAt) }]
              : []),
            ...(r.closedReason ? [{ term: t('ops.wf.closedReason'), detail: r.closedReason }] : []),
          ]}
        />
      </SectionCard>

      {Object.keys(r.context).length ? (
        <SectionCard title={t('ops.wf.change')} description={t('ops.wf.changeBody')}>
          <DetailList
            items={Object.entries(r.context)
              .filter(([, v]) => v !== null && v !== undefined && !Array.isArray(v))
              .map(([k, v]) => ({
                term: k,
                detail: <span className="bidi-isolate">{String(v)}</span>,
              }))}
          />
        </SectionCard>
      ) : null}

      <SectionCard title={t('ops.wf.steps')}>
        <ol className="space-y-4" data-testid="wf-steps">
          {r.tasks.map((task) => {
            const me = task.assignees.find((a) => a.isMe && a.status === 'pending');
            const decisions: WorkflowDecision[] =
              task.stepType === 'task'
                ? ['complete']
                : task.allowChanges
                  ? ['approve', 'reject', 'request_changes']
                  : ['approve', 'reject'];
            return (
              <li key={task.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{task.title}</h3>
                    <Badge
                      variant={
                        task.status === 'open'
                          ? 'warning'
                          : task.status === 'done'
                            ? 'success'
                            : 'secondary'
                      }
                    >
                      {t(`ops.wf.taskStatus.${task.status}`)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t(`ops.wf.mode.${task.mode}`, { n: task.required })}
                    </span>
                  </div>
                  {task.dueAt && task.status === 'open' ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" aria-hidden="true" />
                      {t('ops.wf.due', { when: fmt.dateTime(task.dueAt) })}
                    </span>
                  ) : null}
                </div>
                <ul className="space-y-1.5 text-sm">
                  {task.assignees
                    .filter((a) => a.status !== 'removed' || a.decision)
                    .map((a) => (
                      <li key={a.staffProfileId} className="flex flex-wrap items-center gap-2">
                        {a.decision === 'approve' || a.decision === 'complete' ? (
                          <Check className="size-4 text-success" aria-hidden="true" />
                        ) : a.decision ? (
                          <X className="size-4 text-destructive" aria-hidden="true" />
                        ) : (
                          <CircleDashed
                            className="size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                        <span className="font-medium">{a.name}</span>
                        {a.decision ? (
                          <span className="text-muted-foreground">
                            {t(`ops.wf.said.${a.decision}`)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{t('ops.wf.waiting')}</span>
                        )}
                        {a.comment ? (
                          <span className="text-muted-foreground">— “{a.comment}”</span>
                        ) : null}
                      </li>
                    ))}
                </ul>
                {me && open ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {decisions.map((d) => (
                      <Button
                        key={d}
                        size="sm"
                        variant={d === 'approve' || d === 'complete' ? 'default' : 'outline'}
                        onClick={() =>
                          setDialog({
                            kind: 'decide',
                            taskId: task.id,
                            decision: d,
                            requireComment: task.requireComment,
                          })
                        }
                        data-testid={`wf-${d}`}
                      >
                        {t(`ops.wf.do.${d}`)}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </SectionCard>

      <SectionCard title={t('ops.wf.history')}>
        <ol className="space-y-2 text-sm" data-testid="wf-history">
          {r.history.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="text-muted-foreground">{fmt.dateTime(h.at)}</span>
              <span className="font-medium">{t(`ops.wf.event.${h.type}`)}</span>
              {h.actor ? <span className="text-muted-foreground">{h.actor}</span> : null}
              {typeof h.data.comment === 'string' && h.data.comment ? (
                <span className="text-muted-foreground">— “{h.data.comment}”</span>
              ) : null}
            </li>
          ))}
        </ol>
      </SectionCard>

      {dialog?.kind === 'decide' ? (
        <DecisionDialog
          open
          onOpenChange={close}
          decision={dialog.decision}
          subject={r.subjectLabel ?? r.actionLabel}
          requireComment={dialog.requireComment}
          onSubmit={async (comment) => {
            await decide.mutateAsync({ taskId: dialog.taskId, decision: dialog.decision, comment });
            toast.success(t(`ops.wf.done.${dialog.decision}`));
          }}
        />
      ) : null}
      {dialog?.kind === 'withdraw' ? (
        <ConfirmDialog
          open
          onOpenChange={close}
          title={t('ops.wf.withdrawTitle')}
          description={t('ops.wf.withdrawBody')}
          confirmLabel={t('ops.wf.withdraw')}
          onConfirm={async () => {
            await withdraw.mutateAsync({ id: r.instanceId });
            toast.success(t('ops.wf.withdrawn'));
          }}
        />
      ) : null}
      {dialog?.kind === 'cancel' || dialog?.kind === 'force' ? (
        <ReasonDialog
          open
          onOpenChange={close}
          destructive={dialog.kind === 'cancel' || dialog.decision === 'reject'}
          title={t(
            dialog.kind === 'cancel'
              ? 'ops.wf.cancelTitle'
              : dialog.decision === 'approve'
                ? 'ops.wf.forceApproveTitle'
                : 'ops.wf.forceRejectTitle',
          )}
          body={t('ops.wf.reasonBody')}
          submitLabel={t(
            dialog.kind === 'cancel'
              ? 'ops.wf.cancelRequest'
              : dialog.decision === 'approve'
                ? 'ops.wf.forceApprove'
                : 'ops.wf.forceReject',
          )}
          onSubmit={async (reason) => {
            if (dialog.kind === 'cancel')
              await monitor.mutateAsync({ kind: 'cancel', id: r.instanceId, reason });
            else
              await monitor.mutateAsync({
                kind: 'force',
                id: r.instanceId,
                decision: dialog.decision,
                reason,
              });
            toast.success(t('ops.wf.monitorDone'));
          }}
        />
      ) : null}
    </Page>
  );
}

function ReasonDialog({
  open,
  onOpenChange,
  title,
  body,
  submitLabel,
  destructive,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: string;
  submitLabel: string;
  destructive?: boolean;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const schema = useMemo(
    () => z.object({ reason: z.string().trim().min(3, t('ops.wf.commentRequired')) }),
    [t],
  );
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { reason: '' } });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{ reason: '' }}
      destructive={destructive}
      title={title}
      description={body}
      submitLabel={submitLabel}
      onSubmit={(v) => onSubmit(v.reason.trim())}
    >
      <TextareaField
        control={form.control}
        name="reason"
        label={t('ops.wf.reasonLabel')}
        rows={3}
        autoFocus
      />
    </FormDialog>
  );
}
