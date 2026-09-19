import { useI18n } from '@carrental/i18n/react';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useApplyMatrix,
  type MatrixChange,
  type MatrixResult,
  type RoleRow,
} from '@/lib/access-hooks';

/**
 * The change review: asks the API for a dry run (nothing is written) and shows, per role, exactly
 * which permissions are added or removed and how many people hold it — then applies on confirm.
 */
export function ReviewMatrixDialog({
  changes,
  roles,
  open,
  onOpenChange,
  onApplied,
}: {
  changes: MatrixChange[];
  roles: RoleRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const { t } = useI18n();
  const apply = useApplyMatrix();
  const [preview, setPreview] = useState<MatrixResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    setPreview(null);
    setError(null);
    apply
      .mutateAsync({ dryRun: true, changes })
      .then((r) => live && setPreview(r))
      .catch(
        (e: unknown) => live && setError(e instanceof Error ? e.message : t('ops.access.saveFail')),
      );
    return () => {
      live = false;
    };
    // the preview is recomputed when the dialog opens for a different set of edits
  }, [JSON.stringify(changes)]);

  const roleName = (code: string) => roles.find((r) => r.code === code)?.name ?? code;
  const people = preview?.changes.reduce((n, c) => Math.max(n, c.affectedStaff), 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent closeLabel={t('action.close')} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('ops.access.reviewTitle')}</DialogTitle>
          <DialogDescription>{t('ops.access.reviewBody')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-4 overflow-y-auto" data-testid="matrix-review-body">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : !preview ? (
            <div
              role="status"
              className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t('ops.st.loading')}
            </div>
          ) : (
            preview.changes.map((c) => (
              <section key={c.roleCode} className="rounded-lg border p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{roleName(c.roleCode)}</h3>
                  <Badge variant={c.affectedStaff ? 'warning' : 'secondary'}>
                    {t('ops.access.affected', { n: c.affectedStaff })}
                  </Badge>
                </div>
                {c.added.length ? (
                  <ul className="mb-1 space-y-0.5 text-sm">
                    {c.added.map((a) => (
                      <li key={a} className="text-success">
                        + <span className="bidi-isolate font-mono text-xs">{a}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {c.removed.length ? (
                  <ul className="space-y-0.5 text-sm">
                    {c.removed.map((a) => (
                      <li key={a} className="text-destructive">
                        − <span className="bidi-isolate font-mono text-xs">{a}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!c.added.length && !c.removed.length ? (
                  <p className="text-sm text-muted-foreground">{t('ops.access.noChange')}</p>
                ) : null}
              </section>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('action.cancel')}
          </Button>
          <Button
            disabled={!preview || saving || !!error}
            loading={saving}
            data-testid="matrix-apply"
            onClick={async () => {
              setSaving(true);
              try {
                await apply.mutateAsync({ changes });
                toast.success(t('ops.access.applied', { n: people }));
                onApplied();
              } catch (e) {
                setError(e instanceof Error ? e.message : t('ops.access.saveFail'));
              } finally {
                setSaving(false);
              }
            }}
          >
            {t('ops.access.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
