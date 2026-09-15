import type { InvoiceView } from '@carrental/client/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api.js';

// `InvoiceView` is shared with `apps/site` (byte-identical shape, different endpoint per app) —
// it lives in `@carrental/client/react`. Re-exported here so existing ops imports keep working.
export type { InvoiceView };

export interface LegalProfile {
  legalName: string | null;
  taxId: string | null;
  registeredAddress: Record<string, string> | null;
  version: number;
}

export interface LegalProfileInput {
  legalName: string;
  taxId: string;
  registeredAddress: Record<string, string>;
}

const LEGAL_PROFILE_KEY = ['ops', 'organization', 'legal'];

export function useLegalProfile() {
  return useQuery({
    queryKey: LEGAL_PROFILE_KEY,
    queryFn: ({ signal }) => apiFetch<LegalProfile>('/ops/organization/legal', { signal }),
  });
}

export function useUpdateLegalProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ifMatch, ...body }: LegalProfileInput & { ifMatch?: number }) =>
      apiFetch<LegalProfile>('/ops/organization/legal', { method: 'POST', body, ifMatch }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: LEGAL_PROFILE_KEY }),
  });
}

export function useOpsInvoices(reference: string | null) {
  return useQuery({
    queryKey: ['ops', 'reservations', reference, 'invoices'],
    queryFn: ({ signal }) =>
      apiFetch<InvoiceView[]>(`/ops/reservations/${reference}/invoices`, { signal }),
    enabled: !!reference,
  });
}
