import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

/** Writes to one reference-data type. Every success refreshes all reference-data queries. */
export function useLookupMutations(typeCode: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['reference-data'] });

  const setActive = useMutation({
    mutationFn: (input: { id: string; active: boolean; force?: boolean }) =>
      apiFetch(
        `/reference-data/types/${typeCode}/values/${input.id}/${input.active ? 'restore' : 'deactivate'}${
          input.force ? '?force=true' : ''
        }`,
        { method: 'POST' },
      ),
    onSuccess: refresh,
  });

  const reorder = useMutation({
    mutationFn: (order: Array<{ id: string; sortOrder: number }>) =>
      apiFetch(`/reference-data/types/${typeCode}/reorder`, { method: 'POST', body: { order } }),
    onSuccess: refresh,
  });

  const create = useMutation({
    mutationFn: (body: {
      code: string;
      label: string;
      translations: Record<string, string>;
      isDefault: boolean;
    }) => apiFetch(`/reference-data/types/${typeCode}/values`, { method: 'POST', body }),
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: (input: {
      id: string;
      version: number;
      label: string;
      translations: Record<string, string>;
      isDefault: boolean;
    }) =>
      apiFetch(`/reference-data/types/${typeCode}/values/${input.id}`, {
        method: 'POST',
        body: { label: input.label, translations: input.translations, isDefault: input.isDefault },
        ifMatch: input.version,
      }),
    onSuccess: refresh,
  });

  return { setActive, reorder, create, update };
}
