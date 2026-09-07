import type { SeoConfig, SeoResponse } from '@carrental/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ConfigVersion } from './admin-hooks.js';
import { apiFetch } from './api.js';

/** SRS-ADM-006 — the `seo` config-version rides the generic draft → submit → approve workflow. */
export const SEO_KIND = 'seo';
export const SEO_KEY = 'default';

/** Public — the currently published SEO config (or the built-in default). */
export function usePublishedSeo() {
  return useQuery({
    queryKey: ['meta', 'seo'],
    queryFn: ({ signal }) => apiFetch<SeoResponse>('/meta/seo', { signal, anonymous: true }),
    staleTime: 60_000,
  });
}

export function useSeoVersions() {
  const qs = new URLSearchParams({ kind: SEO_KIND, key: SEO_KEY });
  return useQuery({
    queryKey: ['ops', 'config-versions', SEO_KIND, SEO_KEY],
    queryFn: ({ signal }) => apiFetch<ConfigVersion[]>(`/ops/config/versions?${qs}`, { signal }),
  });
}

export function useDraftSeo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { payload: SeoConfig; note?: string }) =>
      apiFetch<ConfigVersion>('/ops/config/versions', {
        method: 'POST',
        body: { kind: SEO_KIND, key: SEO_KEY, ...body },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'config-versions'] }),
  });
}

export function useSeoPreview() {
  return useMutation({
    mutationFn: (payload: SeoConfig) =>
      apiFetch<{ examples: string[] }>('/ops/config/versions/preview', {
        method: 'POST',
        body: { kind: SEO_KIND, payload },
      }),
  });
}

export function useSeoTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string;
      action: 'submit' | 'approve' | 'reject';
      note?: string;
    }) =>
      apiFetch<ConfigVersion>(`/ops/config/versions/${id}/${action}`, {
        method: 'POST',
        body: action === 'reject' ? { note: note ?? '' } : {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ops', 'config-versions'] });
      qc.invalidateQueries({ queryKey: ['meta', 'seo'] });
    },
  });
}
