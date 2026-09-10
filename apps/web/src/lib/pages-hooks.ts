import type { BrandAssetUploadResponse, PagesConfig, PagesResponse } from '@carrental/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ConfigVersion } from './admin-hooks.js';
import { apiFetch } from './api.js';
import { useWorkflowError } from './use-workflow-error.js';

/** The `pages` config-version rides the generic draft → submit → approve workflow. */
export const PAGES_KIND = 'pages';
export const PAGES_KEY = 'default';

/** Public — the currently published page config (or the built-in default). */
export function usePublishedPages() {
  return useQuery({
    queryKey: ['meta', 'pages'],
    queryFn: ({ signal }) => apiFetch<PagesResponse>('/meta/pages', { signal, anonymous: true }),
    staleTime: 60_000,
  });
}

export function usePagesVersions() {
  const qs = new URLSearchParams({ kind: PAGES_KIND, key: PAGES_KEY });
  return useQuery({
    queryKey: ['ops', 'config-versions', PAGES_KIND, PAGES_KEY],
    queryFn: ({ signal }) => apiFetch<ConfigVersion[]>(`/ops/config/versions?${qs}`, { signal }),
  });
}

export function useDraftPages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { payload: PagesConfig; note?: string }) =>
      apiFetch<ConfigVersion>('/ops/config/versions', {
        method: 'POST',
        body: { kind: PAGES_KIND, key: PAGES_KEY, ...body },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'config-versions'] }),
  });
}

export function usePagesPreview() {
  return useMutation({
    mutationFn: (payload: PagesConfig) =>
      apiFetch<{ examples: string[] }>('/ops/config/versions/preview', {
        method: 'POST',
        body: { kind: PAGES_KIND, payload },
      }),
  });
}

export function usePagesTransition() {
  const qc = useQueryClient();
  const onError = useWorkflowError();
  return useMutation({
    onError,
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
      qc.invalidateQueries({ queryKey: ['meta', 'pages'] });
    },
  });
}

/** Upload a page image (hero background / content image); returns an `obj:` ref + a signed URL. */
export function useUploadPageAsset() {
  return useMutation({
    mutationFn: async (input: { purpose: 'heroImage' | 'pageImage'; file: File }) => {
      const dataBase64 = await fileToBase64(input.file);
      return apiFetch<BrandAssetUploadResponse>('/config/branding/assets', {
        method: 'POST',
        body: { purpose: input.purpose, mediaType: input.file.type, dataBase64 },
      });
    },
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(file);
  });
}
