import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api.js';

/**
 * FR-IAM-008 — the privacy queue (DEC-041). Customers file access / correction / closure requests
 * from their account; staff review and complete or reject them here. Completing a closure erases
 * the person's account data for good, so it asks for a fresh password (the shared step-up prompt).
 */

export type PrivacyKind = 'access' | 'correction' | 'closure';
export type PrivacyStatus =
  | 'received'
  | 'in_review'
  | 'blocked'
  | 'completed'
  | 'rejected'
  | 'cancelled';

/** what stops a closure right now — `code` picks the translated line, `count` fills it in */
export interface PrivacyBlocker {
  code: string;
  detail: string;
  count?: number;
}

export interface PrivacyRequestRow {
  id: string;
  kind: PrivacyKind;
  status: PrivacyStatus;
  blockers: PrivacyBlocker[];
  /** what the customer wrote when they filed it */
  detail: string | null;
  /** staff's reply: what was done, or why not */
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  /** the day a reply is due — one month from filing */
  dueAt: string;
  overdue: boolean;
  exportReady: boolean;
  /** the email is masked: enough to recognise the person, not to use the address */
  customer: { accountId: string; name: string; email: string | null };
}

export interface PrivacyRequestDetail extends PrivacyRequestRow {
  /** for an access request: how many records each part of the download holds */
  exportSummary: Record<string, number> | null;
}

export interface PrivacyList {
  items: PrivacyRequestRow[];
  total: number;
  page: number;
  pageSize: number;
}

const KEY = ['ops', 'privacy-requests'] as const;

export function usePrivacyRequests(params: {
  /** `open` = received, in review or blocked */
  status?: string;
  kind?: string;
  page: number;
  pageSize: number;
}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.kind) qs.set('kind', params.kind);
  qs.set('page', String(params.page));
  qs.set('pageSize', String(params.pageSize));
  return useQuery({
    queryKey: [...KEY, 'list', params],
    queryFn: ({ signal }) => apiFetch<PrivacyList>(`/ops/privacy-requests?${qs}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function usePrivacyRequest(id: string | null, enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: ({ signal }) =>
      apiFetch<PrivacyRequestDetail>(`/ops/privacy-requests/${id}`, { signal }),
    enabled: enabled && !!id,
  });
}

function useAction<TBody extends object>(action: 'review' | 'complete' | 'reject') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string } & TBody) => {
      const { id, ...body } = input;
      return apiFetch<PrivacyRequestRow>(`/ops/privacy-requests/${id}/${action}`, {
        method: 'POST',
        body,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export const useReviewPrivacyRequest = () => useAction<object>('review');
export const useCompletePrivacyRequest = () => useAction<{ note?: string }>('complete');
export const useRejectPrivacyRequest = () => useAction<{ note: string }>('reject');
