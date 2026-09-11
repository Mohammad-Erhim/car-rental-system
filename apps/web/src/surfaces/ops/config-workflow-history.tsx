import { useI18n } from '@carrental/i18n/react';
import { Badge, Button, ConfirmDialog, Field, Textarea } from '@carrental/ui';
import { useState } from 'react';

import type { ConfigState, ConfigVersion } from '../../lib/admin-hooks.js';

type WorkflowAction = 'submit' | 'approve' | 'reject';

const STATE_VARIANT: Record<ConfigState, 'success' | 'warning' | 'neutral' | 'destructive'> = {
  draft: 'neutral',
  in_review: 'warning',
  published: 'success',
  superseded: 'neutral',
  rejected: 'destructive',
};

interface Props {
  versions: ConfigVersion[] | undefined;
  isLoading?: boolean;
  canPublish: boolean;
  pending?: boolean;
  /** Rows to show (default 8). */
  limit?: number;
  onAction: (input: { id: string; action: WorkflowAction; note?: string }) => Promise<unknown>;
  /** Discard an unsubmitted draft revision (config.publish-gated, same as everything else here —
   *  omit to hide the control on a screen that doesn't wire it up yet). */
  onDelete?: (id: string) => Promise<unknown>;
}

/**
 * Shared revision history + review controls for every config-version workflow screen
 * (branding, SEO, consent, pages). DEC-025 / FR-ADM-006: one draft is submitted, then a
 * *different* reviewer either approves — which publishes it live to the public site and this
 * dashboard with no redeploy — or rejects it with a reason. Approve and reject both go through
 * a confirmation because they are outward-facing, irreversible-in-place actions (design §12.5).
 */
export function ConfigWorkflowHistory({
  versions,
  isLoading,
  canPublish,
  pending,
  limit = 8,
  onAction,
  onDelete,
}: Props) {
  const { t, fmt } = useI18n();
  const [approving, setApproving] = useState<ConfigVersion | null>(null);
  const [rejecting, setRejecting] = useState<ConfigVersion | null>(null);
  const [deleting, setDeleting] = useState<ConfigVersion | null>(null);
  const [reason, setReason] = useState('');
  const [deletePending, setDeletePending] = useState(false);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('ops.st.loading')}</p>;
  if (!versions?.length)
    return <p className="text-sm text-muted-foreground">{t('ops.cfg.empty')}</p>;

  return (
    <div className="space-y-2">
      {versions.slice(0, limit).map((v) => (
        <div
          key={v.id}
          className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm"
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium">{t('ops.cfg.rev', { n: v.revision })}</span>
            <Badge variant={STATE_VARIANT[v.state]}>{t(`ops.cfg.state.${v.state}`)}</Badge>
            <span className="text-xs text-muted-foreground">{fmt.dateTime(v.createdAt)}</span>
            {v.note ? <span className="text-xs text-muted-foreground">· {v.note}</span> : null}
          </span>
          <span className="flex gap-1">
            {v.state === 'draft' && canPublish ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => onAction({ id: v.id, action: 'submit' })}
              >
                {t('ops.cfg.submit')}
              </Button>
            ) : null}
            {v.state === 'draft' && canPublish && onDelete ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDeleting(v)}>
                {t('ops.cfg.delete')}
              </Button>
            ) : null}
            {v.state === 'in_review' && canPublish ? (
              <>
                <Button size="sm" disabled={pending} onClick={() => setApproving(v)}>
                  {t('ops.cfg.approve')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setReason('');
                    setRejecting(v);
                  }}
                >
                  {t('ops.cfg.reject')}
                </Button>
              </>
            ) : null}
          </span>
        </div>
      ))}

      <ConfirmDialog
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        title={t('ops.cfg.approveTitle')}
        description={t('ops.cfg.approveBody')}
        confirmLabel={t('ops.cfg.approve')}
        onConfirm={async () => {
          if (approving) await onAction({ id: approving.id, action: 'approve' });
        }}
      />

      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(o) => {
          if (!o) {
            setRejecting(null);
            setReason('');
          }
        }}
        destructive
        title={t('ops.cfg.rejectTitle')}
        description={
          <div className="space-y-3">
            <p>{t('ops.cfg.rejectBody')}</p>
            <Field
              label={t('ops.cfg.rejectReason')}
              htmlFor="cfg-reject-reason"
              error={rejecting && !reason.trim() ? t('ops.cfg.rejectReasonRequired') : undefined}
            >
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-testid="cfg-reject-reason"
                />
              )}
            </Field>
          </div>
        }
        confirmLabel={t('ops.cfg.reject')}
        onConfirm={async () => {
          if (!reason.trim()) throw new Error('reason required');
          if (rejecting)
            await onAction({ id: rejecting.id, action: 'reject', note: reason.trim() });
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        title={t('ops.cfg.deleteTitle')}
        description={t('ops.cfg.deleteBody')}
        confirmLabel={t('ops.cfg.delete')}
        confirmDisabled={deletePending}
        onConfirm={async () => {
          if (!deleting || !onDelete) return;
          setDeletePending(true);
          try {
            await onDelete(deleting.id);
            setDeleting(null);
          } finally {
            setDeletePending(false);
          }
        }}
      />
    </div>
  );
}
