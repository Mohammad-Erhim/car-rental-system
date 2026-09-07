import type { FieldErrorItem } from '@carrental/ui';
import { useCallback, useMemo, useState } from 'react';

import { ApiError } from './api.js';

/** Map an ApiError's field errors + a top-level message into a form-friendly shape (COMP-SH-005). */
export function useFormErrors(fieldLabels: Record<string, string> = {}) {
  const [error, setError] = useState<ApiError | null>(null);

  const fromError = useCallback((e: unknown) => {
    setError(e instanceof ApiError ? e : null);
    if (!(e instanceof ApiError)) throw e; // rethrow non-API errors
  }, []);

  const clear = useCallback(() => setError(null), []);

  const summary = useMemo<FieldErrorItem[]>(() => {
    if (!error) return [];
    if (error.fieldErrors.length) {
      return error.fieldErrors.map((f) => ({
        id: `field-${f.path.replace(/\W+/g, '-')}`,
        message: `${fieldLabels[f.path] ?? humanize(f.path)}: ${errorText(f.code, f.params)}`,
      }));
    }
    return [{ id: 'form-error', message: error.message }];
  }, [error, fieldLabels]);

  const fieldError = useCallback(
    (path: string): string | null => {
      const f = error?.fieldErrors.find((x) => x.path === path);
      return f ? errorText(f.code, f.params) : null;
    },
    [error],
  );

  const topLevelMessage = error && !error.fieldErrors.length ? error.message : null;

  return { error, summary, fieldError, topLevelMessage, fromError, clear };
}

function humanize(path: string): string {
  const last = path.split('.').pop() ?? path;
  return last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase());
}

function errorText(code: string, params?: Record<string, unknown>): string {
  switch (code) {
    case 'required':
    case 'invalid_type':
      return 'This is required';
    case 'incorrect':
      return 'This value is not correct';
    case 'too_small':
      return 'This value is too short';
    case 'invalid_string':
    case 'invalid_email':
      return 'Enter a valid value';
    case 'expired':
      return 'This has expired — request a new one';
    case 'used':
      return 'This was already used';
    case 'unsupported':
      return 'This option is not available';
    case 'unknown_role':
      return 'Unknown role';
    default:
      return params?.expected ? `Expected ${String(params.expected)}` : 'Please check this value';
  }
}
