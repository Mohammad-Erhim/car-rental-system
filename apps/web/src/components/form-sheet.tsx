import { useI18n } from '@carrental/i18n/react';
import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useFormSubmit } from '@/lib/use-form-submit';

/**
 * A side-panel form for creating or editing a record (longer than a dialog's single action).
 * Same behaviour as `FormDialog` — see `useFormSubmit` — with a fixed header and footer around
 * the scrolling fields.
 */
export function FormSheet<T extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  form,
  defaultValues,
  onSubmit,
  submitLabel,
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
  /** `lg` for long forms (sections, repeating rows) */
  size?: 'md' | 'lg';
  children: ReactNode;
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
    <Sheet open={open} onOpenChange={(next) => (isSubmitting ? undefined : onOpenChange(next))}>
      <SheetContent
        closeLabel={t('action.close')}
        className={size === 'lg' ? 'p-0 sm:max-w-2xl' : 'p-0 sm:max-w-lg'}
      >
        <Form {...form}>
          <form onSubmit={submit} noValidate className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b p-6 pe-12">
              <SheetTitle>{title}</SheetTitle>
              {description ? <SheetDescription>{description}</SheetDescription> : null}
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
              {message ? (
                <Alert variant="destructive" data-testid="form-dialog-error">
                  <AlertCircle aria-hidden="true" />
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}
              {children}
            </div>

            <SheetFooter className="border-t bg-muted/20 p-6">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                {t('action.cancel')}
              </Button>
              <Button type="submit" loading={isSubmitting}>
                {submitLabel}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
