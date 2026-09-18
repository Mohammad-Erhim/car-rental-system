import { useI18n } from '@carrental/i18n/react';
import { useEffect, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { ApiError } from '@/lib/api';
import { useServerFormErrors } from '@/lib/use-server-form-errors';

/** An error whose message is meant for the user (a check the form does itself); shown above the fields. */
export class FormMessageError extends Error {}

/**
 * The submit ceremony shared by modal forms (dialogs and sheets):
 *
 * - the form resets to `defaultValues` each time it opens;
 * - on success the container closes; on an API error it STAYS open, the exact problem is shown
 *   inline (field errors land on their fields) and nothing the user typed is lost;
 * - `isSubmitting` drives the submit button and blocks dismissing mid-request.
 */
export function useFormSubmit<T extends FieldValues>({
  form,
  open,
  defaultValues,
  onSubmit,
  onClose,
}: {
  form: UseFormReturn<T>;
  open: boolean;
  defaultValues: T;
  onSubmit: (values: T) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const serverErrors = useServerFormErrors(form);
  const [unexpected, setUnexpected] = useState<string | null>(null);

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
      onClose();
    } catch (err) {
      if (err instanceof ApiError) serverErrors.handle(err);
      else if (err instanceof FormMessageError) setUnexpected(err.message);
      else setUnexpected(t('ops.resv.actionFail'));
    }
  });

  return {
    submit,
    isSubmitting: form.formState.isSubmitting,
    /** the message to show above the fields, or null */
    message: serverErrors.formError ?? unexpected,
  };
}
