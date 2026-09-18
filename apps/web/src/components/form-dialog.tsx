import { useI18n } from '@carrental/i18n/react';
import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';
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
import { useFormSubmit } from '@/lib/use-form-submit';
import { cn } from '@/lib/utils';

/**
 * A modal form for one action (assign, cancel, refund …); see `useFormSubmit` for the reset /
 * close-on-success / stay-open-on-error behaviour. The caller supplies the react-hook-form
 * instance and the fields as children.
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
  submitDisabled,
  size = 'md',
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
  /** keeps the submit button disabled (e.g. while a prerequisite is still loading) */
  submitDisabled?: boolean;
  /** `lg` for forms with a repeating section or a summary */
  size?: 'md' | 'lg';
  /** omit for a plain confirmation — the body strip is then left out, not rendered empty */
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const { submit, isSubmitting, message } = useFormSubmit({
    form,
    open,
    defaultValues,
    onSubmit,
    onClose: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (isSubmitting ? undefined : onOpenChange(next))}>
      <DialogContent
        closeLabel={t('action.close')}
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <Form {...form}>
          {/* header and footer stay put; only the fields scroll */}
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0 border-b px-6 py-4 pe-12">
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </DialogHeader>

            {message || children ? (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                {message ? (
                  <Alert variant="destructive" data-testid="form-dialog-error">
                    <AlertCircle aria-hidden="true" />
                    <AlertDescription>{message}</AlertDescription>
                  </Alert>
                ) : null}
                {children}
              </div>
            ) : null}

            <DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-6 py-4">
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
                disabled={submitDisabled}
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
