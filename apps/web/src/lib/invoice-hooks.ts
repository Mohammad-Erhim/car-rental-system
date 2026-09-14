import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api.js';

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

export interface InvoiceView {
  number: string;
  docVersion: number;
  kind: 'invoice' | 'credit_note';
  previousNumber: string | null;
  reservationReference: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  reason: string | null;
  issuedAt: string;
  snapshot: {
    org: {
      tradingName: string;
      legalName: string;
      taxId: string;
      registeredAddress: Record<string, string>;
    };
    customer: { fullName: string | null; email: string | null };
    trip: {
      categoryCode: string;
      pickupLocationCode: string;
      returnLocationCode: string;
      pickupAt: string;
      returnAt: string;
      pickedUnit: { make: string | null; model: string | null; colour: string | null } | null;
    };
    lines: Array<{
      kind: string;
      code: string;
      label: string;
      quantity: number;
      unitMinor: number;
      amountMinor: number;
    }>;
  };
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
