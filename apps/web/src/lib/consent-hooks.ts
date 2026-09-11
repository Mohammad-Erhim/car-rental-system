import type {
  ConsentConfig,
  ConsentConfigResponse,
  ConsentLogEntry,
  ConsentLogResponse,
} from '@carrental/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ConfigVersion } from './admin-hooks.js';
import { apiFetch } from './api.js';
import { useWorkflowError } from './use-workflow-error.js';

/** The `consent` config-version rides the generic draft → submit → approve workflow. */
export const CONSENT_KIND = 'consent';
export const CONSENT_KEY = 'default';

export function usePublishedConsent() {
  return useQuery({
    queryKey: ['meta', 'consent'],
    queryFn: ({ signal }) =>
      apiFetch<ConsentConfigResponse>('/meta/consent', { signal, anonymous: true }),
    staleTime: 60_000,
  });
}

export function useConsentVersions() {
  const qs = new URLSearchParams({ kind: CONSENT_KIND, key: CONSENT_KEY });
  return useQuery({
    queryKey: ['ops', 'config-versions', CONSENT_KIND, CONSENT_KEY],
    queryFn: ({ signal }) => apiFetch<ConfigVersion[]>(`/ops/config/versions?${qs}`, { signal }),
  });
}

export function useDraftConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { payload: ConsentConfig; note?: string }) =>
      apiFetch<ConfigVersion>('/ops/config/versions', {
        method: 'POST',
        body: { kind: CONSENT_KIND, key: CONSENT_KEY, ...body },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'config-versions'] }),
  });
}

export function useConsentPreview() {
  return useMutation({
    mutationFn: (payload: ConsentConfig) =>
      apiFetch<{ examples: string[] }>('/ops/config/versions/preview', {
        method: 'POST',
        body: { kind: CONSENT_KIND, payload },
      }),
  });
}

export function useConsentTransition() {
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
      qc.invalidateQueries({ queryKey: ['meta', 'consent'] });
    },
  });
}

export interface ConsentLogQuery {
  from?: string;
  to?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export function useConsentLog(query: ConsentLogQuery) {
  const qs = new URLSearchParams();
  if (query.from) qs.set('from', query.from);
  if (query.to) qs.set('to', query.to);
  if (query.action) qs.set('action', query.action);
  qs.set('limit', String(query.limit ?? 50));
  qs.set('offset', String(query.offset ?? 0));
  return useQuery({
    queryKey: ['ops', 'consent-log', query],
    queryFn: ({ signal }) => apiFetch<ConsentLogResponse>(`/ops/consent/log?${qs}`, { signal }),
  });
}

const EXPORT_PAGE = 200; // server-side max for a single page (zLogQuery limit)
const EXPORT_CAP = 20_000; // sanity cap so a runaway filter can't hang the browser tab

/**
 * CSV export must cover every event matching the current filter, not just the 50-row page on
 * screen — a GDPR accountability export that silently only contains "whatever happened to be
 * showing" is the same class of bug as the backend's own aggregation being page/scan-capped
 * (see consent.service.ts). Pages through the already-correct, SQL-paginated `/ops/consent/log`
 * at the server's own max page size until either everything matching is fetched or EXPORT_CAP is
 * hit — `truncated` tells the caller to disclose that rather than silently ship a partial file.
 */
export function useConsentLogExport() {
  return useMutation({
    mutationFn: async (filters: { from?: string; to?: string; action?: string }) => {
      const entries: ConsentLogEntry[] = [];
      let offset = 0;
      let total = Infinity;
      while (offset < total && entries.length < EXPORT_CAP) {
        const qs = new URLSearchParams();
        if (filters.from) qs.set('from', filters.from);
        if (filters.to) qs.set('to', filters.to);
        if (filters.action) qs.set('action', filters.action);
        qs.set('limit', String(EXPORT_PAGE));
        qs.set('offset', String(offset));
        const page = await apiFetch<ConsentLogResponse>(`/ops/consent/log?${qs}`);
        entries.push(...page.entries);
        total = page.total;
        offset += EXPORT_PAGE;
        if (!page.entries.length) break;
      }
      return { entries, truncated: entries.length < total };
    },
  });
}
