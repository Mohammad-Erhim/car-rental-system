import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api.js';

export interface MediaItem {
  ref: string;
  url: string;
  purpose: string;
  mediaType: string;
  id: string;
  ownerType: string;
  ownerId: string | null;
  sizeBytes: number;
  createdAt: string;
}

const MEDIA_KEY = ['ops', 'media'];

export function useMediaLibrary(
  filter: { purpose?: string; ownerType?: string } = {},
  enabled = true,
) {
  const qs = new URLSearchParams();
  if (filter.purpose) qs.set('purpose', filter.purpose);
  if (filter.ownerType) qs.set('ownerType', filter.ownerType);
  return useQuery({
    queryKey: [...MEDIA_KEY, filter],
    enabled,
    queryFn: ({ signal }) =>
      apiFetch<MediaItem[]>(`/ops/media${qs.toString() ? `?${qs}` : ''}`, { signal }),
  });
}

export function useUploadMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      purpose: string;
      ownerType?: string;
      ownerId?: string;
      dataBase64: string;
      mediaType: string;
    }) => apiFetch<MediaItem>('/ops/media', { method: 'POST', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: MEDIA_KEY }),
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/ops/media/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: MEDIA_KEY }),
  });
}

export interface MediaPage {
  items: MediaItem[];
  page: number;
  pageSize: number;
  count: number;
  total: number;
  pageCount: number;
  /** how many items each purpose holds, across the whole library */
  purposeCounts: Array<{ purpose: string; count: number }>;
}

/** One page of the library for the media page; the previous page stays while the next loads. */
export function useMediaBrowse(params: { purpose?: string; page: number; pageSize: number }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
  if (params.purpose) qs.set('purpose', params.purpose);
  return useQuery({
    queryKey: [...MEDIA_KEY, 'browse', params],
    queryFn: ({ signal }) => apiFetch<MediaPage>(`/ops/media/browse?${qs}`, { signal }),
    placeholderData: keepPreviousData,
  });
}
