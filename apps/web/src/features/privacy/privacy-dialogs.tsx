import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { TextareaField } from '@/components/form-fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useCompletePrivacyRequest,
  usePrivacyRequest,
  useRejectPrivacyRequest,
  type PrivacyRequestRow,
} from '@/lib/privacy-hooks';

/** What the customer wrote, quoted — the reviewer should not have to open anything else to see it. */
function CustomerSaid({ text }: { text: string | null }) {
  const { t } = useI18n();
  if (!text) return null;
  return (
    <figure className="rounded-lg border bg-muted/40 p-3 text-sm">
      <figcaption className="mb-1 text-xs font-medium text-muted-foreground">
        {t('ops.priv.customerSaid')}
      </figcaption>
      <blockquote className="whitespace-pre-wrap">{text}</blockquote>
    </figure>
  );
}

/**
 * Finish a request. What "finish" does depends on the kind, so the dialog says exactly that:
 * an access request releases the download (and shows what it holds); a correction needs a note
 * of what was fixed; a closure closes the account and erases the person — which the dialog spells
 * out, refuses while something is still open, and which the API confirms with a fresh password.
 */
export function CompleteDialog({
  request,
  open,
  onOpenChange,
}: {
  request: PrivacyRequestRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const complete = useCompletePrivacyRequest();
  const detail = usePrivacyRequest(request.id, open && request.kind === 'access');
  const needsNote = request.kind === 'correction';
  const blocked = request.kind === 'closure' && request.blockers.length > 0;
  const schema = useMemo(
    () =>
      z.object({
        note: needsNote
          ? z.string().trim().min(3, t('ops.priv.noteRequired')).max(2000)
          : z.string().trim().max(2000),
      }),
    [t, needsNote],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { note: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const summary = detail.data?.exportSummary;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t(`ops.priv.complete.${request.kind}.title`)}
      description={t(`ops.priv.complete.${request.kind}.body`)}
      submitLabel={t(`ops.priv.complete.${request.kind}.submit`)}
      destructive={request.kind === 'closure'}
      submitDisabled={blocked}
      onSubmit={async ({ note }) => {
        await complete.mutateAsync({ id: request.id, note: note.trim() || undefined });
        toast.success(t(`ops.priv.done.${request.kind}`));
      }}
    >
      <CustomerSaid text={request.detail} />

      {request.kind === 'closure' ? (
        blocked ? (
          <Alert variant="warning" data-testid="privacy-blocked">
            <AlertDescription>
              <p className="font-medium">{t('ops.priv.blockedTitle')}</p>
              <ul className="mt-1 list-disc ps-5">
                {request.blockers.map((b) => (
                  <li key={b.code}>{t(`privacy.blocker.${b.code}`, { count: b.count ?? 0 })}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive" data-testid="privacy-erase-warning">
            <AlertDescription className="space-y-1">
              <p>{t('ops.priv.closureErases')}</p>
              <p>{t('ops.priv.closureKeeps')}</p>
            </AlertDescription>
          </Alert>
        )
      ) : null}

      {request.kind === 'access' && summary ? (
        <p className="text-sm text-muted-foreground" data-testid="privacy-export-summary">
          {t('ops.priv.exportSummary', {
            reservations: summary.reservations ?? 0,
            rentals: summary.rentals ?? 0,
            payments: summary.payments ?? 0,
            invoices: summary.invoices ?? 0,
            drivers: summary.drivers ?? 0,
            messages: summary.messages ?? 0,
          })}
        </p>
      ) : null}

      <TextareaField
        control={form.control}
        name="note"
        label={needsNote ? t('ops.priv.noteLabelRequired') : t('ops.priv.noteLabel')}
        rows={3}
        data-testid="privacy-note"
      />
    </FormDialog>
  );
}

/** Decline a request. The reason is shown to the customer, so it is required. */
export function RejectDialog({
  request,
  open,
  onOpenChange,
}: {
  request: PrivacyRequestRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const reject = useRejectPrivacyRequest();
  const schema = useMemo(
    () => z.object({ note: z.string().trim().min(3, t('ops.priv.reasonRequired')).max(2000) }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { note: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.priv.reject.title')}
      description={t('ops.priv.reject.body')}
      submitLabel={t('ops.priv.reject.submit')}
      destructive
      onSubmit={async ({ note }) => {
        await reject.mutateAsync({ id: request.id, note: note.trim() });
        toast.success(t('ops.priv.rejected'));
      }}
    >
      <CustomerSaid text={request.detail} />
      <TextareaField
        control={form.control}
        name="note"
        label={t('ops.priv.reasonLabel')}
        rows={3}
        data-testid="privacy-reason"
      />
    </FormDialog>
  );
}
