import type { MediaPickerItem } from '@carrental/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api.js';

export interface MediaItem extends MediaPickerItem {
  id: string;
  ownerType: string;
  ownerId: string | null;
  sizeBytes: number;
  createdAt: string;
}

const MEDIA_KEY = ['ops', 'media'];

export function useMediaLibrary(filter: { purpose?: string; ownerType?: string } = {}) {
  const qs = new URLSearchParams();
  if (filter.purpose) qs.set('purpose', filter.purpose);
  if (filter.ownerType) qs.set('ownerType', filter.ownerType);
  return useQuery({
    queryKey: [...MEDIA_KEY, filter],
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
