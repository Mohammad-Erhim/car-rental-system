import { useI18n } from '@carrental/i18n/react';
import { AlertCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { ApiError } from '@/lib/api';
import { useServerFormErrors } from '@/lib/use-server-form-errors';

/**
 * A modal form for one action (assign, cancel, refund …). It owns the ceremony every such
 * dialog needs so the pages stay declarative:
 *
 * - the form resets to `defaultValues` each time it opens;
 * - submit runs `onSubmit`; on success the dialog closes, on an API error it STAYS open and shows
 *   the exact problem inline (field errors land on their fields), so nothing the user typed is
 *   lost;
 * - the submit button shows progress and can't be double-clicked.
 *
 * The caller supplies the react-hook-form instance and the fields as children.
 */
export function FormDialog<T extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  form,
  defaultValues,
  onSubmit,
  submitLabel,
  destructive,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  form: UseFormReturn<T>;
  defaultValues: T;
  onSubmit: (values: T) => Promise<unknown>;
  submitLabel: string;
  destructive?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const serverErrors = useServerFormErrors(form);
  const [unexpected, setUnexpected] = useState<string | null>(null);
  const { isSubmitting } = form.formState;

  // start clean every time the dialog opens
  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
      setUnexpected(null);
    }
    // `defaultValues` is rebuilt by callers on every render; only the open transition matters
  }, [open]);

  const submit = form.handleSubmit(async (values) => {
    serverErrors.clear();
    setUnexpected(null);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) serverErrors.handle(err);
      else setUnexpected(t('ops.resv.actionFail'));
    }
  });

  const message = serverErrors.formError ?? unexpected;

  return (
    <Dialog open={open} onOpenChange={(next) => (isSubmitting ? undefined : onOpenChange(next))}>
      <DialogContent closeLabel={t('action.close')} className="sm:max-w-md">
        <Form {...form}>
          <form onSubmit={submit} noValidate className="space-y-5">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </DialogHeader>

            {message ? (
              <Alert variant="destructive" data-testid="form-dialog-error">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-4">{children}</div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                {t('action.cancel')}
              </Button>
              <Button
                type="submit"
                variant={destructive ? 'destructive' : 'default'}
                loading={isSubmitting}
              >
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
