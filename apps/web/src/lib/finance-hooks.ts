import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api.js';

/**
 * SCREEN-OPS-036/037 — recovery cases & payment reconciliation (FR-INT-002, FR-PAY-009).
 * Read + resolve already existed on the API since STAGE-004/006; this adds the retry action
 * and the first UI for the surface.
 */

export interface RecoveryCase {
  id: string;
  kind: string;
  severity: string;
  state: 'open' | 'in_progress' | 'resolved';
  subjectType: string;
  subjectRef: string;
  summary: string;
  detail: {
    retryCount?: number;
    lastRetryAt?: string;
    lastRetryOutcome?: string;
    [k: string]: unknown;
  } | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface ReconciliationException {
  id: string;
  reservationReference: string | null;
  intentId: string | null;
  kind: string;
  ledgerAmountMinor: number | null;
  providerAmountMinor: number | null;
  /** ledger − provider, when both are known */
  deltaMinor: number | null;
  currency: string;
  state: 'open' | 'resolved';
  createdAt: string;
}

export interface CaseRetryResult {
  id: string;
  state: string;
  outcome: 'resolved' | 'still_open';
  retryCount: number;
}

const CASES_KEY = ['ops', 'recovery-cases'];
const EXC_KEY = ['ops', 'reconciliation-exceptions'];

export function useRecoveryCases() {
  return useQuery({
    queryKey: CASES_KEY,
    queryFn: ({ signal }) => apiFetch<RecoveryCase[]>('/ops/cases', { signal }),
  });
}

export function useRetryCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<CaseRetryResult>(`/ops/cases/${id}/retry`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CASES_KEY }),
  });
}

export function useResolveCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; note: string }) =>
      apiFetch(`/ops/cases/${input.id}/resolve`, { method: 'POST', body: { note: input.note } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CASES_KEY }),
  });
}

export function useReconciliationExceptions() {
  return useQuery({
    queryKey: EXC_KEY,
    queryFn: ({ signal }) =>
      apiFetch<ReconciliationException[]>('/ops/payments/reconciliation', { signal }),
  });
}

export function useRunReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ exceptionsOpened: number }>('/ops/payments/reconciliation/run', {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: EXC_KEY }),
  });
}

export function useResolveException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; note: string }) =>
      apiFetch(`/ops/payments/reconciliation/${input.id}/resolve`, {
        method: 'POST',
        body: { note: input.note },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: EXC_KEY }),
  });
}
