import { useI18n } from '@carrental/i18n/react';
import type { FieldErrorItem } from '@carrental/ui';
import { useCallback, useMemo, useState } from 'react';

import { ApiError } from './api.js';

/** Map a zod/`nestjs-zod` field-error code to an `error.field.*` key. */
function codeKey(code: string): string {
  switch (code) {
    case 'required':
    case 'invalid_type':
      return 'error.field.required';
    case 'incorrect':
      return 'error.field.incorrect';
    case 'too_small':
      return 'error.field.tooShort';
    case 'invalid_string':
    case 'invalid_email':
      return 'error.field.invalid';
    case 'expired':
      return 'error.field.expired';
    case 'used':
      return 'error.field.used';
    case 'unsupported':
      return 'error.field.unsupported';
    case 'unknown_role':
      return 'error.field.unknownRole';
    default:
      return '';
  }
}

/** Map an ApiError's field errors + a top-level message into a form-friendly shape (COMP-SH-005).
 *  Per-code text comes from the i18n `error.field.*` catalogue (en/ar/fr, DEC-024). */
export function useFormErrors(fieldLabels: Record<string, string> = {}) {
  const { t } = useI18n();
  const [error, setError] = useState<ApiError | null>(null);

  const errorText = useCallback(
    (code: string, params?: Record<string, unknown>): string => {
      const key = codeKey(code);
      if (key) return t(key);
      if (params?.expected) return t('error.field.expected', { expected: String(params.expected) });
      return t('error.field.generic');
    },
    [t],
  );

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
  }, [error, fieldLabels, errorText]);

  const fieldError = useCallback(
    (path: string): string | null => {
      const f = error?.fieldErrors.find((x) => x.path === path);
      return f ? errorText(f.code, f.params) : null;
    },
    [error, errorText],
  );

  const topLevelMessage = error && !error.fieldErrors.length ? error.message : null;

  return { error, summary, fieldError, topLevelMessage, fromError, clear };
}

function humanize(path: string): string {
  const last = path.split('.').pop() ?? path;
  return last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase());
}
