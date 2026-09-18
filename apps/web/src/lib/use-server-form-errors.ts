import { useFormErrors } from '@carrental/client/react';
import { useCallback, useEffect } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

/**
 * Bridges API problem responses into a react-hook-form form.
 *
 * - `fieldErrors` from the API are set on the matching fields (localised through the shared
 *   `error.field.*` catalogue) and focus moves to the first one.
 * - Anything that can't be shown next to a field — a top-level problem (conflict, rate limit,
 *   wrong credentials …) or a field path the form doesn't have — is returned as `formError`,
 *   for an `<Alert>` above the form.
 *
 * Usage: `catch (err) { serverErrors.handle(err); }` and `serverErrors.clear()` before a submit.
 */
export function useServerFormErrors<T extends FieldValues>(form: UseFormReturn<T>) {
  const errs = useFormErrors();
  const { error, fieldError, topLevelMessage, summary, fromError, clear: clearErrs } = errs;
  // A 409 without a `currentVersion` is a business conflict ("that plate already exists"), not an
  // optimistic-concurrency clash — the API's own message is the useful one, not the generic
  // "this changed since you loaded it".
  const businessConflict =
    error?.problem.category === 'conflict' &&
    error.problem.currentVersion === undefined &&
    !error.fieldErrors.length;

  useEffect(() => {
    if (!error?.fieldErrors.length) return;
    const known = new Set(Object.keys(form.getValues()));
    let focused = false;
    for (const f of error.fieldErrors) {
      if (!known.has(f.path.split('.')[0] ?? f.path)) continue;
      form.setError(
        f.path as Path<T>,
        { type: 'server', message: fieldError(f.path) ?? undefined },
        { shouldFocus: !focused },
      );
      focused = true;
    }
  }, [error, fieldError, form]);

  const known = new Set(Object.keys(form.getValues()));
  const orphaned =
    error?.fieldErrors.some((f) => !known.has(f.path.split('.')[0] ?? f.path)) ?? false;

  const clear = useCallback(() => {
    clearErrs();
    form.clearErrors();
  }, [clearErrs, form]);

  return {
    /** call from a `catch` — non-API errors are rethrown */
    handle: fromError,
    clear,
    /** a message for an `<Alert>`, or `null` when every problem is shown on its field */
    formError:
      (businessConflict ? error?.message : null) ??
      topLevelMessage ??
      (orphaned ? summary.map((s) => s.message).join(' · ') || null : null),
  };
}
