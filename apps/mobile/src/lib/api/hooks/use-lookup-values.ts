import type { LookupValuesResponse } from '@carrental/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { apiFetch } from '../api-fetch';

export interface LookupValuesQuery {
  locale?: string;
  includeInactive?: boolean;
  scopeKey?: string;
}

export function useLookupValues(typeCode: string | null, opts?: LookupValuesQuery) {
  const qs = new URLSearchParams();
  if (opts?.locale) qs.set('locale', opts.locale);
  if (opts?.includeInactive) qs.set('includeInactive', 'true');
  if (opts?.scopeKey) qs.set('scopeKey', opts.scopeKey);
  return useQuery({
    queryKey: ['reference-data', 'values', typeCode, opts ?? null],
    queryFn: ({ signal }) =>
      apiFetch<LookupValuesResponse>(
        `/reference-data/types/${encodeURIComponent(typeCode ?? '')}/values${qs.toString() ? `?${qs}` : ''}`,
        { signal },
      ),
    enabled: !!typeCode,
  });
}

export interface LookupOption {
  code: string;
  label: string;
}

export function useLookupOptions(
  typeCode: string,
  value: string,
  onChange: (code: string) => void,
) {
  const q = useLookupValues(typeCode);
  const options: LookupOption[] = (q.data?.values ?? []).map((v) => ({
    code: v.code,
    label: v.label,
  }));

  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || value || !q.data) return;
    const def = q.data.values.find((v) => v.isDefault);
    if (def) {
      applied.current = true;
      onChange(def.code);
    }
  }, [q.data, value, onChange]);

  return {
    options,
    loading: q.isLoading,
    error: q.isError,
    onRetry: () => void q.refetch(),
  };
}
