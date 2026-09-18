import { useI18n } from '@carrental/i18n/react';
import { useEffect } from 'react';

import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplatePreview, type TemplateDetail } from '@/lib/admin-hooks';

/** Renders the saved template with sample values, and flags missing variables or content issues. */
export function TemplatePreviewDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: TemplateDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const preview = useTemplatePreview();
  const { mutate } = preview;

  useEffect(() => {
    mutate({
      subject: detail.subject,
      bodyTemplate: detail.bodyTemplate,
      variables: detail.variables,
    });
  }, [detail.id, detail.subject, detail.bodyTemplate, detail.variables, mutate]);

  const p = preview.data;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('action.close')} className="max-w-2xl" data-testid="tpl-preview">
        <DialogHeader>
          <DialogTitle>{t('ops.tpl.previewTitle')}</DialogTitle>
          <DialogDescription>{t('ops.tpl.previewHint')}</DialogDescription>
        </DialogHeader>
        {preview.isPending ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : preview.isError ? (
          <StateView kind="error" title={t('ops.tpl.previewFail')} />
        ) : p ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border">
              <p className="border-b bg-muted/40 px-4 py-2.5 text-sm font-medium">{p.subject}</p>
              <pre className="max-h-[45dvh] overflow-auto whitespace-pre-wrap p-4 font-sans text-sm">
                {p.body}
              </pre>
            </div>
            {p.missingVars.length ? (
              <Alert variant="warning">
                <AlertDescription>
                  {t('ops.tpl.missingVars', { list: p.missingVars.join(', ') })}
                </AlertDescription>
              </Alert>
            ) : null}
            {p.contentIssues.length ? (
              <Alert variant="destructive">
                <AlertDescription>
                  <ul className="list-disc ps-4">
                    {p.contentIssues.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
