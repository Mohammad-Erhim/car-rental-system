import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Textarea,
} from '@carrental/ui';
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

const MAX_DIFF_ROWS = 30;

/** `{a: {b: 1}}` -> `{'a.b': '1'}` — payload shape varies by `kind` (policy/branding/pages/seo/
 *  consent), so a generic recursive flatten is the only representation that works for all of
 *  them without a per-kind renderer. */
function flatten(value: unknown, prefix = '', out: Record<string, string> = {}) {
  if (value === null || value === undefined) {
    out[prefix || '(root)'] = 'null';
  } else if (Array.isArray(value)) {
    if (value.length === 0) out[prefix || '(root)'] = '[]';
    else value.forEach((v, i) => flatten(v, prefix ? `${prefix}[${i}]` : `[${i}]`, out));
  } else if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) out[prefix || '(root)'] = '{}';
    else for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix || '(root)'] = String(value);
  }
  return out;
}

/** Field-level changes between two payloads, so a reviewer sees *what's different* rather than
 *  the whole config dumped out — the live-published row (if any) is the "before". No prior
 *  published revision (first-ever publish) flattens to nothing rather than a spurious top-level
 *  "{} -> built-in default" row — every field then just shows as new on its own. */
function diffPayloads(before: unknown, after: unknown) {
  const b = before === undefined ? {} : flatten(before);
  const a = flatten(after ?? {});
  const paths = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort((x, y) =>
    x.localeCompare(y),
  );
  return paths.filter((p) => b[p] !== a[p]).map((p) => ({ path: p, before: b[p], after: a[p] }));
}

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

/** What the approve confirmation actually shows a reviewer, beyond a bare "Publish this?" — the
 *  field-level diff against whatever is live today, so the second pair of eyes required by
 *  FR-ADM-006's separation of duties can actually see what it's signing off on. Mirrors the
 *  generic /ops/config page's own approve-diff (same `ops.cfg.diff*` copy) — that one's diff is
 *  policy-specific (a flat `Record<string, number>`); this one works for any `kind`'s payload
 *  shape via a generic recursive flatten, since branding/pages/seo/consent payloads nest deeply
 *  and vary in shape from screen to screen. */
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
    <div className="space-y-3">
      <p>{t('ops.cfg.approveBody')}</p>
      {changes.length === 0 ? (
        <Alert variant="warning">
          <AlertDescription>{t('ops.cfg.diffNone')}</AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="mb-1 font-medium">{t('ops.cfg.diffTitle')}</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto" data-testid="config-approve-diff">
            {changes.slice(0, MAX_DIFF_ROWS).map((c) => (
              <li key={c.path} className="flex flex-wrap gap-2 font-mono text-xs">
                <span className="text-muted-foreground">{c.path}:</span>
                <span>{c.before ?? t('ops.cfg.builtInDefault')}</span>
                <span aria-hidden>→</span>
                <span className="font-medium">{c.after ?? t('ops.cfg.builtInDefault')}</span>
              </li>
            ))}
          </ul>
          {changes.length > MAX_DIFF_ROWS ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('ops.cfg.diffMore', { n: changes.length - MAX_DIFF_ROWS })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
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
  const [reasonError, setReasonError] = useState(false);
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
        description={
          approving ? (
            <ApproveDiff
              approving={approving}
              published={versions?.find((v) => v.state === 'published')}
            />
          ) : null
        }
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
            setReasonError(false);
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
              required
              error={reasonError ? t('ops.cfg.rejectReasonRequired') : undefined}
            >
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (e.target.value.trim()) setReasonError(false);
                  }}
                  data-testid="cfg-reject-reason"
                />
              )}
            </Field>
          </div>
        }
        confirmLabel={t('ops.cfg.reject')}
        onConfirm={async () => {
          if (!reason.trim()) {
            setReasonError(true);
            throw new Error('reason required'); // keeps the ConfirmDialog open
          }
          setReasonError(false);
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
