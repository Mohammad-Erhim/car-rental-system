import { useI18n } from '@carrental/i18n/react';
import { useCallback, useMemo, useState } from 'react';

import { ApiError } from '../query-client';

/** Map a zod / `nestjs-zod` field-error sub-code to an `error.field.*` catalogue key. Mirrors
 *  `@carrental/client/react`'s `use-form-errors.ts` mapping table — keep both in sync. */
function codeKey(code: string): string {
  switch (code) {
    case 'required':
    case 'invalid_type':
      return 'error.field.required';
    case 'incorrect':
      return 'error.field.incorrect';
    case 'too_small':
      return 'error.field.tooShort';
    case 'invalid':
    case 'invalid_string':
    case 'invalid_email':
      return 'error.field.invalid';
    case 'must_be_positive':
      return 'error.field.mustBePositive';
    case 'must_be_non_negative_number':
      return 'error.field.mustBeNonNegative';
    case 'out_of_range':
      return 'error.field.outOfRange';
    case 'unknown_field':
      return 'error.field.unknownField';
    case 'unknown_policy_key':
      return 'error.field.unknownKey';
    case 'before_from':
      return 'error.field.beforeFrom';
    case 'less_than_min':
    case 'incomplete':
      return 'error.field.invalid';
    case 'duplicate':
      return 'error.field.used';
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

function humanize(path: string): string {
  const last = path.split('.').pop() ?? path;
  return last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase());
}

export interface LocalFieldIssue {
  path: string;
  code: string;
  params?: Record<string, unknown>;
}

export interface FieldErrorItem {
  id: string;
  message: string;
}

export function useFormErrors(fieldLabels: Record<string, string> = {}) {
  const { t } = useI18n();
  const [error, setError] = useState<ApiError | null>(null);
  const [local, setLocalState] = useState<LocalFieldIssue[]>([]);

  const errorText = useCallback(
    (code: string, params?: Record<string, unknown>): string => {
      const key = codeKey(code);
      if (key) return t(key);
      if (params?.expected) return t('error.field.expected', { expected: String(params.expected) });
      return t('error.field.generic');
    },
    [t],
  );

  const topLevelText = useCallback(
    (e: ApiError): string => {
      const byCat: Record<string, string> = {
        conflict: 'error.conflict',
        authorization: 'error.forbidden',
        not_found: 'error.notFound',
        rate_limit: 'error.rateLimited',
      };
      const k = byCat[e.problem.category];
      return k ? t(k) : e.message;
    },
    [t],
  );

  const fromError = useCallback((e: unknown) => {
    setLocalState([]);
    setError(e instanceof ApiError ? e : null);
    if (!(e instanceof ApiError)) throw e;
  }, []);

  const setLocal = useCallback((issues: LocalFieldIssue[]) => {
    setError(null);
    setLocalState(issues);
  }, []);

  const clear = useCallback(() => {
    setError(null);
    setLocalState([]);
  }, []);

  const labelsKey = JSON.stringify(fieldLabels);
  const localKey = JSON.stringify(local);
  const summary = useMemo<FieldErrorItem[]>(() => {
    const labels = JSON.parse(labelsKey) as Record<string, string>;
    const localIssues = JSON.parse(localKey) as LocalFieldIssue[];
    if (localIssues.length) {
      return localIssues.map((f) => ({
        id: `field-${f.path.replace(/\W+/g, '-')}`,
        message: `${labels[f.path] ?? humanize(f.path)}: ${errorText(f.code, f.params)}`,
      }));
    }
    if (!error) return [];
    if (error.fieldErrors.length) {
      return error.fieldErrors.map((f) => ({
        id: `field-${f.path.replace(/\W+/g, '-')}`,
        message: `${labels[f.path] ?? humanize(f.path)}: ${errorText(f.code, f.params)}`,
      }));
    }
    return [{ id: 'form-error', message: topLevelText(error) }];
  }, [error, labelsKey, localKey, errorText, topLevelText]);

  const fieldError = useCallback(
    (path: string): string | null => {
      const l = local.find((x) => x.path === path);
      if (l) return errorText(l.code, l.params);
      const f = error?.fieldErrors.find((x) => x.path === path);
      return f ? errorText(f.code, f.params) : null;
    },
    [error, local, errorText],
  );

  const topLevelMessage = error && !error.fieldErrors.length ? topLevelText(error) : null;

  return { error, summary, fieldError, topLevelMessage, fromError, setLocal, clear };
}
