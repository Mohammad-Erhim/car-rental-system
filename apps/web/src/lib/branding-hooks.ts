import type { BrandingResponse } from '@carrental/contracts';
import type { BrandConfig } from '@carrental/theme';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ConfigVersion } from './admin-hooks.js';
import { apiFetch } from './api.js';

/** STAGE-009 (DEC-025) — the `branding` config-version rides the generic config workflow. */
export const BRANDING_KIND = 'branding';
export const BRANDING_KEY = 'default';

/** Public — the currently published brand config (or the built-in default). */
export function usePublishedBranding() {
  return useQuery({
    queryKey: ['meta', 'branding'],
    queryFn: ({ signal }) =>
      apiFetch<BrandingResponse>('/meta/branding', { signal, anonymous: true }),
    staleTime: 60_000,
  });
}

export function useBrandingVersions() {
  const qs = new URLSearchParams({ kind: BRANDING_KIND, key: BRANDING_KEY });
  return useQuery({
    queryKey: ['ops', 'config-versions', BRANDING_KIND, BRANDING_KEY],
    queryFn: ({ signal }) => apiFetch<ConfigVersion[]>(`/ops/config/versions?${qs}`, { signal }),
  });
}

export function useDraftBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { payload: BrandConfig; note?: string }) =>
      apiFetch<ConfigVersion>('/ops/config/versions', {
        method: 'POST',
        body: { kind: BRANDING_KIND, key: BRANDING_KEY, ...body },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'config-versions'] }),
  });
}

export function useBrandingPreview() {
  return useMutation({
    mutationFn: (payload: BrandConfig) =>
      apiFetch<{ examples: string[]; aaClean?: boolean }>('/ops/config/versions/preview', {
        method: 'POST',
        body: { kind: BRANDING_KIND, payload },
      }),
  });
}

export function useBrandingTransition() {
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
      qc.invalidateQueries({ queryKey: ['meta', 'branding'] });
    },
  });
}
