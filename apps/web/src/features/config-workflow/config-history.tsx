import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Send, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { diffPayloads } from './payload-diff';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { TextareaField } from '@/components/form-fields';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ConfigState, ConfigVersion } from '@/lib/admin-hooks';

export type WorkflowAction = 'submit' | 'approve' | 'reject';

const TONE: Record<ConfigState, BadgeProps['variant']> = {
  draft: 'secondary',
  in_review: 'warning',
  published: 'success',
  superseded: 'outline',
  rejected: 'destructive',
};
const MAX_DIFF_ROWS = 30;

/** What the approve confirmation shows: the field-level diff against what is live today. */
function ApproveDiff({
  approving,
  published,
}: {
  approving: ConfigVersion;
  published: ConfigVersion | undefined;
}) {
  const { t } = useI18n();
  const changes = diffPayloads(published?.payload, approving.payload);
  return (
    <span className="block space-y-3">
      <span className="block">{t('ops.cfg.approveBody')}</span>
      {changes.length === 0 ? (
        <Alert variant="warning">
          <AlertDescription>{t('ops.cfg.diffNone')}</AlertDescription>
        </Alert>
      ) : (
        <span className="block rounded-lg border bg-muted/40 p-3 text-sm">
          <span className="mb-1 block font-medium text-foreground">{t('ops.cfg.diffTitle')}</span>
          <span
            className="block max-h-64 space-y-1 overflow-y-auto"
            data-testid="config-approve-diff"
          >
            {changes.slice(0, MAX_DIFF_ROWS).map((c) => (
              <span key={c.path} className="flex flex-wrap gap-2 font-mono text-xs">
                <span className="text-muted-foreground">{c.path}:</span>
                <span>{c.before ?? t('ops.cfg.builtInDefault')}</span>
                <span aria-hidden="true">→</span>
                <span className="font-medium text-foreground">
                  {c.after ?? t('ops.cfg.builtInDefault')}
                </span>
              </span>
            ))}
          </span>
          {changes.length > MAX_DIFF_ROWS ? (
            <span className="mt-1 block text-xs text-muted-foreground">
              {t('ops.cfg.diffMore', { n: changes.length - MAX_DIFF_ROWS })}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}

function RejectDialog({
  onReject,
  open,
  onOpenChange,
}: {
  onReject: (note: string) => Promise<unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const schema = useMemo(
    () => z.object({ reason: z.string().trim().min(1, t('ops.cfg.rejectReasonRequired')) }),
    [t],
  );
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { reason: '' } });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{ reason: '' }}
      destructive
      title={t('ops.cfg.rejectTitle')}
      description={t('ops.cfg.rejectBody')}
      submitLabel={t('ops.cfg.reject')}
      onSubmit={(v) => onReject(v.reason.trim())}
    >
      <TextareaField
        control={form.control}
        name="reason"
        label={t('ops.cfg.rejectReason')}
        rows={3}
        autoFocus
        data-testid="cfg-reject-reason"
      />
    </FormDialog>
  );
}

type Dialog = { kind: 'approve' | 'reject' | 'delete'; version: ConfigVersion } | null;

/**
 * Revision history + review controls, shared by every versioned config screen (branding, SEO,
 * consent, pages). DEC-025: a draft is published directly by anyone holding `config.publish` (no
 * redeploy), or — optionally — submitted for review first, then approved or rejected with a reason.
 * Publish, approve, reject and delete are confirmed because they act on what customers see.
 */
export function ConfigHistory({
  versions,
  isLoading,
  canPublish,
  pending,
  limit = 8,
  onAction,
  onDelete,
  describe,
  onRevise,
}: {
  versions: ConfigVersion[] | undefined;
  isLoading?: boolean;
  canPublish: boolean;
  pending?: boolean;
  limit?: number;
  onAction: (input: { id: string; action: WorkflowAction; note?: string }) => Promise<unknown>;
  /** discard an unsubmitted draft; omit to hide the control */
  onDelete?: (id: string) => Promise<unknown>;
  /** a one-line reading of a revision's values, shown under its date */
  describe?: (v: ConfigVersion) => string;
  /** start a new draft from a rejected or superseded revision */
  onRevise?: (v: ConfigVersion) => void;
}) {
  const { t, fmt } = useI18n();
  const [dialog, setDialog] = useState<Dialog>(null);
  // every action reports what it did to which revision
  const run = async (v: ConfigVersion, action: WorkflowAction, note?: string) => {
    await onAction({ id: v.id, action, note });
    toast.success(
      t(
        action === 'submit'
          ? 'ops.cfg.submitted'
          : action === 'approve'
            ? 'ops.cfg.approved'
            : 'ops.cfg.rejected',
        { n: v.revision },
      ),
    );
  };
  const [showAll, setShowAll] = useState(false);
  const close = (o: boolean) => {
    if (!o) setDialog(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }
  if (!versions?.length) return <StateView title={t('ops.cfg.emptyHistory')} className="py-8" />;

  const shown = showAll ? versions : versions.slice(0, limit);
  const live = versions.find((v) => v.state === 'published');

  return (
    <div>
      <ol className="divide-y" data-testid="config-history">
        {shown.map((v) => (
          <li
            key={v.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{t('ops.cfg.rev', { n: v.revision })}</span>
                <Badge variant={TONE[v.state]}>{t(`ops.cfg.state.${v.state}`)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {fmt.dateTime(v.createdAt)}
                {v.note ? ` · ${v.note}` : ''}
              </p>
              {describe ? <p className="text-sm">{describe(v)}</p> : null}
            </div>
            {canPublish || (onRevise && (v.state === 'rejected' || v.state === 'superseded')) ? (
              <div className="flex flex-wrap gap-2">
                {onRevise && (v.state === 'rejected' || v.state === 'superseded') ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRevise(v)}
                    data-testid={`revise-${v.revision}`}
                  >
                    {t('ops.cfg.revise')}
                  </Button>
                ) : null}
                {canPublish && v.state === 'draft' ? (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => setDialog({ kind: 'approve', version: v })}
                      data-testid={`publish-${v.revision}`}
                    >
                      <Check aria-hidden="true" />
                      {t('ops.cfg.publish')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void run(v, 'submit').catch(() => undefined)}
                    >
                      <Send aria-hidden="true" />
                      {t('ops.cfg.submit')}
                    </Button>
                  </>
                ) : null}
                {canPublish && v.state === 'draft' && onDelete ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setDialog({ kind: 'delete', version: v })}
                  >
                    <Trash2 aria-hidden="true" />
                    {t('ops.cfg.delete')}
                  </Button>
                ) : null}
                {canPublish && v.state === 'in_review' ? (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => setDialog({ kind: 'approve', version: v })}
                    >
                      <Check aria-hidden="true" />
                      {t('ops.cfg.approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setDialog({ kind: 'reject', version: v })}
                    >
                      <X aria-hidden="true" />
                      {t('ops.cfg.reject')}
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {versions.length > limit ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => setShowAll((s) => !s)}
        >
          {showAll ? t('ops.cfg.showLess') : t('ops.cfg.showAll', { n: versions.length })}
        </Button>
      ) : null}

      {dialog?.kind === 'approve' ? (
        <ConfirmDialog
          open
          onOpenChange={close}
          title={t('ops.cfg.approveTitle')}
          description={<ApproveDiff approving={dialog.version} published={live} />}
          confirmLabel={t(dialog.version.state === 'draft' ? 'ops.cfg.publish' : 'ops.cfg.approve')}
          onConfirm={() => run(dialog.version, 'approve')}
        />
      ) : null}
      {dialog?.kind === 'reject' ? (
        <RejectDialog
          open
          onOpenChange={close}
          onReject={(note) => run(dialog.version, 'reject', note)}
        />
      ) : null}
      {dialog?.kind === 'delete' && onDelete ? (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={t('ops.cfg.deleteTitle')}
          description={t('ops.cfg.deleteBody')}
          confirmLabel={t('ops.cfg.delete')}
          onConfirm={async () => {
            await onDelete(dialog.version.id);
            toast.success(t('ops.cfg.deleted', { n: dialog.version.revision }));
          }}
        />
      ) : null}
    </div>
  );
}
