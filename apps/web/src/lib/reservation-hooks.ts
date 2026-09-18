import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  assignedRentalRef: string | null;
  /** SCREEN-CUS-003b — the specific car the customer picked before checkout, if any. `assign()`
   *  honors it best-effort and falls back to auto-pick if it's no longer viable. */
  pickedUnit: { id: string; plate: string; make: string | null; model: string | null } | null;
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

function invalidateReservation(qc: ReturnType<typeof useQueryClient>, reference: string) {
  void qc.invalidateQueries({ queryKey: ['reservation', reference] });
  void qc.invalidateQueries({ queryKey: ['booking', 'mine'] });
  void qc.invalidateQueries({ queryKey: ['ops', 'reservations'] });
}

export function useCancelReservation(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { reasonCode?: string; note?: string }) =>
      apiFetch<ReservationDetail & { refundMinor: number; feeMinor: number }>(
        `/reservations/${reference}/cancel`,
        { method: 'POST', body },
      ),
    onSuccess: () => invalidateReservation(qc, reference),
  });
}

/** Staff-only: mark a confirmed reservation as a no-show (SCREEN-OPS-004). */
export function useNoShowReservation(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { note?: string } = {}) =>
      apiFetch<ReservationDetail>(`/ops/reservations/${reference}/no-show`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => invalidateReservation(qc, reference),
  });
}

/** Staff-only: a standalone goodwill/dispute-resolution refund, independent of cancel/modify. */
export function useManualRefund(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { amountMinor: number; note: string }) =>
      apiFetch<ReservationDetail>(`/ops/reservations/${reference}/refund`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => invalidateReservation(qc, reference),
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
    onSuccess: () => invalidateReservation(qc, reference),
  });
}

export interface OpsReservationRow {
  reference: string;
  state: string;
  channel: string;
  categoryCode: string;
  pickupLocationCode: string;
  returnLocationCode: string;
  pickupAt: string;
  returnAt: string;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  driverName: string | null;
  /** the rental this reservation was turned into, if any */
  assignedRentalRef: string | null;
  /** the specific car the customer picked before checkout, if any (SCREEN-CUS-003b) — honored
   *  best-effort by assign(), never binding until staff actually confirms it. */
  pickedUnit: { id: string; plate: string; make: string | null; model: string | null } | null;
}

export interface OpsReservationList {
  view: 'queue' | 'all';
  page: number;
  pageSize: number;
  /** rows on this page */
  count: number;
  /** rows matching the current view + filters */
  total: number;
  pageCount: number;
  /** bookings needing action in the actor's scope, whatever the view/filters — for the tab badge */
  queueCount: number;
  results: OpsReservationRow[];
}

export interface OpsReservationFilter {
  view?: 'queue' | 'all';
  state?: string;
  locationCode?: string;
  from?: string;
  to?: string;
  /** 1-based */
  page?: number;
  pageSize?: number;
}

export function useOpsReservations(filter: OpsReservationFilter) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) qs.set(k, String(v));
  return useQuery({
    queryKey: ['ops', 'reservations', filter],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch<OpsReservationList>(`/ops/reservations${qs.toString() ? `?${qs}` : ''}`, { signal }),
  });
}
