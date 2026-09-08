import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api.js';

export interface ReservationDetail {
  reference: string;
  state: string;
  channel: string;
  categoryCode: string;
  pickupLocationCode: string;
  returnLocationCode: string;
  pickupAt: string;
  returnAt: string;
  durationHours: number;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  refundedMinor: number;
  lines: Array<{
    kind: string;
    code: string;
    label: string;
    quantity: number;
    unitMinor: number;
    amountMinor: number;
  }>;
  drivers: Array<{ role: string; fullName: string; email: string | null }>;
  cancellable: boolean;
  modifiable: boolean;
}

export interface ReservationEvent {
  type: string;
  at: string;
  reasonCode: string | null;
  note: string | null;
  amountDeltaMinor: number;
  actor: string;
}

export function useReservationDetail(reference: string | null) {
  return useQuery({
    queryKey: ['reservation', reference],
    queryFn: ({ signal }) => apiFetch<ReservationDetail>(`/reservations/${reference}`, { signal }),
    enabled: !!reference,
  });
}

export function useReservationHistory(reference: string | null) {
  return useQuery({
    queryKey: ['reservation', reference, 'history'],
    queryFn: ({ signal }) =>
      apiFetch<ReservationEvent[]>(`/reservations/${reference}/history`, { signal }),
    enabled: !!reference,
  });
}

export function useCancelReservation(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { reasonCode?: string; note?: string }) =>
      apiFetch<ReservationDetail & { refundMinor: number; feeMinor: number }>(
        `/reservations/${reference}/cancel`,
        { method: 'POST', body },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reservation', reference] });
      void qc.invalidateQueries({ queryKey: ['booking', 'mine'] });
    },
  });
}

export function useModifyReservation(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      pickupAt?: string;
      returnAt?: string;
      categoryCode?: string;
      paymentToken?: string;
      reasonCode?: string;
    }) =>
      apiFetch<ReservationDetail & { deltaMinor: number }>(`/reservations/${reference}/modify`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservation', reference] }),
  });
}

export function useOpsReservations(filter: { state?: string; locationCode?: string }) {
  const qs = new URLSearchParams();
  if (filter.state) qs.set('state', filter.state);
  if (filter.locationCode) qs.set('locationCode', filter.locationCode);
  return useQuery({
    queryKey: ['ops', 'reservations', filter],
    queryFn: ({ signal }) =>
      apiFetch<
        Array<{
          reference: string;
          state: string;
          channel: string;
          categoryCode: string;
          pickupLocationCode: string;
          pickupAt: string;
          returnAt: string;
          currency: string;
          totalMinor: number;
          paidMinor: number;
        }>
      >(`/ops/reservations${qs.toString() ? `?${qs}` : ''}`, { signal }),
  });
}
