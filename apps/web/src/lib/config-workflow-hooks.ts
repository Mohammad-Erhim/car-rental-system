import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ConfigVersion } from './admin-hooks.js';
import { apiFetch } from './api.js';
import { useWorkflowError } from './use-workflow-error.js';

/** Shared response shape of every `GET /meta/<kind>` config endpoint (branding/seo/pages/consent
 *  all share this exact `{ config, revision, updatedAt }` zod schema in `@carrental/contracts` —
 *  `revision: 0` means nothing has ever been published, so it's serving the built-in default). */
export interface PublishedConfig<TConfig> {
  config: TConfig;
  revision: number;
  updatedAt: string | null;
}

/**
 * `usePublishedX`/`useXVersions`/`useDraftX`/`useXPreview`/`useXTransition` — the same five-hook
 * shape re-implemented independently in `branding-hooks.ts`, `consent-hooks.ts`, `pages-hooks.ts`
 * and `seo-hooks.ts` with only `kind`/`key`/the payload type swapped (SRS-ADM-006 / DEC-025: a
 * config-version rides draft → submit → approve, one *different* reviewer required to publish).
 * Each of those files now just calls this factory and re-exports its named hooks — a change to
 * the workflow (a new step, a different invalidation) needs to happen in exactly one place.
 */
export function createConfigWorkflowHooks<TConfig, TPreview = { examples: string[] }>(
  kind: string,
  key: string,
) {
  function usePublished() {
    return useQuery({
      queryKey: ['meta', kind],
      queryFn: ({ signal }) =>
        apiFetch<PublishedConfig<TConfig>>(`/meta/${kind}`, { signal, anonymous: true }),
      staleTime: 60_000,
    });
  }

  function useVersions() {
    const qs = new URLSearchParams({ kind, key });
    return useQuery({
      queryKey: ['ops', 'config-versions', kind, key],
      queryFn: ({ signal }) => apiFetch<ConfigVersion[]>(`/ops/config/versions?${qs}`, { signal }),
    });
  }

  function useDraft() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (body: { payload: TConfig; note?: string }) =>
        apiFetch<ConfigVersion>('/ops/config/versions', {
          method: 'POST',
          body: { kind, key, ...body },
        }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'config-versions'] }),
    });
  }

  function usePreview() {
    return useMutation({
      mutationFn: (payload: TConfig) =>
        apiFetch<TPreview>('/ops/config/versions/preview', {
          method: 'POST',
          body: { kind, payload },
        }),
    });
  }

  function useTransition() {
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
        qc.invalidateQueries({ queryKey: ['meta', kind] });
      },
    });
  }

  return { usePublished, useVersions, useDraft, usePreview, useTransition };
}
