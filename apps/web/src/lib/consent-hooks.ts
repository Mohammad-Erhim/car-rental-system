import type { ConsentConfig, ConsentLogEntry, ConsentLogResponse } from '@carrental/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from './api.js';
import { createConfigWorkflowHooks } from './config-workflow-hooks.js';

/** The `consent` config-version rides the generic draft → submit → approve workflow. */
export const CONSENT_KIND = 'consent';
export const CONSENT_KEY = 'default';

const hooks = createConfigWorkflowHooks<ConsentConfig>(CONSENT_KIND, CONSENT_KEY);

export const usePublishedConsent = hooks.usePublished;
export const useConsentVersions = hooks.useVersions;
export const useDraftConsent = hooks.useDraft;
export const useConsentPreview = hooks.usePreview;
export const useConsentTransition = hooks.useTransition;

export interface ConsentLogQuery {
  from?: string;
  to?: string;
  action?: string;
  /** the visitor's own opaque consent-cookie id — narrows the trail to one data subject, for a
   *  GDPR Art. 7 accountability dispute or subject-access request */
  anonymousId?: string;
  limit?: number;
  /** Keyset pagination, not offset — see `consent.service.ts#log` for why: an offset page costs
   *  the database an O(N) walk past every row before it, which only gets worse as a compliance
   *  log grows. A cursor costs the same as page one at any depth. */
  cursor?: string;
}

export function useConsentLog(query: ConsentLogQuery) {
  const qs = new URLSearchParams();
  if (query.from) qs.set('from', query.from);
  if (query.to) qs.set('to', query.to);
  if (query.action) qs.set('action', query.action);
  if (query.anonymousId) qs.set('anonymousId', query.anonymousId);
  qs.set('limit', String(query.limit ?? 50));
  if (query.cursor) qs.set('cursor', query.cursor);
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
    mutationFn: async (filters: {
      from?: string;
      to?: string;
      action?: string;
      anonymousId?: string;
    }) => {
      const entries: ConsentLogEntry[] = [];
      let cursor: string | undefined;
      let total = Infinity;
      while (entries.length < total && entries.length < EXPORT_CAP) {
        const qs = new URLSearchParams();
        if (filters.from) qs.set('from', filters.from);
        if (filters.to) qs.set('to', filters.to);
        if (filters.action) qs.set('action', filters.action);
        if (filters.anonymousId) qs.set('anonymousId', filters.anonymousId);
        qs.set('limit', String(EXPORT_PAGE));
        if (cursor) qs.set('cursor', cursor);
        const page = await apiFetch<ConsentLogResponse>(`/ops/consent/log?${qs}`);
        entries.push(...page.entries);
        total = page.total;
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      return { entries, truncated: entries.length < total };
    },
  });
}
